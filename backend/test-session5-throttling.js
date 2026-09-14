const { io } = require('socket.io-client');

async function runTest() {
  console.log('=== TEST SESIÓN 5 - PARTE 1: SINCRONIZACIÓN DE POSICIÓN, THROTTLING Y MANA ===\n');

  const SERVER_URL = 'http://localhost:3000';
  
  // Crear sala real en backend / Supabase
  const roomRes = await fetch(`${SERVER_URL}/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tema: 'Sincronización y Throttling' }),
  });
  const roomData = await roomRes.json();
  const ROOM_CODE = roomData.codigo;

  console.log(`Sala real creada en Supabase: [${ROOM_CODE}]`);
  console.log(`Conectando clientes A y B a ${SERVER_URL} en sala ${ROOM_CODE}...`);

  const socketA = io(SERVER_URL, { transports: ['websocket'] });
  const socketB = io(SERVER_URL, { transports: ['websocket'] });

  await Promise.all([
    new Promise((resolve) => socketA.on('connect', resolve)),
    new Promise((resolve) => socketB.on('connect', resolve)),
  ]);

  console.log(`✓ Cliente A conectado (${socketA.id})`);
  console.log(`✓ Cliente B conectado (${socketB.id})`);

  // Unirse a la sala
  await new Promise((resolve) => {
    socketA.emit('joinRoom', { codigo: ROOM_CODE, nickname: 'Dron-Alfa', playerId: 'player-alpha' }, resolve);
  });
  await new Promise((resolve) => {
    socketB.emit('joinRoom', { codigo: ROOM_CODE, nickname: 'Dron-Beta', playerId: 'player-beta' }, resolve);
  });

  console.log(`✓ Ambos clientes unidos a la sala nativa "${ROOM_CODE}"`);

  // Verificación 1: Cliente A no debe recibir su propio playerMoved (sin eco/loopback)
  let echoReceivedByA = false;
  socketA.on('playerMoved', (data) => {
    if (data.playerId === 'player-alpha') {
      echoReceivedByA = true;
    }
  });

  // Verificación 2: Cliente B recibe los movimientos y medimos los intervalos
  const receivedUpdates = [];
  socketB.on('playerMoved', (data) => {
    receivedUpdates.push({
      timestamp: Date.now(),
      data,
    });
  });

  console.log('\n--- SIMULANDO LOOP LOCAL A 60 FPS CON THROTTLING DE 100MS ---');
  // Simularemos 30 frames de render (~500ms a 16.6ms por frame)
  // Con throttling a 100ms, deberían emitirse únicamente 5-6 mensajes, jamás 30.
  let lastMoveEmitTime = 0;
  let posX = 0;
  let localMana = 80;

  const totalFrames = 30;
  const frameIntervalMs = 16.6; // 60 FPS

  for (let frame = 0; frame < totalFrames; frame++) {
    // Cálculo de movimiento local en cada frame (60 FPS fluido)
    posX += 0.05;
    localMana = Math.max(0, localMana - 0.2); // consumo local

    const now = Date.now();
    // Condición estricta de throttling de 100ms
    if (now - lastMoveEmitTime >= 100) {
      lastMoveEmitTime = now;
      socketA.emit('playerMove', {
        codigo: ROOM_CODE,
        playerId: 'player-alpha',
        position: { x: Number(posX.toFixed(3)), y: 1.6, z: -7.5 },
        rotation: { x: 0, y: 1.57, z: 0 },
        mana: Math.round(localMana),
      });
    }

    await new Promise((r) => setTimeout(r, frameIntervalMs));
  }

  // Esperar 150ms para asegurar la llegada de los últimos paquetes en red local
  await new Promise((r) => setTimeout(r, 150));

  console.log(`\nFrames locales simulados: ${totalFrames} (equivalente a 60 FPS)`);
  console.log(`Actualizaciones emitidas y recibidas por Cliente B: ${receivedUpdates.length}`);

  // Validaciones
  if (echoReceivedByA) {
    console.error('❌ FALLO: Cliente A recibió eco de su propio movimiento.');
    process.exit(1);
  } else {
    console.log('✓ Aislamiento verificado: Cliente A NO recibió eco de su propio movimiento (client.to(codigo)).');
  }

  if (receivedUpdates.length < 4 || receivedUpdates.length > 7) {
    console.error(`❌ FALLO: Número inesperado de emisiones throttled (${receivedUpdates.length}). Esperado: entre 4 y 7.`);
    process.exit(1);
  } else {
    console.log(`✓ Throttling verificado: En 500ms a 60 FPS se emitieron sólo ${receivedUpdates.length} paquetes (~10 Hz en vez de 30).`);
  }

  // Validar contenido del payload (posición, rotación y mana)
  const first = receivedUpdates[0].data;
  const last = receivedUpdates[receivedUpdates.length - 1].data;

  console.log('\n--- VERIFICACIÓN DEL PAYLOAD COMPLETO ---');
  console.log('Primer paquete recibido en Cliente B:', first);
  console.log('Último paquete recibido en Cliente B:', last);

  if (
    typeof first.position?.x !== 'number' ||
    typeof first.rotation?.y !== 'number' ||
    typeof first.mana !== 'number'
  ) {
    console.error('❌ FALLO: El payload no contiene position, rotation o mana como números.');
    process.exit(1);
  }

  console.log(`✓ Posición X inicial: ${first.position.x} -> final: ${last.position.x}`);
  console.log(`✓ Mana inicial: ${first.mana} -> final: ${last.mana} (sincronizado dentro del canal throttled)`);

  // Validar intervalos entre paquetes recibidos (~100ms)
  console.log('\n--- INTERVALOS TEMPORALES ENTRE PAQUETES RECIBIDOS ---');
  for (let i = 1; i < receivedUpdates.length; i++) {
    const diff = receivedUpdates[i].timestamp - receivedUpdates[i - 1].timestamp;
    console.log(`  Intervalo paquete ${i} -> ${i + 1}: ${diff}ms (meta: ~100ms)`);
  }

  socketA.disconnect();
  socketB.disconnect();

  console.log('\n======================================================');
  console.log('🏆 PRUEBA DE SINCRONIZACIÓN Y THROTTLING SUPERADA AL 100%');
  console.log('======================================================');
  process.exit(0);
}

runTest().catch((err) => {
  console.error('Error durante la prueba:', err);
  process.exit(1);
});
