# ⚔️ CodeArena 3D

> **Arena 3D Multijugador en Tiempo Real con Trivia Técnica y Combate Táctico entre Drones.**

CodeArena 3D es un videojuego interactivo web donde hasta **4 jugadores** compiten en una arena octogonal 3D. Cada jugador pilota un dron asignado a un punto cardinal, gestiona su maná, compite por capturar cajitas misteriosas (`?`) resolviendo desafíos de programación (Angular, TypeScript, JavaScript) y despliega ataques y habilidades especiales para eliminar a sus rivales y ser el último dron en pie.

---

## 🚀 Arquitectura y Tecnologías

- **Frontend:**
  - [Angular 21](https://angular.dev/) (Standalone Components, Signals, RxJS).
  - [Three.js](https://threejs.org/) (Renderizado 3D de la arena, modelos de drones procedurales, luces dinámicas, animaciones de rotores e indicadores).
  - [Socket.IO Client](https://socket.io/) (Sincronización en tiempo real a 10 Hz con throttling de red).
  - CSS3 Glassmorphism y HUD cibernético.

- **Backend:**
  - [NestJS 11+](https://nestjs.com/) (Modular, arquitectura limpia).
  - [Socket.IO Gateway](https://docs.nestjs.com/websockets/gateways) (Salas aisladas por código, eventos atómicos de combate, maná y estados).
  - [TypeORM](https://typeorm.io/) + [PostgreSQL / Supabase](https://supabase.com/) (Persistencia de jugadores, salas, rachas y estadísticas).
  - [Google Gemini API](https://ai.google.dev/) (Generación estructurada y dinámica de preguntas técnicas en vivo con fallback a banco local de preguntas).

---

## 🛠️ Requisitos Previos

- [Node.js](https://nodejs.org/) (versión 20 LTS o superior recomendada, compatible con v20, v22 y v24).
- [npm](https://www.npmjs.com/) (incluido con Node.js).
- Una base de datos PostgreSQL (local o proyecto en Supabase).
- *(Opcional)* API Key de Google Gemini para generación de preguntas con IA.

---

## 📦 Instalación y Configuración

### 1. Configurar y Levantar el Backend

1. Abre una terminal y dirígete al directorio `backend`:
   ```bash
   cd backend
   ```

2. Instala las dependencias:
   ```bash
   npm install
   ```

3. Configura tus variables de entorno creando el archivo `.env` a partir de la plantilla `.env.example`:
   ```bash
   cp .env.example .env
   ```
   Abre `.env` y configura tus credenciales:
   ```env
   PORT=3000
   DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres
   GEMINI_API_KEY=tu_api_key_aqui
   ```

4. *(Opcional)* Ejecutar las migraciones iniciales de base de datos si es la primera vez:
   ```bash
   npm run migration:run
   # o alternativamente:
   node database/run-migration.mjs
   # o ejecutando el script database/schema.sql en tu cliente SQL de Supabase/PostgreSQL
   ```

5. Inicia el servidor backend en modo desarrollo:
   ```bash
   npm run start:dev
   ```
   El backend iniciará en `http://localhost:3000`.

---

### 2. Configurar y Levantar el Frontend

1. Abre otra terminal y dirígete a la carpeta `frontend`:
   ```bash
   cd frontend
   ```

2. Instala las dependencias:
   ```bash
   npm install
   ```

3. Inicia el servidor de desarrollo de Angular:
   ```bash
   npm start
   # o alternativamente:
   npm run dev
   # o con npx:
   npx ng serve
   ```
   El frontend estará accesible por defecto en `http://localhost:4200`.

   > **Nota para Windows PowerShell:** Si ejecutas directamente `ng serve` y la terminal indica que `'ng' no se reconoce como comando`, usa `npm start` o `npx ng serve`, ya que ejecutan el binario local de Angular CLI incluido en las dependencias.

---

## 🎮 Guía de Conexión Multijugador (Jugadores 1, 2, 3 y 4)

El sistema soporta hasta **4 jugadores simultáneos por sala**, identificados por sus drones, colores y bahías cardinales:

| Jugador | Eje Cardinal | Color Dron | Bahía Spawn | Enlace de Conexión Local |
| :--- | :---: | :---: | :---: | :--- |
| **Jugador 1** *(Host)* | Norte (`-Z`) | 🔵 Cyan (`#00f0ff`) | `(0, -7.5)` | [http://localhost:4200/?playerId=1&nickname=Jugador%201](http://localhost:4200/?playerId=1&nickname=Jugador%201) |
| **Jugador 2** | Este (`+X`) | 🟣 Púrpura (`#9d4edd`) | `(7.5, 0)` | [http://localhost:4200/?playerId=2&nickname=Jugador%202](http://localhost:4200/?playerId=2&nickname=Jugador%202) |
| **Jugador 3** | Oeste (`-X`) | 🟡 Ámbar (`#ffb703`) | `(-7.5, 0)` | [http://localhost:4200/?playerId=3&nickname=Jugador%203](http://localhost:4200/?playerId=3&nickname=Jugador%203) |
| **Jugador 4** | Sur (`+Z`) | 🟢 Verde Neón (`#00ff88`) | `(0, 7.5)` | [http://localhost:4200/?playerId=4&nickname=Jugador%204](http://localhost:4200/?playerId=4&nickname=Jugador%204) |

### 🕹️ Cómo probar la partida con 4 jugadores en tu misma computadora:

1. Abre tu navegador preferido (ej. Chrome).
2. Abre **4 pestañas o ventanas distintas** (puedes usar ventanas en modo Incógnito o perfiles separados para simular 4 usuarios reales).
3. Pega la URL correspondiente en cada ventana:
   - **Ventana 1:** `http://localhost:4200/?playerId=1&nickname=Alfa`
   - **Ventana 2:** `http://localhost:4200/?playerId=2&nickname=Beta`
   - **Ventana 3:** `http://localhost:4200/?playerId=3&nickname=Gamma`
   - **Ventana 4:** `http://localhost:4200/?playerId=4&nickname=Delta`

> **Nota sobre salas personalizadas:** Por defecto todos entran a la sala `CODE-9942`. Si deseas crear una sala privada específica, puedes añadir el parámetro `&room=TU_CODIGO`, por ejemplo:
> `http://localhost:4200/?room=SALA-TEST&playerId=1&nickname=Alfa`

### 🌐 Conexión en Red Local (LAN / Varias Computadoras)

Para jugar con amigos o compañeros en la misma red local Wi-Fi / Ethernet:

1. **Host (quien corre el servidor):**
   - Averigua tu IP local (en Windows ejecuta `ipconfig`, ej: `192.168.1.50`).
   - En el frontend, levanta Angular exponiendo la interfaz a la red:
     ```bash
     npx ng serve --host 0.0.0.0 --disable-host-check
     ```
2. **Invitados (Jugadores 2, 3 y 4):**
   - Desde sus respectivas laptops o PCs, acceden al navegador usando la IP del Host:
     - Jugador 2: `http://192.168.1.50:4200/?playerId=2&nickname=Beta`
     - Jugador 3: `http://192.168.1.50:4200/?playerId=3&nickname=Gamma`
     - Jugador 4: `http://192.168.1.50:4200/?playerId=4&nickname=Delta`

---

## 🕹️ Mecánicas de Juego y Controles

```
          [ NORTE - Jugador 1 (Cyan) ]
                     ▲
                     │
 [ OESTE ] ◄─── [ ARENA ] ───► [ ESTE - Jugador 2 (Púrpura) ]
 [ Jugador 3 ]       │
   (Ámbar)           ▼
           [ SUR - Jugador 4 (Verde) ]
```

### 1. Movimiento del Dron
- **Teclas:** `W`, `A`, `S`, `D` o **Flechas Direccionales** (`↑`, `←`, `↓`, `→`).
- **Límites de la Arena:** La arena octogonal cuenta con un perímetro delimitado; los drones no pueden salir de los límites de combate.

### 2. Gestión de Maná y Bahías Cardinales
- Volar y desplazarse consume maná a un ritmo constante (**14 maná/segundo**).
- Si el maná llega a `0`, los propulsores del dron no responderán con agilidad.
- **Regeneración de Maná:** Para recargar maná (**22 maná/segundo**), regresa a la **bahía de spawn asignada a tu color y punto cardinal**. Una luz pulsante indicará la recarga activa.

### 3. Cajitas Misteriosas (`?`) y Trivia Técnica
- En el centro de la arena aparecen periódicamente **cajitas flotantes con signo de interrogación**.
- **Captura:** El primer dron en colisionar con la cajita la reclama.
- **Congelamiento y Trivia:** Al tomar la caja, tu dron se congela temporalmente y se activa en tu HUD una pregunta técnica de selección múltiple (Angular, TypeScript, JavaScript).
- **Resultados de la Trivia:**
  - ✅ **Acierto:** Ganas puntos, aumentas tu racha, sumas **Poder Especial (PE)** y obtienes **1 Carga de Ataque**. Tu dron se descongela de inmediato.
  - ❌ **Fallo:** Pierdes racha y PE. Tu dron se descongela para que busques la siguiente oportunidad.

### 4. Targeting (Fijar Objetivo) y Combate
- **Apuntar:** Haz **clic izquierdo con el ratón** sobre cualquier dron enemigo activo en la arena 3D. Aparecerá un retículo y aro indicador en el objetivo fijado.
  *(No puedes apuntarte a ti mismo ni a drones ya eliminados).*
- **Atacar (`Attack`):** Con un objetivo fijado y teniendo una carga de ataque (ganada en la trivia), presiona el botón **Atacar** en el HUD para lanzar un impacto que restará vida (HP) al rival.
- **Escudo Protector (`Shield`):** Al acumular suficiente Poder Especial (PE), puedes activar el escudo. Absorbe el 100% del siguiente impacto recibido y se desactiva.
- **Boost de Velocidad (`Speed Boost`):** Consume PE para otorgar un +50% de aceleración durante 5 segundos.

### 5. Fin de la Partida y Victoria Royale
- Los drones cuya vida llega a `0` quedan eliminados y desactivados.
- El último jugador con vida en la arena se corona como **Campeón de CodeArena 3D**.
- Se despliega la pantalla final con la tabla de clasificación (*Leaderboard*), estadísticas de puntaje y opción para reiniciar la partida.

---

## 📁 Estructura del Proyecto

```text
CodeArena 3D/
├── backend/                  # Servidor NestJS y lógica de juego
│   ├── database/             # Scripts SQL y migraciones de Postgres/Supabase
│   ├── src/
│   │   ├── game/             # Estado de sesiones en memoria y GameLoop
│   │   ├── players/          # Entidades y servicios de jugadores
│   │   ├── questions/        # Servicio de trivia y conexión Gemini IA
│   │   ├── rooms/            # Gateways WebSocket, controladores y DTOs
│   │   └── main.ts           # Entrada principal del backend
│   └── test/                 # Pruebas e2e y suites de sincronización WebSocket
│
├── frontend/                 # Aplicación cliente Angular 21
│   ├── src/
│   │   ├── app/
│   │   │   ├── core/         # Modelos de datos y servicios (Sockets, Inputs)
│   │   │   └── features/
│   │   │       ├── arena-scene/   # Escena 3D Three.js, físicas y drones
│   │   │       ├── game-room/     # Orquestador del estado de la sala
│   │   │       ├── hud-card/      # Tarjetas de estado de los 4 jugadores
│   │   │       └── trivia-panel/  # Panel interactivo de preguntas y respuestas
│   │   └── styles.css        # Estilos globales y temas cyberpunk/glassmorphism
│
├── Img/                      # Diagramas y capturas de diseño
├── .gitignore                # Reglas de exclusión para Git
└── README.md                 # Documentación general y guía de juego
```

---

## 🛡️ Licencia

Proyecto desarrollado para competencias, aprendizaje y entretenimiento. Código libre para fines educativos y demostrativos.
