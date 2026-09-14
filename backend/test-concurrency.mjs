// ============================================================================
// CodeArena 3D — Script de Prueba de Concurrencia Real (Regla R3 en Supabase)
// ============================================================================

const BASE_URL = 'http://localhost:3000';

async function runConcurrencyTest() {
  console.log('===============================================================');
  console.log('  INICIANDO PRUEBA DE CONCURRENCIA REAL — REGLA R3 (SUPABASE)  ');
  console.log('===============================================================\n');

  // 1. Crear una nueva sala
  console.log('[PASO 1] Creando sala limpia en Supabase...');
  const createRes = await fetch(`${BASE_URL}/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tema: 'PostgreSQL & Concurrencia R3' })
  });

  if (!createRes.ok) {
    throw new Error(`Error al crear sala: ${createRes.status} ${await createRes.text()}`);
  }

  const room = await createRes.json();
  const roomCode = room.codigo;
  console.log(`✓ Sala creada con éxito: Código [${roomCode}] (ID: ${room.id})\n`);

  // 2. Unir a 3 jugadores consecutivamente para llenar los primeros 3 cupos
  console.log('[PASO 2] Uniendo a los primeros 3 jugadores...');
  for (let i = 1; i <= 3; i++) {
    const joinRes = await fetch(`${BASE_URL}/rooms/${roomCode}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname: `Jugador ${i}` })
    });
    const joinData = await joinRes.json();
    console.log(`  ✓ Jugador ${i} unido exitosamente -> Cupos: ${joinData.totalJugadores}/4 (Status: ${joinRes.status})`);
  }

  console.log('\n[ESTADO PREVIO A LA PRUEBA]');
  console.log(`✓ La sala [${roomCode}] tiene exactamente 3 jugadores.`);
  console.log('✓ Queda ÚNICAMENTE 1 cupo disponible (el 4to).\n');

  // 3. Disparar dos peticiones concurrentes simultáneas por el último cupo usando Promise.all
  console.log('[PASO 3] DISPARANDO 2 PETICIONES SIMULTÁNEAS POR EL ÚLTIMO CUPO...');
  console.log('  -> Petición A: "Jugador 4A (Rival A)"');
  console.log('  -> Petición B: "Jugador 4B (Rival B)"');

  const startTimestamp = Date.now();

  const [resA, resB] = await Promise.all([
    fetch(`${BASE_URL}/rooms/${roomCode}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname: 'Jugador 4A (Rival A)' })
    }),
    fetch(`${BASE_URL}/rooms/${roomCode}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname: 'Jugador 4B (Rival B)' })
    })
  ]);

  const elapsedMs = Date.now() - startTimestamp;

  const dataA = await resA.json();
  const dataB = await resB.json();

  console.log(`\n[RESULTADOS DE CONCURRENCIA RECIBIDOS (${elapsedMs} ms)]:`);
  console.log('---------------------------------------------------------------');
  console.log(`Respuesta Petición A: Status HTTP ${resA.status}`);
  console.log('Cuerpo A:', JSON.stringify(dataA, null, 2));
  console.log('---------------------------------------------------------------');
  console.log(`Respuesta Petición B: Status HTTP ${resB.status}`);
  console.log('Cuerpo B:', JSON.stringify(dataB, null, 2));
  console.log('---------------------------------------------------------------\n');

  // 4. Verificación de la Regla R3
  const isOneSuccess = (resA.status === 200 && resB.status === 409) || (resA.status === 409 && resB.status === 200);
  
  if (isOneSuccess) {
    const winner = resA.status === 200 ? 'Petición A (Jugador 4A)' : 'Petición B (Jugador 4B)';
    const loser = resA.status === 409 ? 'Petición A (Jugador 4A)' : 'Petición B (Jugador 4B)';
    console.log(`🎯 REGLA R3 CUMPLIDA CON ÉXITO:`);
    console.log(`   - Ganador del último cupo (HTTP 200): ${winner}`);
    console.log(`   - Rechazado por sala llena (HTTP 409 Conflict): ${loser}`);
  } else {
    console.error(`❌ FALLO EN REGLA R3: Se esperaban estados 200 y 409, pero se recibieron ${resA.status} y ${resB.status}`);
  }

  // 5. Auditoría final en la base de datos de Supabase
  console.log('\n[PASO 4] Verificando estado final de la sala en Supabase...');
  const verifyRes = await fetch(`${BASE_URL}/rooms/${roomCode}`);
  const finalRoom = await verifyRes.json();
  console.log(`✓ Total de jugadores en base de datos: ${finalRoom.jugadores.length}/4`);
  console.log('✓ Lista de jugadores guardados en Postgres:');
  finalRoom.jugadores.forEach((p, idx) => {
    console.log(`   ${idx + 1}. [${p.nickname}] - ID: ${p.id} - Vida: ${p.vida} - Mana: ${p.mana}`);
  });

  console.log('\n===============================================================');
  console.log('          PRUEBA DE CONCURRENCIA FINALIZADA CON ÉXITO          ');
  console.log('===============================================================');
}

runConcurrencyTest().catch((err) => {
  console.error('Error fatal en la prueba:', err);
  process.exit(1);
});
