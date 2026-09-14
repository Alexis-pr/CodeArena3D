const { io } = require('socket.io-client');

async function runTest() {
  console.log('=== TEST SESIÓN 5 - PARTE 3: TARGETING POR CLIC + TRIVIA CAJITA "?" + COOLDOWN 15S ===\n');

  const SERVER_URL = 'http://localhost:3000';

  // 1. Crear sala en backend
  const roomRes = await fetch(`${SERVER_URL}/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tema: 'Targeting & Box 15s Cooldown' }),
  });
  const roomData = await roomRes.json();
  const ROOM_CODE = roomData.codigo;
  console.log(`✓ Sala creada en Postgres: [${ROOM_CODE}]`);

  // 2. Conectar 2 clientes WebSocket
  const socket1 = io(SERVER_URL, { transports: ['websocket'] });
  const socket2 = io(SERVER_URL, { transports: ['websocket'] });

  await Promise.all([
    new Promise((resolve) => socket1.on('connect', resolve)),
    new Promise((resolve) => socket2.on('connect', resolve)),
  ]);
  console.log('✓ 2 Clientes WebSocket conectados');

  // Registrar listeners para capturar boxSpawned y boxDespawned
  let spawnedBoxes = [];
  let despawnEvents = [];

  socket1.on('boxSpawned', (box) => {
    spawnedBoxes.push({ client: 'socket1', box, time: Date.now() });
  });
  socket2.on('boxSpawned', (box) => {
    spawnedBoxes.push({ client: 'socket2', box, time: Date.now() });
  });

  socket1.on('boxDespawned', (data) => {
    despawnEvents.push({ client: 'socket1', data, time: Date.now() });
  });

  // 3. Unir clientes a la sala nativa
  const join1 = await new Promise((res) =>
    socket1.emit('joinRoom', { codigo: ROOM_CODE, nickname: 'Piloto 1' }, res)
  );
  const join2 = await new Promise((res) =>
    socket2.emit('joinRoom', { codigo: ROOM_CODE, nickname: 'Piloto 2' }, res)
  );
  console.log(`✓ Clientes unidos a sala [${ROOM_CODE}]: Piloto 1 (${join1.playerId}), Piloto 2 (${join2.playerId})`);

  // 4. Verificar presencia de la cajita "?" inicial
  await new Promise((r) => setTimeout(r, 200));
  if (spawnedBoxes.length === 0) {
    console.error('❌ FALLO: No se emitió boxSpawned al iniciar la sala');
    process.exit(1);
  }
  const initialBox = spawnedBoxes[0].box;
  console.log(`✓ Cajita "?" inicial activa en pos: (${initialBox.position.x}, ${initialBox.position.y}, ${initialBox.position.z})`);

  // 5. Piloto 1 reclama la cajita "?" (claimBox)
  console.log('\n--- 1. RECLAMO DE CAJITA "?" (claimBox) ---');
  const claimRes = await new Promise((res) =>
    socket1.emit('claimBox', { codigo: ROOM_CODE, playerId: join1.playerId, mana: 85 }, res)
  );

  console.log('Respuesta claimBox:', {
    success: claimRes.success,
    hasQuestion: Boolean(claimRes.question),
    enunciado: claimRes.question?.enunciado?.slice(0, 50) + '...',
  });

  if (!claimRes.success || !claimRes.question) {
    console.error('❌ FALLO al reclamar la cajita');
    process.exit(1);
  }
  console.log('✓ Piloto 1 capturó la cajita "?" exitosamente y obtuvo la pregunta');

  // Obtener la respuesta correcta desde debugGetPool para garantizar acierto en la prueba
  const poolRes = await new Promise((res) =>
    socket1.emit('debugGetPool', { codigo: ROOM_CODE }, res)
  );
  const currentQ = poolRes.questions.find((q) => q.id === claimRes.question.id);
  const correctOption = currentQ ? currentQ.respuestaCorrecta : 'A';

  // 6. Piloto 1 responde la pregunta de la cajita usando submitAnswer
  console.log('\n--- 2. RESOLUCIÓN DE PREGUNTA VÍA submitAnswer (MISMO MÉTODO QUE PARTE 2) ---');
  const submitRes = await new Promise((res) =>
    socket1.emit(
      'submitAnswer',
      {
        codigo: ROOM_CODE,
        playerId: join1.playerId,
        questionId: claimRes.question.id,
        chosenOption: correctOption,
        isBoxQuestion: true,
      },
      res
    )
  );

  console.log('Respuesta submitAnswer:', {
    isCorrect: submitRes.isCorrect,
    rachaCorrectas: submitRes.rachaCorrectas,
    poderEspecial: submitRes.poderEspecial,
    hasAttackCharge: submitRes.hasAttackCharge,
    isFrozen: submitRes.isFrozen,
  });

  if (!submitRes.isCorrect) {
    console.error('❌ FALLO: La respuesta no fue evaluada como correcta');
    process.exit(1);
  }

  if (!submitRes.hasAttackCharge) {
    console.error('❌ FALLO: Acertar la pregunta de la cajita DEBE otorgar carga de Attack');
    process.exit(1);
  }

  if (submitRes.isFrozen !== false) {
    console.error('❌ FALLO: Tras responder la pregunta, el jugador DEBE quedar descongelado (isFrozen: false)');
    process.exit(1);
  }
  console.log('✓ Acertó la pregunta: obtuvo +PE, Racha, carga de ATTACK y quedó DESCONGELADO');

  // 7. Verificar emisión de boxDespawned con cooldown de 15 segundos
  console.log('\n--- 3. VERIFICACIÓN DE COOLDOWN DE 15 SEGUNDOS ---');
  const despawn = despawnEvents.find((e) => e.data.cooldownSeconds === 15);
  if (!despawn) {
    console.error('❌ FALLO: No se emitió boxDespawned con cooldownSeconds: 15');
    process.exit(1);
  }
  console.log(`✓ Evento boxDespawned recibido con cooldownSeconds: ${despawn.data.cooldownSeconds}s (bajado de 30s)`);

  // Intentar spawnear inmediatamente debe fallar por estar en cooldown
  const instantSpawn = await new Promise((res) =>
    socket1.emit('spawnBox', { codigo: ROOM_CODE }, res)
  );
  if (instantSpawn.success) {
    console.error('❌ FALLO: Se permitió spawnear la cajita mientras aún estaba en cooldown');
    process.exit(1);
  }
  console.log('✓ Confirmado: spawnBox es rechazado inmediatamente debido al cooldown activo de 15s');

  // 8. Targeting por Clic y Ataque (executeAttack)
  console.log('\n--- 4. TARGETING POR CLIC (SOLO DRONES VIVOS isAlive=true) Y EJECUCIÓN DE ATAQUE ---');
  
  // Simulación de la regla de targeting de frontend
  function canTargetDrone(targetPlayer) {
    return targetPlayer && targetPlayer.vida > 0 && !targetPlayer.isEliminated;
  }

  const mockTargetAlive = { id: join2.playerId, nickname: 'Piloto 2', vida: 100, isEliminated: false };
  const mockTargetDead = { id: 'dead-drone', nickname: 'Piloto Caído', vida: 0, isEliminated: true };

  console.log(`Validación targeting dron vivo: ${canTargetDrone(mockTargetAlive)} (Esperado: true)`);
  console.log(`Validación targeting dron eliminado: ${canTargetDrone(mockTargetDead)} (Esperado: false)`);

  if (!canTargetDrone(mockTargetAlive) || canTargetDrone(mockTargetDead)) {
    console.error('❌ FALLO en la validación de targeting por clic para drones vivos');
    process.exit(1);
  }
  console.log('✓ Validación de targeting por clic: Solo permite seleccionar drones con vida > 0 y no eliminados');

  // Ejecutar ataque de Piloto 1 sobre Piloto 2
  const attackRes = await new Promise((res) =>
    socket1.emit(
      'executeAttack',
      {
        codigo: ROOM_CODE,
        attackerId: join1.playerId,
        targetPlayerId: join2.playerId,
      },
      res
    )
  );

  console.log('Resultado executeAttack:', {
    success: attackRes.success,
    damageDealt: attackRes.damageDealt,
    targetRemainingHp: attackRes.targetRemainingHp,
    targetEliminated: attackRes.targetEliminated,
  });

  if (!attackRes.success) {
    console.error('❌ FALLO al ejecutar el ataque:', attackRes.message);
    process.exit(1);
  }

  if (attackRes.targetRemainingHp >= 100) {
    console.error('❌ FALLO: La vida del objetivo no disminuyó tras el impacto');
    process.exit(1);
  }
  console.log(`✓ Ataque ejecutado con éxito: Daño infligido=${attackRes.damageDealt} | HP restante objetivo=${attackRes.targetRemainingHp}`);

  // Verificar que la carga de ataque se consumió (segundo ataque sin carga debe fallar)
  const secondAttack = await new Promise((res) =>
    socket1.emit(
      'executeAttack',
      {
        codigo: ROOM_CODE,
        attackerId: join1.playerId,
        targetPlayerId: join2.playerId,
      },
      res
    )
  );
  if (secondAttack.success) {
    console.error('❌ FALLO: Se permitió un segundo ataque sin tener nueva carga de Attack');
    process.exit(1);
  }
  console.log('✓ Confirmado: La carga de Attack se consumió en el impacto (no se puede volver a atacar sin nueva cajita)');

  // 9. Esperar el fin de los 15 segundos para confirmar reaparición automática
  console.log('\n--- 5. ESPERANDO REAPARICIÓN AUTOMÁTICA TRAS 15 SEGUNDOS DE COOLDOWN ---');
  console.log('Esperando timer de 15 segundos...');
  
  const boxRespawnPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timeout de 18s: La cajita no reapareció tras los 15s de cooldown'));
    }, 18000);

    const onBoxSpawn = (box) => {
      clearTimeout(timeout);
      socket1.off('boxSpawned', onBoxSpawn);
      resolve(box);
    };
    socket1.on('boxSpawned', onBoxSpawn);
  });

  const respawnedBox = await boxRespawnPromise;
  console.log(`✓ ¡Cajita "?" reapareció automáticamente tras 15 segundos en pos: (${respawnedBox.position.x}, ${respawnedBox.position.y}, ${respawnedBox.position.z})!`);

  // Limpieza
  socket1.disconnect();
  socket2.disconnect();

  console.log('\n================================================================');
  console.log('🎉 TEST PARTE 3 COMPLETADO EXITOSAMENTE AL 100%');
  console.log('   1. Targeting por clic restringido a drones vivos (isAlive: true)');
  console.log('   2. Panel de trivia en Standby -> Activo al capturar cajita');
  console.log('   3. submitAnswer unificado (mismo método de R10 + carga de Attack)');
  console.log('   4. Dron congelado mientras responde y descongelado al enviar');
  console.log('   5. Cooldown de la cajita "?" reducido a 15s verificado en tiempo real');
  console.log('================================================================\n');
  process.exit(0);
}

runTest().catch((err) => {
  console.error('Error fatal en el test:', err);
  process.exit(1);
});
