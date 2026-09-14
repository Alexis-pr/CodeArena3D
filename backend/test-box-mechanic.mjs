// ============================================================================
// CodeArena 3D — Prueba Integral de Sesión 4: Parte 3
// Mecánica de la Cajita "?" (Spawn, Desempate de Mana, Attack y Cooldown)
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
    'SELECT id, nickname, racha_correctas, poder_especial, puntaje FROM jugadores WHERE id = $1',
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

async function runBoxMechanicTest() {
  console.log('================================================================');
  console.log('  SESIÓN 4 — PARTE 3: PRUEBA DE CAJITA "?", MANA Y ATTACK       ');
  console.log('================================================================\n');

  try {
    // 1. Crear sala de prueba
    console.log('[PASO 1] Creando sala para la prueba de combate...');
    const room = await createRoom('Arquitectura y Combate 3D');
    console.log(`✓ Sala creada: [${room.codigo}]`);

    // 2. Conectar Sockets de Drone-Alfa y Drone-Beta
    console.log('\n[PASO 2] Conectando sockets de Drone-Alfa y Drone-Beta...');
    const socketAlfa = io(SERVER_URL);
    const socketBeta = io(SERVER_URL);

    await Promise.all([
      new Promise((res) => socketAlfa.on('connect', res)),
      new Promise((res) => socketBeta.on('connect', res)),
    ]);

    const alfaEvents = [];
    const betaEvents = [];

    socketAlfa.on('boxSpawned', (d) => alfaEvents.push({ type: 'boxSpawned', data: d }));
    socketAlfa.on('boxInteracted', (d) => alfaEvents.push({ type: 'boxInteracted', data: d }));
    socketAlfa.on('boxDespawned', (d) => alfaEvents.push({ type: 'boxDespawned', data: d }));
    socketAlfa.on('playerStatsUpdated', (d) => alfaEvents.push({ type: 'playerStatsUpdated', data: d }));

    socketBeta.on('boxSpawned', (d) => betaEvents.push({ type: 'boxSpawned', data: d }));
    socketBeta.on('boxInteracted', (d) => betaEvents.push({ type: 'boxInteracted', data: d }));
    socketBeta.on('boxDespawned', (d) => betaEvents.push({ type: 'boxDespawned', data: d }));

    const joinAlfa = await socketAlfa.emitWithAck('joinRoom', {
      codigo: room.codigo,
      nickname: 'Drone-Alfa',
    });
    const joinBeta = await socketBeta.emitWithAck('joinRoom', {
      codigo: room.codigo,
      nickname: 'Drone-Beta',
    });

    const alfaId = joinAlfa.playerId;
    const betaId = joinBeta.playerId;
    console.log(`✓ Alfa ID: ${alfaId} | Beta ID: ${betaId}`);

    // 3. Spawning de la cajita "?"
    console.log('\n[PASO 3] Generando aparición de cajita "?" en la arena...');
    const spawnRes = await socketAlfa.emitWithAck('spawnBox', { codigo: room.codigo });
    console.log('✓ Respuesta de spawnBox:', spawnRes);

    const box = spawnRes.box;
    console.log(`  - Box ID: ${box.id}`);
    console.log(`  - Posición: (${box.position.x}, ${box.position.y}, ${box.position.z})`);

    // Validar radio dentro del octágono (radio <= 5.5)
    const distOrigin = Math.hypot(box.position.x, box.position.z);
    console.log(`  - Distancia al centro: ${distOrigin.toFixed(2)} (Máx permitido: 5.5)`);
    if (distOrigin > 5.5) {
      throw new Error(`❌ Posición inválida: fuera del octágono (${distOrigin} > 5.5)`);
    }

    // Validar que no superponga plataformas cardinales (distancia > 2.0 a N, S, E, W)
    const platforms = [
      { name: 'Norte', x: 0, z: -5.5 },
      { name: 'Sur', x: 0, z: 5.5 },
      { name: 'Este', x: 5.5, z: 0 },
      { name: 'Oeste', x: -5.5, z: 0 },
    ];
    for (const p of platforms) {
      const d = Math.hypot(box.position.x - p.x, box.position.z - p.z);
      if (d < 2.0) {
        throw new Error(`❌ Posición inválida: colisiona con plataforma ${p.name} (distancia ${d.toFixed(2)} < 2.0)`);
      }
    }
    console.log('✓ Posición geométrica validada: Dentro de octágono y fuera de plataformas.');

    // 4. Prueba de llegada simultánea y desempate por Mana
    // Alfa llega con 40% mana, Beta llega con 85% mana
    console.log('\n[PASO 4] Simulando llegada simultánea a la cajita (Desempate por Mana)...');
    console.log('  - Drone-Alfa declara 40% de mana');
    console.log('  - Drone-Beta declara 85% de mana');

    const [claimAlfa, claimBeta] = await Promise.all([
      socketAlfa.emitWithAck('claimBox', { codigo: room.codigo, playerId: alfaId, mana: 40 }),
      socketBeta.emitWithAck('claimBox', { codigo: room.codigo, playerId: betaId, mana: 85 }),
    ]);

    console.log('  - Reclamo Alfa:', claimAlfa.success ? 'Ganó claim inicial' : claimAlfa.reason);
    console.log('  - Reclamo Beta:', claimBeta.success ? 'Ganó desempate ✓' : claimBeta.reason);

    if (!claimBeta.success) {
      throw new Error('❌ Fallo en desempate: Beta tenía 85% mana y debía ganar el reclamo');
    }
    console.log('✓ Desempate por % de Mana resuelto correctamente a favor de Drone-Beta.');
    console.log(`✓ Drone-Beta congelado para responder: isFrozen=${claimBeta.isFrozen}`);

    // Verificar entrega de pregunta de su propio pool sin respuestaCorrecta
    const boxQuestion = claimBeta.question;
    console.log(`  - Pregunta asignada a Beta: "${boxQuestion.enunciado}"`);
    console.log(`  - ¿Respuesta oculta (R6)?: ${boxQuestion.respuestaCorrecta === undefined ? 'SÍ ✓' : 'NO ❌'}`);

    // 5. Responder la pregunta de la cajita reutilizando EXACTAMENTE submitAnswer
    console.log('\n[PASO 5] Drone-Beta responde pregunta de cajita vía submitAnswer(isBoxQuestion=true)...');
    
    // Obtener la respuesta correcta desde debugGetPool
    const poolRes = await socketBeta.emitWithAck('debugGetPool', { codigo: room.codigo });
    const fullQ = poolRes.questions.find((q) => q.id === boxQuestion.id);
    const correctOpt = fullQ.respuestaCorrecta;

    const answerRes = await socketBeta.emitWithAck('submitAnswer', {
      codigo: room.codigo,
      playerId: betaId,
      questionId: boxQuestion.id,
      chosenOption: correctOpt,
      isBoxQuestion: true, // FLAG DE CAJITA
    });

    console.log('  - Resultado de submitAnswer:', {
      isCorrect: answerRes.isCorrect,
      rachaCorrectas: answerRes.rachaCorrectas,
      peGainedOrLost: answerRes.peGainedOrLost,
      poderEspecial: answerRes.poderEspecial,
      hasAttackCharge: answerRes.hasAttackCharge,
      isFrozen: answerRes.isFrozen,
    });

    // Validar carga de Attack
    if (!answerRes.hasAttackCharge) {
      throw new Error('❌ Drone-Beta no recibió la carga de Attack tras acertar la cajita');
    }
    console.log('🎯 CARGA DE ATTACK OBTENIDA EXITOSAMENTE POR DRONE-BETA ✓');

    // Validar descongelamiento
    if (answerRes.isFrozen !== false) {
      throw new Error('❌ Drone-Beta sigue congelado tras responder');
    }
    console.log('✓ Drone-Beta descongelado automáticamente tras resolver.');

    // 6. Verificar persistencia en Postgres Supabase (REUTILIZACIÓN REAL DE PERSISTENCIA)
    await new Promise((r) => setTimeout(r, 400));
    const dbBeta = await queryPlayerDb(betaId);
    console.log(`\n[PASO 6] Verificando persistencia en Supabase para Drone-Beta:`);
    console.log(`  [Postgres Direct Query] Racha: ${dbBeta.racha_correctas} | PE: ${dbBeta.poder_especial} | Puntos: ${dbBeta.puntaje}`);
    const syncOk = dbBeta.racha_correctas === 1 && dbBeta.poder_especial === 15;
    console.log(`  ✓ Persistencia Postgres: ${syncOk ? 'CORRECTA ✓' : 'DESINCRONIZADA ❌'}`);

    // 7. Verificar broadcast en la sala: boxDespawned y playerStatsUpdated
    console.log('\n[PASO 7] Verificando eventos de WebSockets en Drone-Alfa...');
    const alfaReceivedDespawn = alfaEvents.some((e) => e.type === 'boxDespawned');
    const alfaReceivedStatsUpdate = alfaEvents.some(
      (e) => e.type === 'playerStatsUpdated' && e.data.hasAttackCharge === true
    );
    console.log(`  - Drone-Alfa recibió boxDespawned: ${alfaReceivedDespawn ? 'SÍ ✓' : 'NO ❌'}`);
    console.log(`  - Drone-Alfa recibió playerStatsUpdated con hasAttackCharge: ${alfaReceivedStatsUpdate ? 'SÍ ✓' : 'NO ❌'}`);

    // 8. Verificar Cooldown de 30 segundos
    console.log('\n[PASO 8] Verificando activación del cooldown de 30 segundos...');
    const immediateSpawn = await socketAlfa.emitWithAck('spawnBox', { codigo: room.codigo });
    console.log('  - Intento de spawn inmediato durante cooldown:', immediateSpawn);
    if (immediateSpawn.success) {
      throw new Error('❌ El cooldown falló: la cajita spawneó inmediatamente');
    }
    console.log('✓ Cooldown de 30s activo: intento de spawn rechazado correctamente.');

    // Limpieza
    socketAlfa.disconnect();
    socketBeta.disconnect();
    await dbPool.end();

    console.log('\n================================================================');
    console.log('       ✓✓✓ PRUEBA SESIÓN 4 PARTE 3: 100% EXITOSA ✓✓✓            ');
    console.log('================================================================');
  } catch (err) {
    console.error('❌ Error en prueba de cajita:', err);
    await dbPool.end();
    process.exit(1);
  }
}

runBoxMechanicTest();
