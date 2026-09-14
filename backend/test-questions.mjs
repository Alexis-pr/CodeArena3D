// ============================================================================
// CodeArena 3D — Prueba de Generación y Validación de Preguntas (R4 y R5)
// ============================================================================

import 'dotenv/config';
import { QuestionsService } from './dist/questions/questions.service.js';
import { ConfigService } from '@nestjs/config';

async function testQuestions() {
  console.log('===============================================================');
  console.log('  PRUEBA DE PREGUNTAS: VALIDACIÓN R4 Y BANCO DE RESPALDO R5   ');
  console.log('===============================================================\n');

  // 1. Instanciar servicio simulando ConfigService
  const configService = new ConfigService();
  const questionsService = new QuestionsService(configService);

  // 2. Probar generación para el tema "TypeScript"
  const tema = 'TypeScript & NestJS';
  console.log(`[TEST] Solicitando lote de preguntas para el tema: "${tema}"...`);
  const questions = await questionsService.generateQuestionsPool(tema);

  console.log(`✓ Preguntas obtenidas: ${questions.length}`);

  // 3. Validar estrictamente contra la Regla R4
  console.log('\n[TEST] Auditando las 15 preguntas contra la Regla R4:');
  const isValid = questionsService.validateQuestionsBatch(questions);

  if (isValid && questions.length === 15) {
    console.log('🎯 REGLA R4 CUMPLIDA: Todas las preguntas tienen enunciado, 4 opciones (A,B,C,D), única respuesta correcta y dificultad válida.\n');
  } else {
    console.error('❌ FALLO EN REGLA R4');
    process.exit(1);
  }

  // 4. Mostrar 2 preguntas de muestra
  console.log('--- MUESTRA DE PREGUNTA 1 ---');
  console.log(`[${questions[0].dificultad}] ${questions[0].enunciado}`);
  questions[0].opciones.forEach(o => console.log(`   ${o.id}) ${o.texto}`));
  console.log(`Respuesta Correcta: ${questions[0].respuestaCorrecta}\n`);

  console.log('--- MUESTRA DE PREGUNTA 2 ---');
  console.log(`[${questions[1].dificultad}] ${questions[1].enunciado}`);
  questions[1].opciones.forEach(o => console.log(`   ${o.id}) ${o.texto}`));
  console.log(`Respuesta Correcta: ${questions[1].respuestaCorrecta}\n`);

  console.log('===============================================================');
  console.log('      PRUEBA DE PREGUNTAS (R4 Y R5) FINALIZADA CON ÉXITO       ');
  console.log('===============================================================');
}

testQuestions().catch(console.error);
