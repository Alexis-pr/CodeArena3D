const { io } = require('socket.io-client');

async function runTest() {
  console.log('=== TEST SESIÓN 5 - PARTE 4: GAME OVER, ELIMINACIÓN Y CONDICIÓN DE VICTORIA (R7) ===\n');

  const SERVER_URL = 'http://localhost:3000';

  // 1. Crear sala real en el backend
  const roomRes = await fetch(`${SERVER_URL}/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tema: 'Game Over & Victory Royale' }),
  });
  const roomData = await roomRes.json();
  const ROOM_CODE = roomData.codigo;
  console.log(`✓ Sala creada en Postgres: [${ROOM_CODE}]`);

  // 2. Conectar 2 clientes WebSocket simulando dos jugadores
  const socket1 = io(SERVER_URL, { transports: ['websocket'] });
  const socket2 = io(SERVER_URL, { transports: ['websocket'] });

  await Promise.all([
    new Promise((resolve) => socket1.on('connect', resolve)),
    new Promise((resolve) => socket2.on('connect', resolve)),
  ]);
  console.log('✓ 2 Clientes WebSocket conectados');

  // Registrar capturas de eventos
  let gameOverEventsReceived = [];
  let attackEventsReceived = [];

  socket1.on('gameOver', (data) => gameOverEventsReceived.push({ client: 'socket1', data }));
  socket2.on('gameOver', (data) => gameOverEventsReceived.push({ client: 'socket2', data }));
  socket2.on('attackExecuted', (data) => attackEventsReceived.push({ client: 'socket2', data }));

  // 3. Unir ambos jugadores a la sala
  const join1 = await new Promise((res) =>
    socket1.emit('joinRoom', { codigo: ROOM_CODE, nickname: 'Alfa Campeón' }, res)
  );
  const join2 = await new Promise((res) =>
    socket2.emit('joinRoom', { codigo: ROOM_CODE, nickname: 'Bravo Rival' }, res)
  );

  const player1Id = join1.playerId;
  const player2Id = join2.playerId;
  console.log(`✓ Jugadores unidos: Alfa Campeón (${player1Id}) vs Bravo Rival (${player2Id})`);

  // 4. Obtener preguntas de la sala para responder correctamente en cada ciclo
  const poolRes = await new Promise((res) =>
    socket1.emit('debugGetPool', { codigo: ROOM_CODE }, res)
  );
  const questions = poolRes.questions;

  // 5. Combate: Alfa responde la cajita "?" y ejecuta el golpe letal
  console.log('\n--- INICIANDO COMBATE Y GOLPE LETAL HACIA ELIMINACIÓN (HP -> 0) ---');

  // 5.1 Reclamar cajita "?" inicial
  const claim = await new Promise((res) =>
    socket1.emit('claimBox', { codigo: ROOM_CODE, playerId: player1Id, mana: 90 }, res)
  );

  if (!claim.success || !claim.question) {
    console.error('❌ FALLO: No se pudo reclamar cajita inicial');
    process.exit(1);
  }

  const currentQ = questions.find((q) => q.id === claim.question.id);
  const correctOpt = currentQ ? currentQ.respuestaCorrecta : 'A';

  // 5.2 Responder correctamente con submitAnswer para cargar Attack y PE
  const submit = await new Promise((res) =>
    socket1.emit(
      'submitAnswer',
      {
        codigo: ROOM_CODE,
        playerId: player1Id,
        questionId: claim.question.id,
        chosenOption: correctOpt,
        isBoxQuestion: true,
      },
      res
    )
  );

  if (!submit.isCorrect || !submit.hasAttackCharge) {
    console.error('❌ FALLO en submitAnswer');
    process.exit(1);
  }
  console.log(`✓ Alfa respondió correctamente -> PE: ${submit.poderEspecial} | Carga Attack: ${submit.hasAttackCharge}`);

  // 5.3 Para verificar la transición exacta de eliminación sin esperar 5 ciclos de 15s de cooldown:
  // Ajustamos la vida de Bravo a 5 HP (el ataque con PE=15 infligirá exactamente 5 DMG)
  await new Promise((res) =>
    socket1.emit('debugSetPlayerHp', { codigo: ROOM_CODE, playerId: player2Id, vida: 5 }, res)
  );
  console.log('✓ Objetivo configurado en 5 HP para prueba de impacto eliminatorio letal');

  // 5.4 Alfa ejecuta el ataque letal sobre Bravo Rival
  const attack = await new Promise((res) =>
    socket1.emit(
      'executeAttack',
      {
        codigo: ROOM_CODE,
        attackerId: player1Id,
        targetPlayerId: player2Id,
      },
      res
    )
  );

  if (!attack.success) {
    console.error('❌ FALLO en executeAttack:', attack.message);
    process.exit(1);
  }

  console.log(
    `  Alfa infligió ${attack.damageDealt} DMG -> Bravo HP: ${attack.targetRemainingHp}/100 | TargetEliminated: ${attack.targetEliminated} | GameOver: ${attack.gameOver}`
  );

  // 6. Verificación de la condición de Eliminación (Regla R7)
  console.log('\n--- VERIFICANDO ELIMINACIÓN DE BRAVO RIVAL (HP = 0) ---');
  await new Promise((r) => setTimeout(r, 200));
  const lastAttack = attackEventsReceived[attackEventsReceived.length - 1]?.data;
  if (!lastAttack || !lastAttack.targetEliminated || lastAttack.targetRemainingHp !== 0) {
    console.error('❌ FALLO: El último ataque no reportó targetEliminated = true y targetRemainingHp = 0');
    process.exit(1);
  }
  console.log('✓ Confirmado: Bravo Rival fue formalmente eliminado (targetEliminated = true, HP = 0)');

  // 7. Verificación de la condición de Victoria y Fin de Partida (Regla R7)
  console.log('\n--- VERIFICANDO CONDICIÓN DE VICTORIA Y EVENTO "gameOver" (R7) ---');
  console.log('Clientes que recibieron gameOver:', gameOverEventsReceived.map((e) => e.client));

  if (gameOverEventsReceived.length === 0) {
    console.error('❌ FALLO: No se emitió el evento "gameOver" al quedar un único dron activo');
    process.exit(1);
  }

  const goEvent1 = gameOverEventsReceived.find((e) => e.client === 'socket1')?.data;
  const goEvent2 = gameOverEventsReceived.find((e) => e.client === 'socket2')?.data;

  if (!goEvent1 || !goEvent2) {
    console.error('❌ FALLO: Uno de los clientes no recibió la notificación de gameOver');
    process.exit(1);
  }

  console.log(`✓ Evento "gameOver" recibido por ambos clientes:`);
  console.log(`  - Ganador: ${goEvent1.winnerNickname} (ID: ${goEvent1.winnerId})`);
  console.log(`  - Sala: ${goEvent1.codigo}`);

  if (goEvent1.winnerId !== player1Id) {
    console.error('❌ FALLO: El ganador identificado no coincide con Alfa Campeón');
    process.exit(1);
  }

  // 8. Verificación de la Tabla de Clasificación Final (Leaderboard)
  console.log('\n--- VERIFICANDO CLASIFICACIÓN FINAL / LEADERBOARD ---');
  console.log('Tabla de posiciones:');
  goEvent1.leaderboard.forEach((item, idx) => {
    console.log(`  ${idx + 1}º Lugar: ${item.nickname} | Puntaje: ${item.puntaje} PTS | Vida: ${item.vida} | isAlive: ${item.isAlive}`);
  });

  const firstPlace = goEvent1.leaderboard[0];
  if (firstPlace.id !== player1Id || !firstPlace.isAlive) {
    console.error('❌ FALLO: El 1er lugar del leaderboard debe ser el dron ganador y estar vivo');
    process.exit(1);
  }

  const secondPlace = goEvent1.leaderboard[1];
  if (secondPlace.id !== player2Id || secondPlace.isAlive || secondPlace.vida !== 0) {
    console.error('❌ FALLO: El 2do lugar del leaderboard debe ser el dron eliminado con vida = 0');
    process.exit(1);
  }
  console.log('✓ Leaderboard ordenado correctamente por puntaje y estado');

  // 9. Verificación de Bloqueo de Acciones Post-Game Over
  console.log('\n--- VERIFICANDO BLOQUEO DE ACCIONES TRAS FIN DE PARTIDA ---');
  const postAttack = await new Promise((res) =>
    socket1.emit('executeAttack', { codigo: ROOM_CODE, attackerId: player1Id, targetPlayerId: player2Id }, res)
  );
  if (postAttack.success) {
    console.error('❌ FALLO: Se permitió atacar tras finalizar la partida');
    process.exit(1);
  }
  console.log(`✓ Ataque bloqueado tras fin de partida: "${postAttack.message}"`);

  // 10. Consulta directa a PostgreSQL (Supabase) para verificar estado FINISHED
  console.log('\n--- VERIFICANDO PERSISTENCIA EN POSTGRESQL (SUPABASE) ---');
  const getRoomRes = await fetch(`${SERVER_URL}/rooms/${ROOM_CODE}`);
  const roomDb = await getRoomRes.json();
  console.log(`Estado persistido de la sala en Postgres: estado = "${roomDb.estado}"`);

  if (roomDb.estado !== 'FINISHED') {
    console.error('❌ FALLO: El estado en Postgres no cambió a FINISHED');
    process.exit(1);
  }
  console.log('✓ Estado FINISHED confirmado y persistido en PostgreSQL (Supabase)');

  console.log('\n================================================================');
  console.log('🏆 TEST PARTE 4 COMPLETADO CON ÉXITO: 100% FUNCIONAL');
  console.log('   1. Dron eliminado al llegar a 0 HP (isAlive=false, desactivado)');
  console.log('   2. Transición a FINISHED al quedar 1 solo jugador activo (R7)');
  console.log('   3. Evento gameOver emitido con Ganador y Leaderboard final');
  console.log('   4. Persistencia en Postgres confirmada (estado="FINISHED")');
  console.log('   5. Bloqueo de combate posterior a la conclusión');
  console.log('================================================================\n');

  socket1.disconnect();
  socket2.disconnect();
  setTimeout(() => process.exit(0), 100);
}

runTest().catch((err) => {
  console.error('Error fatal en test Game Over:', err);
  process.exit(1);
});
