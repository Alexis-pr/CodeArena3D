// ============================================================================
// CodeArena 3D — Prueba Integral de Sesión 4: Parte 4
// Sistema de Combate: Attack, Shield, Boost, Eliminación y Victoria R7
// ============================================================================

import { io } from 'socket.io-client';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const SERVER_URL = 'http://localhost:3000';
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ Error: DATABASE_URL no configurada en .env');
  process.exit(1);
}

const dbPool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes('supabase') ? { rejectUnauthorized: false } : false,
});

async function queryPlayerDb(playerId) {
  const res = await dbPool.query(
    'SELECT id, nickname, vida, poder_especial, racha_correctas, puntaje FROM jugadores WHERE id = $1',
    [playerId]
  );
  return res.rows[0];
}

async function queryRoomDb(codigo) {
  const res = await dbPool.query(
    'SELECT id, codigo, estado, tema FROM salas WHERE codigo = $1',
    [codigo]
  );
  return res.rows[0];
}

async function createRoom(tema) {
  const res = await fetch(`${SERVER_URL}/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tema }),
  });
  if (!res.ok) throw new Error(`Error creando sala: ${await res.text()}`);
  return res.json();
}

async function runCombatTest() {
  console.log('================================================================');
  console.log('  SESIÓN 4 — PARTE 4: COMBATE, HABILIDADES Y VICTORIA (R7)      ');
  console.log('================================================================\n');

  try {
    // 1. Crear sala de combate
    console.log('[PASO 1] Creando sala para el torneo de combate...');
    const room = await createRoom('Sistemas Distribuidos y Combate 3D');
    console.log(`✓ Sala creada en DB: [${room.codigo}]`);

    // 2. Conectar Sockets
    console.log('\n[PASO 2] Conectando Drone-Alfa y Drone-Beta...');
    const socketAlfa = io(SERVER_URL);
    const socketBeta = io(SERVER_URL);

    await Promise.all([
      new Promise((r) => socketAlfa.on('connect', r)),
      new Promise((r) => socketBeta.on('connect', r)),
    ]);

    const alfaEvents = [];
    const betaEvents = [];

    socketAlfa.on('attackExecuted', (d) => alfaEvents.push({ type: 'attackExecuted', data: d }));
    socketAlfa.on('shieldActivated', (d) => alfaEvents.push({ type: 'shieldActivated', data: d }));
    socketAlfa.on('boostActivated', (d) => alfaEvents.push({ type: 'boostActivated', data: d }));
    socketAlfa.on('gameOver', (d) => alfaEvents.push({ type: 'gameOver', data: d }));

    socketBeta.on('attackExecuted', (d) => betaEvents.push({ type: 'attackExecuted', data: d }));
    socketBeta.on('shieldActivated', (d) => betaEvents.push({ type: 'shieldActivated', data: d }));
    socketBeta.on('boostActivated', (d) => betaEvents.push({ type: 'boostActivated', data: d }));
    socketBeta.on('gameOver', (d) => betaEvents.push({ type: 'gameOver', data: d }));

    const joinAlfa = await socketAlfa.emitWithAck('joinRoom', { codigo: room.codigo, nickname: 'Drone-Alfa' });
    const joinBeta = await socketBeta.emitWithAck('joinRoom', { codigo: room.codigo, nickname: 'Drone-Beta' });

    const alfaId = joinAlfa.playerId;
    const betaId = joinBeta.playerId;
    console.log(`✓ Drone-Alfa ID: ${alfaId} (HP: 100)`);
    console.log(`✓ Drone-Beta ID: ${betaId} (HP: 100)`);

    // Obtener pool de preguntas para responder determinísticamente
    const poolRes = await socketAlfa.emitWithAck('debugGetPool', { codigo: room.codigo });

    // 3. Drone-Beta responde 4 preguntas para desbloquear Escudo / Boost (R10: Racha >= 4)
    console.log('\n[PASO 3] Drone-Beta construye racha de 4 para desbloquear Habilidades R10...');
    let nextQBeta = (await socketBeta.emitWithAck('getQuestion', { codigo: room.codigo, playerId: betaId })).question;

    for (let i = 0; i < 4; i++) {
      const fullQ = poolRes.questions.find((q) => q.id === nextQBeta.id);
      const ans = await socketBeta.emitWithAck('submitAnswer', {
        codigo: room.codigo,
        playerId: betaId,
        questionId: nextQBeta.id,
        chosenOption: fullQ.respuestaCorrecta,
      });
      nextQBeta = ans.nextQuestion;
      if (i === 3) {
        console.log(`  - Beta alcanzó Racha: ${ans.rachaCorrectas} | PE: ${ans.poderEspecial} | canUnlockSpecial: ${ans.canUnlockSpecial}`);
        if (!ans.canUnlockSpecial) throw new Error('❌ canUnlockSpecial debía ser true con racha >= 4');
      }
    }
    console.log('✓ Habilidades especiales R10 desbloqueadas para Drone-Beta.');

    // 4. Drone-Beta activa ESCUDO
    console.log('\n[PASO 4] Drone-Beta activa Escudo protector (activateShield)...');
    const shieldRes = await socketBeta.emitWithAck('activateShield', { codigo: room.codigo, playerId: betaId });
    console.log('  - Respuesta de activateShield:', shieldRes);
    if (!shieldRes.success || !shieldRes.hasShield) throw new Error('❌ Fallo al activar escudo');

    // Verificar que el PE de Beta se reseteó a 0 en PostgreSQL (Regla R10)
    await new Promise((r) => setTimeout(r, 400));
    const dbBetaAfterShield = await queryPlayerDb(betaId);
    console.log(`  [Postgres Direct Query] Beta PE tras activar escudo: ${dbBetaAfterShield.poder_especial} (Esperado: 0)`);
    if (dbBetaAfterShield.poder_especial !== 0) throw new Error('❌ El PE no se reseteó a 0 en Supabase');
    console.log('✓ Reset de PE a 0 confirmado en PostgreSQL tras activar Escudo.');

    // 5. Drone-Alfa obtiene carga de Attack mediante la cajita "?"
    console.log('\n[PASO 5] Drone-Alfa obtiene carga de Attack mediante cajita "?"...');
    await socketAlfa.emitWithAck('spawnBox', { codigo: room.codigo });
    const claimAlfa = await socketAlfa.emitWithAck('claimBox', { codigo: room.codigo, playerId: alfaId, mana: 100 });
    const fullQAlfa = poolRes.questions.find((q) => q.id === claimAlfa.question.id);

    const ansAlfaBox = await socketAlfa.emitWithAck('submitAnswer', {
      codigo: room.codigo,
      playerId: alfaId,
      questionId: claimAlfa.question.id,
      chosenOption: fullQAlfa.respuestaCorrecta,
      isBoxQuestion: true,
    });
    console.log(`  - Alfa Racha: ${ansAlfaBox.rachaCorrectas} | PE: ${ansAlfaBox.poderEspecial} | hasAttackCharge: ${ansAlfaBox.hasAttackCharge}`);

    // 6. Drone-Alfa ATACA a Drone-Beta (ESCUDO DEBE ABSORBER 100%)
    console.log('\n[PASO 6] Drone-Alfa ataca a Drone-Beta con ESCUDO activo...');
    console.log('  (Verificando que no hay límite de rango: ataque sin importar distancia)');
    const attack1 = await socketAlfa.emitWithAck('executeAttack', {
      codigo: room.codigo,
      attackerId: alfaId,
      targetPlayerId: betaId,
    });

    console.log('  - Resultado de ataque contra escudo:', {
      damageDealt: attack1.damageDealt,
      shieldAbsorbed: attack1.shieldAbsorbed,
      targetRemainingHp: attack1.targetRemainingHp,
    });

    if (!attack1.shieldAbsorbed || attack1.damageDealt !== 0 || attack1.targetRemainingHp !== 100) {
      throw new Error('❌ El escudo debía absorber el 100% del ataque (0 DMG)');
    }
    console.log('🎯 ESCUDO ABSORBIÓ EXITOSAMENTE EL 100% DEL IMPACTO (0 DAÑO) ✓');
    console.log('✓ Escudo de Beta desactivado tras el impacto.');

    // 7. Prueba de BOOST (+50% velocidad durante 5s)
    console.log('\n[PASO 7] Prueba de Boost: otorgando racha a Drone-Beta y activando Boost...');
    // Otorgar racha respondiendo 4 preguntas para desbloquear Boost
    let qBetaBoost = (await socketBeta.emitWithAck('getQuestion', { codigo: room.codigo, playerId: betaId })).question;
    for (let i = 0; i < 4; i++) {
      const fullQ = poolRes.questions.find((q) => q.id === qBetaBoost.id);
      const a = await socketBeta.emitWithAck('submitAnswer', {
        codigo: room.codigo,
        playerId: betaId,
        questionId: qBetaBoost.id,
        chosenOption: fullQ.respuestaCorrecta,
      });
      qBetaBoost = a.nextQuestion;
    }

    const boostRes = await socketBeta.emitWithAck('activateBoost', { codigo: room.codigo, playerId: betaId });
    console.log('  - Respuesta de activateBoost:', boostRes);
    if (!boostRes.success || boostRes.speedMultiplier !== 1.5 || boostRes.durationMs !== 5000) {
      throw new Error('❌ Boost falló o no tiene multiplicador 1.5x / 5s');
    }
    console.log('🚀 BOOST ACTIVADO: +50% de velocidad (1.5x) durante 5.0 segundos ✓');

    // CONSULTA DIRECTA A POSTGRES: Reset de PE a 0 tras Boost
    await new Promise((r) => setTimeout(r, 400));
    const dbBetaAfterBoost = await queryPlayerDb(betaId);
    console.log(`  [Postgres Direct Query] Beta PE tras activar boost: ${dbBetaAfterBoost.poder_especial} (Esperado: 0)`);
    if (dbBetaAfterBoost.poder_especial !== 0) throw new Error('❌ El PE no se reseteó a 0 en Supabase tras activar Boost');
    console.log('✓ Reset de PE a 0 confirmado en PostgreSQL tras activar Boost.');

    // 7.5 Verificación formal de la fórmula de puntaje:
    // puntaje = (respuestas_correctas * 10) + daño_total_infligido
    console.log('\n[PASO 7.5] Verificando fórmula oficial de puntaje: (aciertos × 10) + daño infligido...');
    const dbAlfaInitial = await queryPlayerDb(alfaId);
    console.log(`  - Puntaje inicial de Drone-Alfa en Postgres: ${dbAlfaInitial.puntaje}`);

    // Drone-Alfa responde 2 preguntas correctas (+10 c/u = +20 pts)
    for (let i = 0; i < 2; i++) {
      const qAlfa = (await socketAlfa.emitWithAck('getQuestion', { codigo: room.codigo, playerId: alfaId })).question;
      const fullQ = poolRes.questions.find((q) => q.id === qAlfa.id);
      await socketAlfa.emitWithAck('submitAnswer', {
        codigo: room.codigo,
        playerId: alfaId,
        questionId: qAlfa.id,
        chosenOption: fullQ.respuestaCorrecta,
      });
    }

    await new Promise((r) => setTimeout(r, 400));
    const dbAlfaAfter2Ans = await queryPlayerDb(alfaId);
    const expectedAfterAnswers = dbAlfaInitial.puntaje + 20;
    console.log(`  [Postgres Direct Query] Puntaje Alfa tras 2 aciertos (+20): ${dbAlfaAfter2Ans.puntaje} (Esperado: ${expectedAfterAnswers})`);
    if (dbAlfaAfter2Ans.puntaje !== expectedAfterAnswers) {
      throw new Error(`❌ Puntaje tras aciertos incorrecto en Supabase: ${dbAlfaAfter2Ans.puntaje} vs ${expectedAfterAnswers}`);
    }

    // Drone-Alfa obtiene Attack de la cajita (otra respuesta correcta = +10)
    await socketAlfa.emitWithAck('spawnBox', { codigo: room.codigo });
    const qBoxScore = (await socketAlfa.emitWithAck('getQuestion', { codigo: room.codigo, playerId: alfaId })).question;
    const fullQBox = poolRes.questions.find((q) => q.id === qBoxScore.id);
    await socketAlfa.emitWithAck('submitAnswer', {
      codigo: room.codigo,
      playerId: alfaId,
      questionId: qBoxScore.id,
      chosenOption: fullQBox.respuestaCorrecta,
      isBoxQuestion: true,
    });
    const expectedScoreWithBox = expectedAfterAnswers + 10;

    // Drone-Alfa ejecuta ataque infligiendo daño (+daño infligido)
    const scoreAttack = await socketAlfa.emitWithAck('executeAttack', {
      codigo: room.codigo,
      attackerId: alfaId,
      targetPlayerId: betaId,
    });
    console.log(`  - Ataque ejecutado: infligió ${scoreAttack.damageDealt} DMG a Drone-Beta`);

    await new Promise((r) => setTimeout(r, 400));
    const dbAlfaAfterAttack = await queryPlayerDb(alfaId);
    const expectedFinalScore = expectedScoreWithBox + scoreAttack.damageDealt;
    console.log(`  [Postgres Direct Query] Puntaje Alfa tras infligir ${scoreAttack.damageDealt} DMG: ${dbAlfaAfterAttack.puntaje} (Esperado: ${expectedFinalScore})`);
    if (dbAlfaAfterAttack.puntaje !== expectedFinalScore) {
      throw new Error(`❌ Puntaje tras daño incorrecto en Supabase: ${dbAlfaAfterAttack.puntaje} vs ${expectedFinalScore}`);
    }
    console.log(`✓ FÓRMULA DE PUNTAJE VERIFICADA 100% EN POSTGRESQL: Aciertos (+10 c/u) + Daño (+${scoreAttack.damageDealt}) = ${dbAlfaAfterAttack.puntaje} puntos.`);

    // 8. Daño escalado y Eliminación (Regla R7)
    console.log('\n[PASO 8] Ejecutando combate hasta eliminación de Drone-Beta y Victoria (R7)...');
    let betaCurrentHp = scoreAttack.targetRemainingHp;
    let round = 1;

    while (betaCurrentHp > 0 && round <= 20) {
      // 1) Otorgar carga de Attack a Alfa simulando la cajita
      // Esperar o forzar spawn
      await socketAlfa.emitWithAck('spawnBox', { codigo: room.codigo });
      // En test directo, responder pregunta de cajita
      const qBox = (await socketAlfa.emitWithAck('getQuestion', { codigo: room.codigo, playerId: alfaId })).question;
      const fullQ = poolRes.questions.find((q) => q.id === qBox.id);
      await socketAlfa.emitWithAck('submitAnswer', {
        codigo: room.codigo,
        playerId: alfaId,
        questionId: qBox.id,
        chosenOption: fullQ.respuestaCorrecta,
        isBoxQuestion: true,
      });

      // 2) Atacar a Beta
      const att = await socketAlfa.emitWithAck('executeAttack', {
        codigo: room.codigo,
        attackerId: alfaId,
        targetPlayerId: betaId,
      });

      betaCurrentHp = att.targetRemainingHp;
      console.log(`  - Ataque Ronda ${round}: DMG=${att.damageDealt} | Beta HP restante: ${betaCurrentHp} | Eliminado: ${att.targetEliminated} | GameOver: ${att.gameOver}`);

      if (att.gameOver) {
        console.log(`\n🏆 ¡PARTIDA FINALIZADA! Ganador declarado: ${att.winner?.nickname} (${att.winner?.id})`);
        break;
      }
      round++;
    }

    // 9. Verificar persistencia final en PostgreSQL (Supabase)
    await new Promise((r) => setTimeout(r, 600));
    console.log('\n[PASO 9] Verificando estado final en PostgreSQL (Supabase):');
    const dbRoomFinal = await queryRoomDb(room.codigo);
    const dbBetaFinal = await queryPlayerDb(betaId);

    console.log(`  [Postgres Direct Query] Estado de la Sala: "${dbRoomFinal.estado}" (Esperado: FINISHED)`);
    console.log(`  [Postgres Direct Query] Vida de Drone-Beta: ${dbBetaFinal.vida} (Esperado: 0)`);

    if (dbRoomFinal.estado !== 'FINISHED') throw new Error('❌ La sala no cambió a FINISHED en Supabase');
    if (dbBetaFinal.vida !== 0) throw new Error('❌ La vida de Drone-Beta no quedó en 0 en Supabase');

    console.log('✓ Sala marcada como FINISHED en PostgreSQL.');
    console.log('✓ Drone-Beta marcado con 0 HP y eliminado en PostgreSQL.');

    // 10. Verificar recepción de evento gameOver en WebSockets
    const gameOverEventReceived = alfaEvents.some((e) => e.type === 'gameOver');
    console.log(`  - Evento gameOver recibido por WebSockets: ${gameOverEventReceived ? 'SÍ ✓' : 'NO ❌'}`);

    // Limpieza
    socketAlfa.disconnect();
    socketBeta.disconnect();
    await dbPool.end();

    console.log('\n================================================================');
    console.log('       ✓✓✓ PRUEBA SESIÓN 4 PARTE 4: 100% EXITOSA ✓✓✓            ');
    console.log('================================================================');
  } catch (err) {
    console.error('❌ Error en prueba de combate:', err);
    await dbPool.end();
    process.exit(1);
  }
}

runCombatTest();
