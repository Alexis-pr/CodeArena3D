export interface QuestionOption {
  id: 'A' | 'B' | 'C' | 'D';
  texto: string;
}

export type QuestionDifficulty = 'FACIL' | 'MEDIO' | 'DIFICIL';

/**
 * Modelo de Pregunta de Trivia según Regla R4 de Gemini.md:
 * - Enunciado
 * - Opciones múltiples (exactamente A, B, C, D)
 * - Única respuesta correcta ('A' | 'B' | 'C' | 'D')
 * - Nivel de dificultad ('FACIL' | 'MEDIO' | 'DIFICIL')
 */
export interface Question {
  id: string;
  enunciado: string;
  opciones: QuestionOption[];
  respuestaCorrecta: 'A' | 'B' | 'C' | 'D';
  dificultad: QuestionDifficulty;
}
