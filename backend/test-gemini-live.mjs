// ============================================================================
// CodeArena 3D — Verificación en Vivo de la API de Gemini (responseSchema)
// ============================================================================

import 'dotenv/config';
import { GoogleGenAI, Type } from '@google/genai';

async function testLiveGemini() {
  console.log('===============================================================');
  console.log('  VERIFICACIÓN EN VIVO: GENERACIÓN DE PREGUNTAS CON GEMINI AI  ');
  console.log('===============================================================\n');

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('❌ GEMINI_API_KEY no encontrada en .env');
    process.exit(1);
  }

  console.log(`✓ API Key detectada (longitud: ${apiKey.length}, prefijo: ${apiKey.slice(0, 7)}...)`);
  const ai = new GoogleGenAI({ apiKey });

  const tema = 'Docker & Contenedores';
  console.log(`[PASO 1] Solicitando preguntas dinámicas sobre: "${tema}"...`);

  const prompt = `Genera un lote de 5 preguntas técnicas de opción múltiple sobre el tema: "${tema}".
Cada pregunta debe tener:
- Un enunciado claro y conciso con conceptos técnicos reales.
- Exactamente 4 opciones etiquetadas como 'A', 'B', 'C' y 'D'.
- Una única respuesta correcta ('A', 'B', 'C' o 'D').
- Nivel de dificultad: 'FACIL', 'MEDIO' o 'DIFICIL'.`;

  const startTime = Date.now();
  const response = await ai.models.generateContent({
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

  const durationMs = Date.now() - startTime;
  console.log(`✓ Respuesta recibida de Gemini en ${durationMs} ms\n`);

  const questions = JSON.parse(response.text);
  console.log(`✓ Total preguntas generadas dinámicamente: ${questions.length}\n`);

  // Validar formato estricto (R4)
  let allValid = true;
  for (const [idx, q] of questions.entries()) {
    const validOptions = q.opciones && q.opciones.length === 4;
    const validCorrect = ['A', 'B', 'C', 'D'].includes(q.respuestaCorrecta?.toUpperCase());
    const validDiff = ['FACIL', 'MEDIO', 'DIFICIL'].includes(q.dificultad?.toUpperCase());
    const validEnunciado = Boolean(q.enunciado && q.enunciado.trim().length > 5);

    if (!validOptions || !validCorrect || !validDiff || !validEnunciado) {
      allValid = false;
      console.error(`❌ Pregunta ${idx + 1} no cumple R4:`, q);
    }
  }

  if (!allValid) {
    console.error('❌ Error de validación de formato R4');
    process.exit(1);
  }

  console.log('🎯 REGLA R4 CUMPLIDA AL 100%: Estructura de responseSchema validada.');
  console.log('🎯 ÍTEM 7 DEL ALCANCE OBLIGATORIO: Generación con IA en tiempo real 100% OPERATIVA.\n');

  console.log('--- PREGUNTAS GENERADAS EN VIVO POR GEMINI ---');
  questions.forEach((q, i) => {
    console.log(`\n${i + 1}. [${q.dificultad?.toUpperCase()}] ${q.enunciado}`);
    q.opciones.forEach((opt) => console.log(`   ${opt.id.toUpperCase()}) ${opt.texto}`));
    console.log(`   👉 Respuesta Correcta: ${q.respuestaCorrecta?.toUpperCase()}`);
  });

  console.log('\n===============================================================');
  console.log('    VERIFICACIÓN CON GEMINI AI REAL COMPLETADA CON ÉXITO       ');
  console.log('===============================================================');
}

testLiveGemini().catch((err) => {
  console.error('Error durante la llamada a Gemini:', err);
  process.exit(1);
});
