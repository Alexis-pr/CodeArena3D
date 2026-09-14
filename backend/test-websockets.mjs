// ============================================================================
// CodeArena 3D — Prueba de WebSockets y Aislamiento de Salas (Socket.IO)
// ============================================================================

import { io } from 'socket.io-client';

const SERVER_URL = 'http://localhost:3000';

async function createRoom(tema) {
  const res = await fetch(`${SERVER_URL}/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tema })
  });
  return res.json();
}

async function runWebSocketTest() {
  console.log('===============================================================');
  console.log('  PRUEBA DE WEBSOCKETS — SALAS NATIVAS Y AISLAMIENTO TOTAL     ');
  console.log('===============================================================\n');

  // 1. Crear dos salas independientes en Supabase
  console.log('[PASO 1] Creando dos salas distintas en base de datos...');
  const roomA = await createRoom('Angular & Three.js (Sala A)');
  const roomB = await createRoom('NestJS & WebSockets (Sala B)');

  console.log(`✓ Sala A creada: [${roomA.codigo}]`);
  console.log(`✓ Sala B creada: [${roomB.codigo}]\n`);

  // Event trackers
  const client1Events = [];
  const client3Events = [];

  // 2. Conectar Cliente 1 a Sala A
  console.log('[PASO 2] Conectando Cliente 1 a Sala A...');
  const socket1 = io(SERVER_URL);
  
  await new Promise((resolve) => socket1.on('connect', resolve));
  socket1.on('playerJoined', (data) => client1Events.push({ type: 'playerJoined', data }));
  socket1.on('playerDisconnected', (data) => client1Events.push({ type: 'playerDisconnected', data }));

  const joinAck1 = await socket1.emitWithAck('joinRoom', {
    codigo: roomA.codigo,
    nickname: 'Comandante Alfa (Cliente 1)'
  });
  console.log(`✓ Cliente 1 suscrito a sala nativa [${roomA.codigo}] (Ack: ${joinAck1.success})\n`);

  // 3. Conectar Cliente 3 a Sala B (Debe estar 100% aislado de Sala A)
  console.log('[PASO 3] Conectando Cliente 3 a Sala B...');
  const socket3 = io(SERVER_URL);
  await new Promise((resolve) => socket3.on('connect', resolve));
  socket3.on('playerJoined', (data) => client3Events.push({ type: 'playerJoined', data }));
  socket3.on('playerDisconnected', (data) => client3Events.push({ type: 'playerDisconnected', data }));

  const joinAck3 = await socket3.emitWithAck('joinRoom', {
    codigo: roomB.codigo,
    nickname: 'Comandante Gamma (Cliente 3)'
  });
  console.log(`✓ Cliente 3 suscrito a sala nativa [${roomB.codigo}] (Ack: ${joinAck3.success})\n`);

  // 4. Conectar Cliente 2 a Sala A
  console.log('[PASO 4] Conectando Cliente 2 a Sala A...');
  const socket2 = io(SERVER_URL);
  await new Promise((resolve) => socket2.on('connect', resolve));

  const joinAck2 = await socket2.emitWithAck('joinRoom', {
    codigo: roomA.codigo,
    nickname: 'Copiloto Beta (Cliente 2)'
  });
  console.log(`✓ Cliente 2 se unió a Sala A (Ack: ${joinAck2.success})`);

  // Esperar propagación de eventos
  await new Promise((r) => setTimeout(r, 800));

  // 5. Verificar Aislamiento
  console.log('\n[PASO 5] Verificando aislamiento de eventos:');
  const client1ReceivedBeta = client1Events.some(
    (e) => e.type === 'playerJoined' && e.data.nickname === 'Copiloto Beta (Cliente 2)'
  );
  const client3ReceivedBeta = client3Events.some(
    (e) => e.type === 'playerJoined' && e.data.nickname === 'Copiloto Beta (Cliente 2)'
  );

  console.log(`  - Cliente 1 (Sala A) recibió playerJoined de Cliente 2: ${client1ReceivedBeta ? 'SÍ ✓' : 'NO ❌'}`);
  console.log(`  - Cliente 3 (Sala B) recibió playerJoined de Cliente 2: ${client3ReceivedBeta ? 'SÍ (ERROR DE AISLAMIENTO) ❌' : 'NO (AISLADO CORRECTAMENTE) ✓'}`);

  // 6. Desconectar Cliente 2 y verificar notificación en Sala A (R9)
  console.log('\n[PASO 6] Desconectando Cliente 2 de Sala A (Prueba Regla R9)...');
  socket2.disconnect();

  await new Promise((r) => setTimeout(r, 800));

  const client1ReceivedDisconnect = client1Events.some((e) => e.type === 'playerDisconnected');
  const client3ReceivedDisconnect = client3Events.some((e) => e.type === 'playerDisconnected');

  console.log(`  - Cliente 1 (Sala A) recibió playerDisconnected: ${client1ReceivedDisconnect ? 'SÍ ✓' : 'NO ❌'}`);
  console.log(`  - Cliente 3 (Sala B) recibió playerDisconnected: ${client3ReceivedDisconnect ? 'SÍ ❌' : 'NO (AISLADO) ✓'}`);

  // Desconectar clientes restantes
  socket1.disconnect();
  socket3.disconnect();

  console.log('\n===============================================================');
  if (client1ReceivedBeta && !client3ReceivedBeta && client1ReceivedDisconnect && !client3ReceivedDisconnect) {
    console.log('🎯 CONDICIÓN CUMPLIDA: SALAS NATIVAS DE SOCKET.IO Y AISLAMIENTO 100% VERIFICADO');
  } else {
    console.error('❌ ERROR EN PRUEBA DE AISLAMIENTO');
  }
  console.log('===============================================================');
}

runWebSocketTest().catch(console.error);
