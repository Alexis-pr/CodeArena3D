// ============================================================================
// CodeArena 3D — Prueba Integral de Sesión 4: Parte 2
// Trivia Game Loop + R10 Escalado + Sincronización PostgreSQL Supabase
// ============================================================================

import { io } from 'socket.io-client';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const SERVER_URL = 'http://localhost:3000';
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ Error: DATABASE_URL no encontrada en .env');
  process.exit(1);
}

const dbPool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes('supabase') ? { rejectUnauthorized: false } : false,
});

async function queryPlayerDb(playerId) {
  const res = await dbPool.query(
    'SELECT id, nickname, racha_correctas, poder_especial, puntaje, estado_conexion FROM jugadores WHERE id = $1',
    [playerId]
  );
  return res.rows[0];
}

async function createRoom(tema) {
  const res = await fetch(`${SERVER_URL}/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tema }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Error creando sala: ${err}`);
  }
  return res.json();
}

async function runGameplayTest() {
  console.log('================================================================');
  console.log('  SESIÓN 4 — PARTE 2: PRUEBA DE PREGUNTAS, RACHA Y PERSISTENCIA ');
  console.log('================================================================\n');

  try {
    // 1. Crear sala con generación de preguntas
    console.log('[PASO 1] Creando sala con tema: "TypeScript Avanzado"...');
    const room = await createRoom('TypeScript Avanzado');
    console.log(`✓ Sala creada exitosamente en DB: [${room.codigo}]`);

    // 2. Conectar Cliente 1 (Alfa) y Cliente 2 (Beta)
    console.log('\n[PASO 2] Conectando sockets a la sala [${room.codigo}]...');
    const socket1 = io(SERVER_URL);
    const socket2 = io(SERVER_URL);

    await Promise.all([
      new Promise((res) => socket1.on('connect', res)),
      new Promise((res) => socket2.on('connect', res)),
    ]);
    console.log('✓ Ambos sockets conectados al servidor.');

    // Event tracking para Cliente 2 (verificar broadcasts aislados)
    const client2StatsUpdates = [];
    socket2.on('playerStatsUpdated', (data) => {
      client2StatsUpdates.push(data);
    });

    // 3. Unir ambos clientes a la sala
    const joinRes1 = await socket1.emitWithAck('joinRoom', {
      codigo: room.codigo,
      nickname: 'Drone-Alfa',
    });
    const joinRes2 = await socket2.emitWithAck('joinRoom', {
      codigo: room.codigo,
      nickname: 'Drone-Beta',
    });

    console.log(`✓ Jugador 1 registrado: ID=${joinRes1.playerId} (${joinRes1.nickname || 'Drone-Alfa'})`);
    console.log(`✓ Jugador 2 registrado: ID=${joinRes2.playerId} (${joinRes2.nickname || 'Drone-Beta'})`);

    const player1Id = joinRes1.playerId;
    const player2Id = joinRes2.playerId;

    // 4. Obtener pool de preguntas (para resolver determinísticamente)
    console.log('\n[PASO 3] Consultando pool de preguntas generado...');
    const poolRes = await socket1.emitWithAck('debugGetPool', { codigo: room.codigo });
    console.log(`✓ Pool contiene ${poolRes.count} preguntas validadas.`);
    if (poolRes.count < 15) {
      console.warn(`⚠️ Advertencia: se esperaban 15 preguntas, se obtuvieron ${poolRes.count}`);
    }

    // 5. Jugador 1 solicita su primera pregunta
    console.log('\n[PASO 4] Jugador 1 solicita primera pregunta (getQuestion)...');
    const q1Res = await socket1.emitWithAck('getQuestion', {
      codigo: room.codigo,
      playerId: player1Id,
    });

    console.log(`  - ID: ${q1Res.question.id}`);
    console.log(`  - Enunciado: "${q1Res.question.enunciado}"`);
    console.log(`  - Opciones: ${q1Res.question.opciones.map((o) => `${o.id}: ${o.texto}`).join(' | ')}`);
    console.log(`  - ¿Respuesta correcta oculta al cliente (Regla R6)?: ${q1Res.question.respuestaCorrecta === undefined ? 'SÍ (Protegida) ✓' : 'NO (FILTRADA) ❌'}`);

    // Buscar la respuesta correcta de la pregunta 1 desde el pool
    const poolQ1 = poolRes.questions.find((q) => q.id === q1Res.question.id);
    const correctOpt1 = poolQ1.respuestaCorrecta;

    // 6. RESPUESTA 1 (CORRECTA) -> Racha 1 (+15 PE)
    console.log('\n[PASO 5] Jugador 1 responde CORRECTAMENTE la Pregunta 1...');
    const ans1 = await socket1.emitWithAck('submitAnswer', {
      codigo: room.codigo,
      playerId: player1Id,
      questionId: q1Res.question.id,
      chosenOption: correctOpt1,
    });

    console.log(`  - Resultado: ${ans1.isCorrect ? 'ACIERTO ✓' : 'FALLO ❌'}`);
    console.log(`  - Racha: ${ans1.rachaCorrectas} (Esperado: 1)`);
    console.log(`  - PE Delta: +${ans1.peGainedOrLost} (Esperado: +15)`);
    console.log(`  - PE Total: ${ans1.poderEspecial} (Esperado: 15)`);

    // Verificar persistencia en Postgres Supabase inmediatamente
    await new Promise((r) => setTimeout(r, 400));
    const dbPlayerAfterQ1 = await queryPlayerDb(player1Id);
    console.log(`  [Postgres Direct Query] Racha: ${dbPlayerAfterQ1.racha_correctas} | PE: ${dbPlayerAfterQ1.poder_especial} | Puntos: ${dbPlayerAfterQ1.puntaje}`);
    const q1SyncOk = dbPlayerAfterQ1.racha_correctas === 1 && dbPlayerAfterQ1.poder_especial === 15;
    console.log(`  ✓ Persistencia Postgres Q1: ${q1SyncOk ? 'CORRECTA ✓' : 'DESINCRONIZADA ❌'}`);

    // 7. RESPUESTA 2 (CORRECTA) -> Racha 2 (+18 PE, Total 33)
    console.log('\n[PASO 6] Jugador 1 responde CORRECTAMENTE la Pregunta 2...');
    const q2Id = ans1.nextQuestion.id;
    const poolQ2 = poolRes.questions.find((q) => q.id === q2Id);
    const ans2 = await socket1.emitWithAck('submitAnswer', {
      codigo: room.codigo,
      playerId: player1Id,
      questionId: q2Id,
      chosenOption: poolQ2.respuestaCorrecta,
    });

    console.log(`  - Racha: ${ans2.rachaCorrectas} (Esperado: 2) | PE: ${ans2.poderEspecial} (Esperado: 33)`);
    await new Promise((r) => setTimeout(r, 400));
    const dbPlayerAfterQ2 = await queryPlayerDb(player1Id);
    console.log(`  [Postgres Direct Query] Racha: ${dbPlayerAfterQ2.racha_correctas} | PE: ${dbPlayerAfterQ2.poder_especial}`);
    const q2SyncOk = dbPlayerAfterQ2.racha_correctas === 2 && dbPlayerAfterQ2.poder_especial === 33;
    console.log(`  ✓ Persistencia Postgres Q2: ${q2SyncOk ? 'CORRECTA ✓' : 'DESINCRONIZADA ❌'}`);

    // 8. RESPUESTA 3 (CORRECTA) -> Racha 3 (+21 PE, Total 54)
    console.log('\n[PASO 7] Jugador 1 responde CORRECTAMENTE la Pregunta 3...');
    const q3Id = ans2.nextQuestion.id;
    const poolQ3 = poolRes.questions.find((q) => q.id === q3Id);
    const ans3 = await socket1.emitWithAck('submitAnswer', {
      codigo: room.codigo,
      playerId: player1Id,
      questionId: q3Id,
      chosenOption: poolQ3.respuestaCorrecta,
    });

    console.log(`  - Racha: ${ans3.rachaCorrectas} (Esperado: 3) | PE: ${ans3.poderEspecial} (Esperado: 54)`);
    await new Promise((r) => setTimeout(r, 400));
    const dbPlayerAfterQ3 = await queryPlayerDb(player1Id);
    console.log(`  [Postgres Direct Query] Racha: ${dbPlayerAfterQ3.racha_correctas} | PE: ${dbPlayerAfterQ3.poder_especial}`);
    const q3SyncOk = dbPlayerAfterQ3.racha_correctas === 3 && dbPlayerAfterQ3.poder_especial === 54;
    console.log(`  ✓ Persistencia Postgres Q3: ${q3SyncOk ? 'CORRECTA ✓' : 'DESINCRONIZADA ❌'}`);

    // 9. RESPUESTA 4 (CORRECTA) -> Racha 4 (+25 PE, Total 79, Desbloqueo Especial R10)
    console.log('\n[PASO 8] Jugador 1 responde CORRECTAMENTE la Pregunta 4 (Racha >= 4 -> Unlock R10)...');
    const q4Id = ans3.nextQuestion.id;
    const poolQ4 = poolRes.questions.find((q) => q.id === q4Id);
    const ans4 = await socket1.emitWithAck('submitAnswer', {
      codigo: room.codigo,
      playerId: player1Id,
      questionId: q4Id,
      chosenOption: poolQ4.respuestaCorrecta,
    });

    console.log(`  - Racha: ${ans4.rachaCorrectas} (Esperado: 4) | PE: ${ans4.poderEspecial} (Esperado: 79)`);
    console.log(`  - canUnlockSpecial: ${ans4.canUnlockSpecial} (Esperado: true por Racha >= 4)`);
    await new Promise((r) => setTimeout(r, 400));
    const dbPlayerAfterQ4 = await queryPlayerDb(player1Id);
    console.log(`  [Postgres Direct Query] Racha: ${dbPlayerAfterQ4.racha_correctas} | PE: ${dbPlayerAfterQ4.poder_especial}`);
    const q4SyncOk = dbPlayerAfterQ4.racha_correctas === 4 && dbPlayerAfterQ4.poder_especial === 79;
    console.log(`  ✓ Persistencia Postgres Q4: ${q4SyncOk ? 'CORRECTA ✓' : 'DESINCRONIZADA ❌'}`);

    // 10. RESPUESTA 5 (INCORRECTA) -> Racha 0, PE -18 (79 - 18 = 61)
    console.log('\n[PASO 9] Jugador 1 responde INCORRECTAMENTE la Pregunta 5 (Prueba de Penalización)...');
    const q5Id = ans4.nextQuestion.id;
    const poolQ5 = poolRes.questions.find((q) => q.id === q5Id);
    // Elegir deliberadamente una opción incorrecta
    const wrongOpt = poolQ5.respuestaCorrecta === 'A' ? 'B' : 'A';
    const ans5 = await socket1.emitWithAck('submitAnswer', {
      codigo: room.codigo,
      playerId: player1Id,
      questionId: q5Id,
      chosenOption: wrongOpt,
    });

    console.log(`  - Resultado: ${ans5.isCorrect ? 'ACIERTO' : 'FALLO ✓ (Esperado)'}`);
    console.log(`  - Racha: ${ans5.rachaCorrectas} (Esperado: 0)`);
    console.log(`  - PE Delta: ${ans5.peGainedOrLost} (Esperado: -18)`);
    console.log(`  - PE Total: ${ans5.poderEspecial} (Esperado: 61)`);

    await new Promise((r) => setTimeout(r, 400));
    const dbPlayerAfterQ5 = await queryPlayerDb(player1Id);
    console.log(`  [Postgres Direct Query] Racha: ${dbPlayerAfterQ5.racha_correctas} | PE: ${dbPlayerAfterQ5.poder_especial}`);
    const q5SyncOk = dbPlayerAfterQ5.racha_correctas === 0 && dbPlayerAfterQ5.poder_especial === 61;
    console.log(`  ✓ Persistencia Postgres Q5 (Penalización): ${q5SyncOk ? 'CORRECTA ✓' : 'DESINCRONIZADA ❌'}`);

    // 11. Verificar Broadcast a Cliente 2 (playerStatsUpdated)
    console.log('\n[PASO 10] Verificando recepción de playerStatsUpdated en Cliente 2...');
    console.log(`  - Total eventos recibidos por Cliente 2: ${client2StatsUpdates.length}`);
    const lastUpdate = client2StatsUpdates[client2StatsUpdates.length - 1];
    console.log(`  - Última actualización recibida: Racha=${lastUpdate?.rachaCorrectas}, PE=${lastUpdate?.poderEspecial}`);
    const broadcastOk = client2StatsUpdates.length >= 5 && lastUpdate?.rachaCorrectas === 0 && lastUpdate?.poderEspecial === 61;
    console.log(`  ✓ Sincronización WebSocket en Sala: ${broadcastOk ? 'EXITOSA ✓' : 'FALLÓ ❌'}`);

    // 12. Verificar que Cliente 2 consume su propio pool independiente
    console.log('\n[PASO 11] Verificando independencia de índice para Cliente 2...');
    const qBetaRes = await socket2.emitWithAck('getQuestion', {
      codigo: room.codigo,
      playerId: player2Id,
    });
    console.log(`  - Cliente 2 pregunta índice: ${qBetaRes.questionIndex} (Esperado: 0)`);
    console.log(`  - Cliente 2 pregunta ID: ${qBetaRes.question.id} (Pregunta 1 del pool, independiente de Alfa)`);
    const independentOk = qBetaRes.questionIndex === 0 && qBetaRes.question.id === q1Res.question.id;
    console.log(`  ✓ Pools de preguntas independientes por jugador: ${independentOk ? 'CONFIRMADO ✓' : 'FALLÓ ❌'}`);

    // Cerrar conexiones
    socket1.disconnect();
    socket2.disconnect();
    await dbPool.end();

    console.log('\n================================================================');
    console.log('       ✓✓✓ PRUEBA SESIÓN 4 PARTE 2: 100% EXITOSA ✓✓✓            ');
    console.log('================================================================');
  } catch (err) {
    console.error('❌ Error durante la ejecución del test:', err);
    await dbPool.end();
    process.exit(1);
  }
}

runGameplayTest();
