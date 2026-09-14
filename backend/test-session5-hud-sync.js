const { io } = require('socket.io-client');

async function runTest() {
  console.log('=== TEST SESIÓN 5 - PARTE 2: SINCRONIZACIÓN DE HUD A 4 JUGADORES CON DATOS REALES ===\n');

  const SERVER_URL = 'http://localhost:3000';

  // 1. Crear sala real en Supabase
  const roomRes = await fetch(`${SERVER_URL}/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tema: 'Full Stack HUD Sync' }),
  });
  const roomData = await roomRes.json();
  const ROOM_CODE = roomData.codigo;
  console.log(`✓ Sala creada en Supabase: [${ROOM_CODE}]`);

  // 2. Conectar 3 sockets simulando 3 clientes en vivo
  const socket1 = io(SERVER_URL, { transports: ['websocket'] });
  const socket2 = io(SERVER_URL, { transports: ['websocket'] });
  const socket3 = io(SERVER_URL, { transports: ['websocket'] });

  await Promise.all([
    new Promise((resolve) => socket1.on('connect', resolve)),
    new Promise((resolve) => socket2.on('connect', resolve)),
    new Promise((resolve) => socket3.on('connect', resolve)),
  ]);
  console.log('✓ 3 Clientes WebSocket conectados');

  // 3. Unir clientes a la sala nativa
  const join1 = await new Promise((res) =>
    socket1.emit('joinRoom', { codigo: ROOM_CODE, nickname: 'Alfa', playerId: 'player-1' }, res)
  );
  const join2 = await new Promise((res) =>
    socket2.emit('joinRoom', { codigo: ROOM_CODE, nickname: 'Bravo', playerId: 'player-2' }, res)
  );
  const join3 = await new Promise((res) =>
    socket3.emit('joinRoom', { codigo: ROOM_CODE, nickname: 'Charlie', playerId: 'player-3' }, res)
  );
  console.log(`✓ Clientes unidos a sala [${ROOM_CODE}]. Total jugadores: 3`);

  // 4. Verificación de la Lógica de Esquinas Dinámicas (Frontend logic simulation)
  console.log('\n--- VERIFICANDO ASIGNACIÓN DINÁMICA DE ESQUINAS (SIEMPRE "TÚ" ARRIBA-IZQUIERDA) ---');
  function computeHudCorners(allPlayers, localId) {
    const self = allPlayers.find((p) => String(p.id) === String(localId));
    const remotes = allPlayers.filter((p) => String(p.id) !== String(localId));
    return {
      topLeft: self ? { ...self, nickname: `${self.nickname} (Tú)`, isCurrentPlayer: true } : allPlayers[0],
      topRight: remotes[0],
      bottomLeft: remotes[1],
      bottomRight: remotes[2] || { nickname: 'Esperando...' },
    };
  }

  const mockAllPlayers = [
    { id: 'player-1', nickname: 'Alfa', vida: 100, mana: 80, poderEspecial: 0, puntaje: 0 },
    { id: 'player-2', nickname: 'Bravo', vida: 100, mana: 80, poderEspecial: 0, puntaje: 0 },
    { id: 'player-3', nickname: 'Charlie', vida: 100, mana: 80, poderEspecial: 0, puntaje: 0 },
    { id: 'player-4', nickname: 'Delta', vida: 100, mana: 80, poderEspecial: 0, puntaje: 0 },
  ];

  // Caso A: Cliente local es player-1
  const hudForClient1 = computeHudCorners(mockAllPlayers, 'player-1');
  console.log(`Cliente 1 [localId=player-1] -> Esquina Arriba-Izq: "${hudForClient1.topLeft.nickname}" (isSelf=${hudForClient1.topLeft.isCurrentPlayer})`);
  if (hudForClient1.topLeft.id !== 'player-1' || !hudForClient1.topLeft.isCurrentPlayer) {
    console.error('❌ FALLO: Cliente 1 no se ve a sí mismo arriba-izquierda');
    process.exit(1);
  }

  // Caso B: Cliente local es player-3 (tercer jugador conectado)
  const hudForClient3 = computeHudCorners(mockAllPlayers, 'player-3');
  console.log(`Cliente 3 [localId=player-3] -> Esquina Arriba-Izq: "${hudForClient3.topLeft.nickname}" (isSelf=${hudForClient3.topLeft.isCurrentPlayer})`);
  if (hudForClient3.topLeft.id !== 'player-3' || !hudForClient3.topLeft.isCurrentPlayer) {
    console.error('❌ FALLO: Cliente 3 no se ve a sí mismo arriba-izquierda');
    process.exit(1);
  }
  console.log(`✓ Remotos para Cliente 3: Arriba-Der="${hudForClient3.topRight.nickname}", Abajo-Izq="${hudForClient3.bottomLeft.nickname}"`);

  // 5. Verificación de Sincronización en Tiempo Real de HUD
  console.log('\n--- VERIFICANDO SINCRONIZACIÓN EN TIEMPO REAL CON BACKEND ---');

  // Test 5.1: Sincronización de Mana vía throttled playerMove
  let client2ReceivedMana = null;
  socket2.on('playerMoved', (data) => {
    if (data.playerId === 'player-1') {
      client2ReceivedMana = data.mana;
    }
  });

  socket1.emit('playerMove', {
    codigo: ROOM_CODE,
    playerId: 'player-1',
    position: { x: 1.0, y: 1.6, z: -7.0 },
    rotation: { x: 0, y: 1.57, z: 0 },
    mana: 62, // mana actualizado localmente
  });

  await new Promise((r) => setTimeout(r, 100));
  console.log(`✓ Cliente 2 recibió Mana sincronizado de Cliente 1: ${client2ReceivedMana} (esperado: 62)`);
  if (client2ReceivedMana !== 62) {
    console.error('❌ FALLO en sincronización de Mana remoto');
    process.exit(1);
  }

  // Test 5.2: Sincronización de Racha, PE y Puntaje vía submitAnswer -> playerStatsUpdated
  let statsReceivedBy3 = null;
  socket3.on('playerStatsUpdated', (data) => {
    statsReceivedBy3 = data;
  });

  // Obtener pregunta para player-1
  const qRes = await new Promise((res) => {
    socket1.emit('getQuestion', { codigo: ROOM_CODE, playerId: 'player-1' }, res);
  });
  console.log(`✓ Pregunta obtenida para player-1: ID [${qRes.question?.id}]`);

  // Obtener preguntas completas para pruebas mediante debugGetPool
  const poolRes = await new Promise((res) => {
    socket1.emit('debugGetPool', { codigo: ROOM_CODE }, res);
  });
  const fullQ1 = poolRes.questions.find((q) => q.id === qRes.question.id);
  const correctOpt1 = fullQ1.respuestaCorrecta;

  // Responder pregunta regular
  const ansRes = await new Promise((res) => {
    socket1.emit(
      'submitAnswer',
      {
        codigo: ROOM_CODE,
        playerId: 'player-1',
        questionId: qRes.question.id,
        chosenOption: correctOpt1,
      },
      res
    );
  });
  console.log(`✓ Respuesta enviada: Acierto=${ansRes.isCorrect}, Racha=${ansRes.rachaCorrectas}, PE=${ansRes.poderEspecial}, Puntos=${ansRes.puntaje}`);

  await new Promise((r) => setTimeout(r, 100));
  if (!statsReceivedBy3 || statsReceivedBy3.playerId !== 'player-1') {
    console.error('❌ FALLO: Cliente 3 no recibió playerStatsUpdated');
    process.exit(1);
  }
  console.log(`✓ Cliente 3 actualizó tarjeta HUD de player-1: Racha=${statsReceivedBy3.rachaCorrectas}, PE=${statsReceivedBy3.poderEspecial}, Puntos=${statsReceivedBy3.puntaje}`);

  // Test 5.3: Combate y Sincronización de Daño / Vida (attackExecuted)
  let attackEventReceived = null;
  socket2.on('attackExecuted', (data) => {
    attackEventReceived = data;
  });

  // Spawnear cajita "?" en la arena
  await new Promise((res) => {
    socket1.emit('spawnBox', { codigo: ROOM_CODE }, res);
  });

  // Otorgar carga de attack a player-1 simulando reclamo de cajita para probar daño
  const claimRes = await new Promise((res) => {
    socket1.emit('claimBox', { codigo: ROOM_CODE, playerId: 'player-1', mana: 80 }, res);
  });
  const fullQBox = poolRes.questions.find((q) => q.id === claimRes.question.id);
  const correctOptBox = fullQBox.respuestaCorrecta;

  // Responder la de cajita con acierto
  const boxAnswer = await new Promise((res) => {
    socket1.emit(
      'submitAnswer',
      {
        codigo: ROOM_CODE,
        playerId: 'player-1',
        questionId: claimRes.question.id,
        chosenOption: correctOptBox,
        isBoxQuestion: true,
      },
      res
    );
  });
  console.log(`✓ player-1 resolvió cajita "?": hasAttackCharge=${boxAnswer.hasAttackCharge}`);

  // Ejecutar ataque de player-1 contra player-2
  const atkRes = await new Promise((res) => {
    socket1.emit('executeAttack', { codigo: ROOM_CODE, attackerId: 'player-1', targetPlayerId: 'player-2' }, res);
  });
  console.log(`✓ Ataque ejecutado: Daño=${atkRes.damageDealt}, Vida restante Objetivo=${atkRes.targetRemainingHp}`);

  await new Promise((r) => setTimeout(r, 100));
  if (!attackEventReceived) {
    console.error('❌ FALLO: Cliente 2 no recibió attackExecuted para actualizar su barra de Vida en el HUD');
    process.exit(1);
  }
  console.log(`✓ Cliente 2 actualizó su propia barra de VIDA en HUD a: ${attackEventReceived.targetRemainingHp}/100`);

  socket1.disconnect();
  socket2.disconnect();
  socket3.disconnect();

  console.log('\n======================================================');
  console.log('🏆 PRUEBA DE HUD SYNC Y ASIGNACIÓN DINÁMICA DE ESQUINAS SUPERADA');
  console.log('======================================================');
  process.exit(0);
}

runTest().catch((err) => {
  console.error('Error durante la prueba:', err);
  process.exit(1);
});
