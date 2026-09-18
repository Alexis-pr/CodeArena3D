# ⚙️ CodeArena 3D - Backend Engine & API

> Servidor de juego en tiempo real basado en [NestJS 11](https://nestjs.com/) con sincronización vía WebSockets ([Socket.IO](https://socket.io/)), persistencia en PostgreSQL ([Supabase](https://supabase.com/)) mediante [TypeORM](https://typeorm.io/), y generación de trivias técnicas inteligentes con [Google Gemini API](https://ai.google.dev/).

---

## 📋 Tabla de Contenidos

1. [Características Principales](#-características-principales)
2. [Arquitectura y Estructura](#-arquitectura-y-estructura)
3. [Requisitos Previos](#-requisitos-previos)
4. [Instalación y Configuración](#-instalación-y-configuración)
5. [Variables de Entorno](#-variables-de-entorno)
6. [Scripts Disponibles](#-scripts-disponibles)
7. [Protocolo WebSocket (Socket.IO)](#-protocolo-websocket-socketio)
8. [Endpoints REST](#-endpoints-rest)
9. [Suites de Pruebas y Validación](#-suites-de-pruebas-y-validación)

---

## 🚀 Características Principales

- **Aislamiento Estricto de Salas:** Cada sala (`codigo`) opera de manera independiente en Socket.IO, impidiendo que eventos de combate, movimiento o trivias interfieran con otras partidas activas.
- **GameLoop & Estado en Memoria (`GameSessionService`):** Control atómico y rápido de posiciones de drones, rotaciones, consumo de maná (14/s en vuelo, recarga 22/s en bahía natal), estados de congelamiento y targeting.
- **Mecánica de Cajitas Misteriosas (`?`):** Generación periódica en el centro de la arena, arbitraje de colisión simultánea por porcentaje de maná, congelamiento temporal del dron mientras responde y cooldown automático de 15 segundos entre apariciones.
- **Sistema de Combate Táctico:**
  - `executeAttack`: Ataque dirigido a un dron rival fijado, consumiendo 1 Carga de Ataque (ganada al acertar la trivia).
  - `activateShield`: Escudo que absorbe el 100% del siguiente impacto directo recibido.
  - `activateBoost`: Incremento de +50% de aceleración y velocidad durante 5 segundos consumiendo Poder Especial (PE).
- **Trivia Técnica con Fallback:** Consulta a la API de Google Gemini (modelo con esquema JSON estructurado) sobre temas de Angular, TypeScript y JavaScript. Si la API no está configurada o falla la red, conmuta de inmediato y de forma transparente a un banco local predefinido.
- **Persistencia Transaccional (ACID):** Registro del estado de salas y jugadores en PostgreSQL / Supabase, gestionando uniones concurrentes (hasta 4 jugadores por sala) y desconexiones sin afectar la continuidad de la partida.

---

## 🏗️ Arquitectura y Estructura

```text
backend/
├── database/
│   ├── schema.sql                 # Definición DDL de tablas "salas" y "jugadores"
│   └── run-migration.mjs          # Script Node/pg para aplicar schema.sql en Supabase
├── src/
│   ├── game/
│   │   ├── game-session.service.ts # Simulación en memoria de drones, cajas y combate
│   │   └── game.module.ts
│   ├── players/
│   │   ├── entities/player.entity.ts # Entidad TypeORM para la tabla "jugadores"
│   │   ├── players.service.ts
│   │   └── players.module.ts
│   ├── questions/
│   │   ├── questions.service.ts   # Integración con Gemini AI y banco local
│   │   └── questions.module.ts
│   ├── rooms/
│   │   ├── dto/                   # DTOs de validación (CreateRoom, JoinRoom)
│   │   ├── entities/room.entity.ts # Entidad TypeORM para la tabla "salas"
│   │   ├── rooms.controller.ts    # Controladores HTTP REST
│   │   ├── rooms.gateway.ts       # Gateway WebSocket (Socket.IO) con lógica de eventos
│   │   ├── rooms.service.ts       # Lógica transaccional de uniones y salas
│   │   └── rooms.module.ts
│   ├── app.module.ts              # Módulo raíz de NestJS y configuración TypeORM
│   └── main.ts                    # Bootstrap del servidor NestJS (puerto y CORS)
├── test/                          # Pruebas e2e estándar de NestJS
├── test-*.mjs / test-*.js         # Suites de pruebas de integración y carga en vivo
├── package.json                   # Dependencias y scripts de npm
└── tsconfig.json                  # Configuración de compilador TypeScript
```

---

## 🛠️ Requisitos Previos

- **Node.js:** Versión 20 LTS o superior (compatible con Node 20, 22 y 24).
- **npm:** Gestor de paquetes incluido con Node.js.
- **PostgreSQL / Supabase:** Base de datos relacional accesible vía cadena de conexión `DATABASE_URL`.
- *(Opcional)* **Google Gemini API Key:** Para generación de preguntas mediante IA en vivo.

---

## ⚙️ Instalación y Configuración

1. **Navegar a la carpeta backend:**
   ```bash
   cd backend
   ```

2. **Instalar dependencias:**
   ```bash
   npm install
   ```

3. **Configurar variables de entorno:**
   Copia el archivo `.env.example` como `.env`:
   ```bash
   cp .env.example .env
   # En Windows PowerShell:
   # Copy-Item .env.example .env
   ```

4. **Ejecutar migraciones en la base de datos:**
   ```bash
   npm run migration:run
   # o alternativamente:
   node database/run-migration.mjs
   ```

5. **Iniciar en modo desarrollo:**
   ```bash
   npm run start:dev
   ```
   El servidor iniciará por defecto en `http://localhost:3000`.

---

## 🔑 Variables de Entorno

Configuradas dentro del archivo `.env`:

| Variable | Descripción | Ejemplo / Valor por Defecto |
| :--- | :--- | :--- |
| `PORT` | Puerto donde corre el servidor HTTP y WebSocket | `3000` |
| `DATABASE_URL` | Cadena de conexión PostgreSQL (modo directo en puerto 5432 para transacciones seguras) | `postgresql://postgres:pass@db.proj.supabase.co:5432/postgres` |
| `GEMINI_API_KEY` | *(Opcional)* Clave de API de Google AI Studio | `AIzaSy...` |

---

## 📜 Scripts Disponibles

| Comando | Descripción |
| :--- | :--- |
| `npm run start` | Inicia el backend en modo estándar |
| `npm run start:dev` | Inicia el backend con hot-reload para desarrollo |
| `npm run start:prod` | Ejecuta el código transpilado en producción (`dist/main.js`) |
| `npm run build` | Compila el proyecto TypeScript hacia la carpeta `dist/` |
| `npm run migration:run` | Aplica el esquema `schema.sql` en la base de datos de PostgreSQL/Supabase |
| `npm run lint` | Ejecuta ESLint para revisión y corrección de estilo de código |
| `npm test` | Ejecuta las pruebas unitarias con Jest |
| `npm run test:e2e` | Ejecuta las pruebas de extremo a extremo (E2E) |

---

## 📡 Protocolo WebSocket (Socket.IO)

El servidor expone el namespace raíz de Socket.IO con soporte para orígenes `http://localhost:4200` y `http://127.0.0.1:4200`.

### 1. Mensajes Recibidos por el Servidor (`@SubscribeMessage`)

| Evento | Payload del Cliente | Descripción |
| :--- | :--- | :--- |
| `joinRoom` | `{ codigo, nickname, playerId? }` | Une el socket a la sala nativa. Asigna bahía cardinal y crea la sesión en memoria. |
| `playerMove` | `{ codigo, playerId, position, rotation, mana }` | Transmite la telemetría del dron a los demás jugadores de la sala (throttled a 10 Hz). |
| `claimBox` | `{ codigo, playerId, mana }` | Intenta capturar la cajita `?`. Congela el dron y entrega una pregunta de trivia. |
| `getQuestion` | `{ codigo, playerId }` | Solicita la pregunta actual asignada al jugador. |
| `submitAnswer` | `{ codigo, playerId, questionId, chosenOption, isBoxQuestion? }` | Procesa la respuesta. Otorga PE, racha y carga de ataque si es correcta. Inicia cooldown de la cajita. |
| `executeAttack` | `{ codigo, attackerId, targetPlayerId }` | Ejecuta el ataque con targeting sobre el dron rival objetivo. |
| `activateShield` | `{ codigo, playerId }` | Consume PE y levanta el escudo que absorbe el siguiente daño. |
| `activateBoost` | `{ codigo, playerId }` | Consume PE y aplica aceleración +50% durante 5 segundos. |
| `leaveRoom` | `{ codigo }` | Desconecta voluntariamente al jugador de la sala. |

### 2. Mensajes Emitidos por el Servidor

| Evento | Destinatarios | Payload / Descripción |
| :--- | :--- | :--- |
| `playerJoined` | Todos en la sala | `{ codigo, playerId, nickname, totalJugadores }` |
| `playerMoved` | Demás clientes de la sala | `{ playerId, position, rotation, mana }` |
| `playerDisconnected` | Todos en la sala | `{ playerId, nickname, codigo }` |
| `boxSpawned` | Todos en la sala | `{ id, position: { x, y, z }, active: true }` |
| `boxInteracted` | Todos en la sala | `{ codigo, boxId, playerId, nickname, isFrozen: true }` |
| `boxDespawned` | Todos en la sala | `{ codigo, cooldownSeconds: 15 }` |
| `playerStatsUpdated` | Todos en la sala | `{ playerId, rachaCorrectas, poderEspecial, puntaje, hasAttackCharge, isFrozen, ... }` |
| `attackExecuted` | Todos en la sala | `{ attackerId, targetPlayerId, damageDealt, targetRemainingHp, shieldAbsorbed, targetEliminated, gameOver, ... }` |
| `shieldActivated` | Todos en la sala | `{ playerId, nickname, hasShield: true }` |
| `boostActivated` | Todos en la sala | `{ playerId, nickname, speedMultiplier: 1.5, durationMs: 5000 }` |
| `gameOver` | Todos en la sala | `{ winnerId, winnerNickname, leaderboard: [...] }` |

---

## 🌐 Endpoints REST

| Método | Ruta | Descripción | Payload |
| :---: | :--- | :--- | :--- |
| `POST` | `/rooms` | Crea una nueva sala con código de 4 a 10 caracteres | `{ "codigo": "CODE-9942", "tema": "TypeScript" }` |
| `POST` | `/rooms/:codigo/join` | Une atómicamente a un jugador en PostgreSQL | `{ "nickname": "Alfa" }` |
| `GET` | `/rooms/:codigo` | Obtiene el estado de la sala y jugadores registrados | *Ninguno* |

---

## 🧪 Suites de Pruebas y Validación

El backend incluye scripts autónomos para validar cada subsistema del juego:

```bash
# Probar combate y resolución de impactos:
node test-combat.mjs

# Probar captura de cajitas '?' y desempate por maná:
node test-box-mechanic.mjs

# Probar targeting 3D y flujo de ataque:
node test-session5-targeting-box.js

# Probar ciclo de Game Over y tabla de clasificación:
node test-session5-game-over.js

# Probar concurrencia y uniones simultáneas:
node test-concurrency.mjs

# Probar generación de preguntas con la API en vivo de Gemini:
node test-gemini-live.mjs
```
