import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI, Type } from '@google/genai';
import { Question, QuestionOption, QuestionDifficulty } from './interfaces/question.interface';
import { LOCAL_QUESTIONS_BANK } from './data/local-questions-bank';

@Injectable()
export class QuestionsService {
  private readonly logger = new Logger(QuestionsService.name);
  private aiClient: GoogleGenAI | null = null;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (apiKey && apiKey.trim().length > 0) {
      this.aiClient = new GoogleGenAI({ apiKey });
      this.logger.log('Cliente de Gemini AI inicializado con éxito.');
    } else {
      this.logger.warn('GEMINI_API_KEY no configurada en .env. Se usará el banco de respaldo local (Regla R5).');
    }
  }

  /**
   * Genera o recupera un pool de 15 preguntas validadas según Regla R4.
   * Si Gemini falla o excede cuota, recurre al banco local (Regla R5).
   */
  async generateQuestionsPool(tema: string): Promise<Question[]> {
    if (this.aiClient) {
      try {
        this.logger.log(`Solicitando 15 preguntas a Gemini con JSON estructurado para el tema: "${tema}"`);
        const questionsFromAI = await Promise.race([
          this.fetchQuestionsFromGemini(tema),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Timeout de 25s esperando respuesta de Gemini AI')), 25000),
          ),
        ]);

        // Regla R4: Validar estrictamente el formato recibido antes de aceptarlo
        if (this.validateQuestionsBatch(questionsFromAI)) {
          this.logger.log(`✓ 15 preguntas generadas y validadas exitosamente con Gemini AI para "${tema}"`);
          return questionsFromAI;
        } else {
          this.logger.warn('Las preguntas de Gemini no cumplieron con la validación estricta R4. Activando respaldo local (R5).');
        }
      } catch (error: any) {
        // Regla R5: Los fallos de IA no detienen el juego
        this.logger.error(`Fallo en la llamada a Gemini AI (${error.message}). Activando banco de respaldo local (R5).`);
      }
    }

    return this.getFallbackQuestions(tema);
  }

  /**
   * Alias de conveniencia para generar el lote de preguntas
   */
  async generateQuestionsBatch(tema: string, count = 15): Promise<Question[]> {
    return this.generateQuestionsPool(tema);
  }

  /**
   * Llamada a Gemini en modo estructurado (responseSchema) usando el SDK oficial @google/genai
   */
  private async fetchQuestionsFromGemini(tema: string): Promise<Question[]> {
    if (!this.aiClient) throw new Error('Cliente de Gemini no configurado');

    const prompt = `Genera un lote de 15 preguntas técnicas de opción múltiple sobre el tema: "${tema}".
Cada pregunta debe tener:
- Un enunciado claro y conciso (puede incluir sintaxis de código).
- Exactamente 4 opciones etiquetadas como 'A', 'B', 'C' y 'D'.
- Una única respuesta correcta ('A', 'B', 'C' o 'D').
- Nivel de dificultad: 'FACIL', 'MEDIO' o 'DIFICIL'.`;

    const response = await this.aiClient.models.generateContent({
      model: 'gemini-2.5-flash-lite',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              enunciado: { type: Type.STRING },
              opciones: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    texto: { type: Type.STRING },
                  },
                  required: ['id', 'texto'],
                },
              },
              respuestaCorrecta: { type: Type.STRING },
              dificultad: { type: Type.STRING },
            },
            required: ['enunciado', 'opciones', 'respuestaCorrecta', 'dificultad'],
          },
        },
      },
    });

    const responseText = response.text;
    if (!responseText) {
      throw new Error('Respuesta vacía recibida desde Gemini');
    }

    const parsed = JSON.parse(responseText);
    return parsed.map((q: any, index: number) => ({
      id: q.id || `ai-q-${index + 1}`,
      enunciado: q.enunciado.trim(),
      opciones: q.opciones.map((opt: any) => ({
        id: opt.id.toUpperCase().trim() as 'A' | 'B' | 'C' | 'D',
        texto: opt.texto.trim(),
      })),
      respuestaCorrecta: q.respuestaCorrecta.toUpperCase().trim() as 'A' | 'B' | 'C' | 'D',
      dificultad: this.normalizeDifficulty(q.dificultad),
    }));
  }

  /**
   * Valida estrictamente que el lote de preguntas cumpla con la Regla R4
   */
  validateQuestionsBatch(questions: any[]): boolean {
    if (!Array.isArray(questions) || questions.length === 0) return false;

    const validOptionIds = new Set(['A', 'B', 'C', 'D']);
    const validDifficulties = new Set(['FACIL', 'MEDIO', 'DIFICIL']);

    for (const q of questions) {
      // 1. Enunciado presente y no vacío
      if (!q.enunciado || typeof q.enunciado !== 'string' || q.enunciado.trim().length === 0) {
        return false;
      }

      // 2. Exactamente 4 opciones múltiples (A, B, C, D) con texto válido
      if (!Array.isArray(q.opciones) || q.opciones.length !== 4) {
        return false;
      }

      const foundOptionIds = new Set<string>();
      for (const opt of q.opciones) {
        if (!opt.id || !validOptionIds.has(opt.id) || foundOptionIds.has(opt.id)) {
          return false;
        }
        if (!opt.texto || typeof opt.texto !== 'string' || opt.texto.trim().length === 0) {
          return false;
        }
        foundOptionIds.add(opt.id);
      }

      // 3. Única respuesta correcta perteneciente a ['A', 'B', 'C', 'D']
      if (!q.respuestaCorrecta || !validOptionIds.has(q.respuestaCorrecta)) {
        return false;
      }

      // 4. Dificultad válida
      if (!q.dificultad || !validDifficulties.has(q.dificultad)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Normaliza el texto de dificultad a los valores permitidos
   */
  private normalizeDifficulty(diff: string): QuestionDifficulty {
    const upper = (diff || '').toUpperCase().trim();
    if (upper.includes('FACIL') || upper.includes('EASY')) return 'FACIL';
    if (upper.includes('DIFICIL') || upper.includes('HARD')) return 'DIFICIL';
    return 'MEDIO';
  }

  /**
   * Regla R5: Banco de respaldo local ante fallos de IA o falta de API key
   */
  getFallbackQuestions(tema: string): Question[] {
    this.logger.log(`Usando banco de respaldo local para el tema "${tema}" (Regla R5)`);
    const key = Object.keys(LOCAL_QUESTIONS_BANK).find((k) =>
      tema.toLowerCase().includes(k.toLowerCase())
    ) || 'default';

    const bank = LOCAL_QUESTIONS_BANK[key] || LOCAL_QUESTIONS_BANK.default;
    // Retornamos 15 preguntas
    return bank.slice(0, 15);
  }
}
