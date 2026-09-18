# 🎮 CodeArena 3D - Frontend Web 3D Client

> Cliente web interactivo desarrollado con [Angular 21](https://angular.dev/), [Three.js](https://threejs.org/) y [Socket.IO Client](https://socket.io/), que ofrece una arena de combate multijugador 3D para hasta 4 jugadores, interfaz cibernética con estilo glassmorphism y desafíos de programación técnica en tiempo real.

---

## 📋 Tabla de Contenidos

1. [Características Principales](#-características-principales)
2. [Estructura del Proyecto](#-estructura-del-proyecto)
3. [Requisitos Previos](#-requisitos-previos)
4. [Instalación y Puesta en Marcha](#-instalación-y-puesta-en-marcha)
5. [Guía de Conexión Multijugador (4 Drones)](#-guía-de-conexión-multijugador-4-drones)
6. [Controles y Mecánicas](#-controles-y-mecánicas)
7. [Scripts Disponibles](#-scripts-disponibles)
8. [Despliegue y Compilación](#-despliegue-y-compilación)

---

## 🚀 Características Principales

- **Renderizado 3D con Three.js:**
  - Arena octogonal estilizada con límites perimetrales iluminados.
  - Cuatro bahías cardinales con pulsos de luz dinámicos que señalan las zonas de spawn y recarga de maná.
  - Modelos procedurales para los 4 drones de combate, equipados con rotores funcionales animados continuamente, propulsores luminosos y halos de estado.
  - Cajitas flotantes con signo de interrogación (`?`) animadas en rotación y flotación vertical.
- **Sincronización en Tiempo Real:**
  - Comunicación bidireccional mediante WebSockets a través de `SocketService`.
  - Telemetría de movimiento y orientación con *throttling* local a 10 Hz (100 ms) para preservar fluidez y optimizar el consumo de red.
- **HUD Cibernético Glassmorphism:**
  - Tarjetas de telemetría individual para los 4 jugadores: barras animadas de Vida (HP), indicador numérico de Maná, Poder Especial (PE), Racha de aciertos y Cargas de Ataque disponibles.
  - Estados visuales dinámicos de escudo activo, boost de velocidad y congelamiento temporal.
- **Mecánica de Targeting 3D:**
  - Detección precisa de clic del ratón mediante Raycasting en el espacio tridimensional para fijar drones enemigos.
  - Retículo de combate y proyector de aro luminoso debajo del objetivo seleccionado.
- **Panel Modal de Trivia Técnica:**
  - Modal interactivo superpuesto para resolver preguntas técnicas de opción múltiple (Angular, TypeScript, JavaScript).
  - Feedback visual inmediato: aciertos conceden cargas de ataque y PE; fallos reinician la racha.

---

## 🏗️ Estructura del Proyecto

```text
frontend/
├── src/
│   ├── app/
│   │   ├── core/
│   │   │   ├── models/                # Interfaces y tipos (Player, Drone, Question, CombatEvent)
│   │   │   └── services/
│   │   │       ├── socket.service.ts  # Capa de transporte WebSocket (Socket.IO)
│   │   │       └── input.service.ts   # Gestor de teclado (WASD/flechas) y ratón
│   │   │
│   │   ├── features/
│   │   │   ├── arena-scene/           # Motor 3D Three.js (geometría, luces, drones, raycasting)
│   │   │   ├── game-room/             # Orquestador del juego, conexión, estados y GameOver
│   │   │   ├── hud-card/              # Componente de tarjeta HUD para cada jugador
│   │   │   └── trivia-panel/          # Modal de preguntas de código y temporizador
│   │   │
│   │   ├── app.component.ts           # Componente raíz Standalone
│   │   └── app.config.ts              # Configuración de proveedores y Angular
│   ├── index.html                     # HTML principal con tipografías y viewport
│   ├── main.ts                        # Bootstrap de la aplicación Angular 21
│   └── styles.css                     # Estilos globales y paleta cyberpunk / glassmorphism
├── angular.json                       # Configuración del workspace de Angular CLI
├── package.json                       # Dependencias y scripts de npm
└── tsconfig.json                      # Configuración de TypeScript
```

---

## 🛠️ Requisitos Previos

- **Node.js:** Versión 20 LTS o superior (probado y compatible con Node 20, 22 y 24).
- **npm:** Gestor de paquetes incluido con Node.js.
- **Backend de CodeArena 3D:** El servidor NestJS debe estar corriendo en `http://localhost:3000`.

---

## ⚙️ Instalación y Puesta en Marcha

1. **Navegar a la carpeta frontend:**
   ```bash
   cd frontend
   ```

2. **Instalar dependencias:**
   ```bash
   npm install
   ```

3. **Iniciar el servidor de desarrollo:**
   ```bash
   npm start
   ```
   *Alternativamente puedes usar:*
   ```bash
   npm run dev
   # o bien:
   npx ng serve
   ```
   La aplicación se abrirá en `http://localhost:4200`.

> [!TIP]
> **¿Error en Windows PowerShell al escribir `ng`?**
> Si recibes el mensaje `ng : El término 'ng' no se reconoce...`, es porque Angular CLI no está instalado como ejecutable global en tu sistema. Utiliza **`npm start`** o **`npx ng serve`**, que ejecutan directamente la versión local instalada en el proyecto.

---

## 🎮 Guía de Conexión Multijugador (4 Drones)

Cada jugador controla un dron posicionado en uno de los cuatro puntos cardinales de la arena. Para simular los 4 jugadores en una misma máquina o probar en red:

| Dron | Punto Cardinal | Color Neón | Coordenadas Spawn | Enlace Directo |
| :---: | :---: | :---: | :---: | :--- |
| **Jugador 1** *(Host)* | Norte (`-Z`) | 🔵 Cyan | `(0, -7.5)` | [http://localhost:4200/?playerId=1&nickname=Alfa](http://localhost:4200/?playerId=1&nickname=Alfa) |
| **Jugador 2** | Este (`+X`) | 🟣 Púrpura | `(7.5, 0)` | [http://localhost:4200/?playerId=2&nickname=Beta](http://localhost:4200/?playerId=2&nickname=Beta) |
| **Jugador 3** | Oeste (`-X`) | 🟡 Ámbar | `(-7.5, 0)` | [http://localhost:4200/?playerId=3&nickname=Gamma](http://localhost:4200/?playerId=3&nickname=Gamma) |
| **Jugador 4** | Sur (`+Z`) | 🟢 Verde | `(0, 7.5)` | [http://localhost:4200/?playerId=4&nickname=Delta](http://localhost:4200/?playerId=4&nickname=Delta) |

### Probar 4 Jugadores en Local:
1. Abre tu navegador (Google Chrome, Edge, Firefox, etc.).
2. Abre **4 pestañas o ventanas** independientes (puedes usar modo incógnito para separar sesiones).
3. Pega los cuatro enlaces anteriores en cada pestaña.
4. *(Opcional)* Puedes usar el parámetro `&room=SALA1` para conectarte a una sala privada específica (por defecto se conecta a `CODE-9942`).

### Jugar en Red Local (LAN):
1. El anfitrión arranca el servidor Angular permitiendo conexiones externas:
   ```bash
   npx ng serve --host 0.0.0.0 --disable-host-check
   ```
2. Obtén la dirección IP local del anfitrión (ejecutando `ipconfig` en Windows, ej: `192.168.1.50`).
3. Los demás jugadores ingresan desde sus dispositivos navegando a:
   - `http://192.168.1.50:4200/?playerId=2&nickname=Beta`
   - `http://192.168.1.50:4200/?playerId=3&nickname=Gamma`
   - `http://192.168.1.50:4200/?playerId=4&nickname=Delta`

---

## 🕹️ Controles y Mecánicas

| Acción | Control | Descripción |
| :--- | :--- | :--- |
| **Volar / Desplazarse** | `W`, `A`, `S`, `D` o `↑`, `←`, `↓`, `→` | Mueve el dron dentro de la arena. Consume 14 maná/segundo. |
| **Recargar Maná** | Volver a tu bahía cardinal | Al situarte sobre la bahía asignada a tu color, recargas maná a +22/segundo. |
| **Capturar Cajita `?`** | Colisión física directa con el dron | Reclama la caja, congela tu dron y abre la pregunta de trivia técnica en el HUD. |
| **Fijar Objetivo (Targeting)** | **Clic Izquierdo** sobre un dron rival en la arena 3D | Selecciona el dron objetivo y activa el retículo de mira. |
| **Atacar** | Botón **Atacar** en el HUD | Requiere una Carga de Ataque (obtenida al acertar la trivia) y un dron enemigo fijado. |
| **Escudo Protector** | Botón **Escudo** en el HUD | Consume Poder Especial (PE) y absorbe el 100% del siguiente impacto enemigo. |
| **Boost de Velocidad** | Botón **Boost** en el HUD | Consume Poder Especial (PE) y otorga un +50% de aceleración durante 5 segundos. |

---

## 📜 Scripts Disponibles

| Comando | Descripción |
| :--- | :--- |
| `npm start` | Inicia el servidor de desarrollo de Angular en `http://localhost:4200` |
| `npm run dev` | Alias idéntico para iniciar el servidor de desarrollo |
| `npm run build` | Compila el cliente y genera el bundle optimizado en la carpeta `dist/` |
| `npm run watch` | Compila en modo desarrollo y reconstruye ante cualquier cambio de archivo |
| `npm test` | Ejecuta las pruebas unitarias con el runner de pruebas configurado |

---

## 📦 Despliegue y Compilación

Para generar el bundle estático para producción:

```bash
npm run build
```

Los artefactos de producción se generarán en la carpeta `dist/frontend/browser/`, listos para ser servidos mediante Nginx, Caddy, Vercel, Firebase Hosting o cualquier servidor de archivos estáticos.
