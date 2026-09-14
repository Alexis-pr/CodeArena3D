import { Question } from '../interfaces/question.interface';

/**
 * Banco de respaldo local según Regla R5:
 * Si la API de Gemini falla, no responde o excede la cuota,
 * se seleccionan preguntas de este banco para garantizar que el juego nunca se detenga.
 */
export const LOCAL_QUESTIONS_BANK: Record<string, Question[]> = {
  default: [
    {
      id: 'loc-01',
      enunciado: '¿Cuál es la función principal del archivo tsconfig.json en un proyecto de TypeScript?',
      opciones: [
        { id: 'A', texto: 'Configurar las opciones del compilador de TypeScript' },
        { id: 'B', texto: 'Instalar los paquetes de Node.js' },
        { id: 'C', texto: 'Definir las rutas HTTP del servidor' },
        { id: 'D', texto: 'Crear la conexión a la base de datos' },
      ],
      respuestaCorrecta: 'A',
      dificultad: 'FACIL',
    },
    {
      id: 'loc-02',
      enunciado: '¿Qué palabra clave se usa en TypeScript para crear un tipo que puede ser de varios valores posibles (Union Type)?',
      opciones: [
        { id: 'A', texto: '&' },
        { id: 'B', texto: '|' },
        { id: 'C', texto: '::' },
        { id: 'D', texto: '=>' },
      ],
      respuestaCorrecta: 'B',
      dificultad: 'FACIL',
    },
    {
      id: 'loc-03',
      enunciado: 'En NestJS, ¿qué decorador se utiliza para declarar una clase como un servicio inyectable?',
      opciones: [
        { id: 'A', texto: '@Controller()' },
        { id: 'B', texto: '@Module()' },
        { id: 'C', texto: '@Injectable()' },
        { id: 'D', texto: '@Component()' },
      ],
      respuestaCorrecta: 'C',
      dificultad: 'FACIL',
    },
    {
      id: 'loc-04',
      enunciado: 'En Angular, ¿cuál de las siguientes opciones describe mejor a un componente "Standalone"?',
      opciones: [
        { id: 'A', texto: 'Un componente que no requiere ser declarado en un NgModule' },
        { id: 'B', texto: 'Un componente que solo se puede usar en aplicaciones móviles' },
        { id: 'C', texto: 'Un componente que no tiene plantilla HTML' },
        { id: 'D', texto: 'Un servicio que corre en un hilo secundario' },
      ],
      respuestaCorrecta: 'A',
      dificultad: 'MEDIO',
    },
    {
      id: 'loc-05',
      enunciado: '¿Qué tipo de bloqueo de base de datos genera la cláusula SELECT ... FOR UPDATE en PostgreSQL?',
      opciones: [
        { id: 'A', texto: 'Bloqueo a nivel de tabla compartido' },
        { id: 'B', texto: 'Bloqueo pesimista exclusivo a nivel de fila' },
        { id: 'C', texto: 'Bloqueo optimista sin bloqueo físico' },
        { id: 'D', texto: 'Eliminación en cascada temporal' },
      ],
      respuestaCorrecta: 'B',
      dificultad: 'MEDIO',
    },
    {
      id: 'loc-06',
      enunciado: 'En Three.js, ¿cuál es la clase principal encargada de renderizar la escena 3D en el canvas HTML?',
      opciones: [
        { id: 'A', texto: 'THREE.PerspectiveCamera' },
        { id: 'B', texto: 'THREE.WebGLRenderer' },
        { id: 'C', texto: 'THREE.MeshStandardMaterial' },
        { id: 'D', texto: 'THREE.SceneManager' },
      ],
      respuestaCorrecta: 'B',
      dificultad: 'FACIL',
    },
    {
      id: 'loc-07',
      enunciado: '¿Cuál es la diferencia principal entre una interfaz (interface) y un type alias en TypeScript?',
      opciones: [
        { id: 'A', texto: 'Las interfaces admiten declaration merging, mientras que los types no' },
        { id: 'B', texto: 'Los types no pueden describir objetos' },
        { id: 'C', texto: 'Las interfaces se compilan en código JavaScript en tiempo de ejecución' },
        { id: 'D', texto: 'No hay ninguna diferencia técnica' },
      ],
      respuestaCorrecta: 'A',
      dificultad: 'DIFICIL',
    },
    {
      id: 'loc-08',
      enunciado: 'En Socket.IO, ¿qué método permite enviar un mensaje exclusivamente a los clientes suscritos a una sala?',
      opciones: [
        { id: 'A', texto: 'io.emit("evento", data)' },
        { id: 'B', texto: 'io.to("nombreSala").emit("evento", data)' },
        { id: 'C', texto: 'io.broadcastAll("evento", data)' },
        { id: 'D', texto: 'io.room("nombreSala").send(data)' },
      ],
      respuestaCorrecta: 'B',
      dificultad: 'FACIL',
    },
    {
      id: 'loc-09',
      enunciado: 'En bases de datos relacionales, ¿qué garantiza la propiedad de "Aislamiento" (Isolation) en ACID?',
      opciones: [
        { id: 'A', texto: 'Que las transacciones concurrentes no interfieran entre sí' },
        { id: 'B', texto: 'Que los datos nunca se guarden en disco' },
        { id: 'C', texto: 'Que todas las tablas tengan claves primarias autoincrementales' },
        { id: 'D', texto: 'Que el servidor se reinicie automáticamente tras una falla' },
      ],
      respuestaCorrecta: 'A',
      dificultad: 'MEDIO',
    },
    {
      id: 'loc-10',
      enunciado: '¿Qué estructura de datos subyacente utiliza generalmente un índice B-Tree en PostgreSQL?',
      opciones: [
        { id: 'A', texto: 'Un árbol balanceado de búsqueda de múltiples vías' },
        { id: 'B', texto: 'Una tabla hash en memoria volátil' },
        { id: 'C', texto: 'Una lista enlazada simple' },
        { id: 'D', texto: 'Una pila LIFO no ordenada' },
      ],
      respuestaCorrecta: 'A',
      dificultad: 'DIFICIL',
    },
    {
      id: 'loc-11',
      enunciado: 'En NestJS, ¿cuál es el ciclo de vida por defecto de un Provider o Servicio inyectado?',
      opciones: [
        { id: 'A', texto: 'Transient (se crea una instancia por cada inyección)' },
        { id: 'B', texto: 'Singleton (una sola instancia compartida en toda la aplicación)' },
        { id: 'C', texto: 'Request-scoped (una instancia por cada petición HTTP)' },
        { id: 'D', texto: 'Session-scoped (una instancia por usuario)' },
      ],
      respuestaCorrecta: 'B',
      dificultad: 'MEDIO',
    },
    {
      id: 'loc-12',
      enunciado: '¿Cuál es el propósito del operador "keyof" en TypeScript?',
      opciones: [
        { id: 'A', texto: 'Obtener una unión de tipos literales con las claves de un tipo' },
        { id: 'B', texto: 'Extraer los valores en tiempo de ejecución de un diccionario' },
        { id: 'C', texto: 'Borrar una propiedad de una clase' },
        { id: 'D', texto: 'Verificar si un archivo contiene errores de sintaxis' },
      ],
      respuestaCorrecta: 'A',
      dificultad: 'MEDIO',
    },
    {
      id: 'loc-13',
      enunciado: 'En TypeORM, ¿qué parámetro se debe configurar para evitar que la aplicación altere el esquema SQL automáticamente en producción?',
      opciones: [
        { id: 'A', texto: 'logging: false' },
        { id: 'B', texto: 'synchronize: false' },
        { id: 'C', texto: 'autoLoadEntities: false' },
        { id: 'D', texto: 'dropSchema: true' },
      ],
      respuestaCorrecta: 'B',
      dificultad: 'FACIL',
    },
    {
      id: 'loc-14',
      enunciado: 'En Angular, ¿qué función cumple el decorator @Output() combinado con un EventEmitter?',
      opciones: [
        { id: 'A', texto: 'Emitir eventos personalizados desde un componente hijo hacia su padre' },
        { id: 'B', texto: 'Recibir datos desde una API externa' },
        { id: 'C', texto: 'Guardar datos en el LocalStorage del navegador' },
        { id: 'D', texto: 'Rendir el componente en formato JSON' },
      ],
      respuestaCorrecta: 'A',
      dificultad: 'FACIL',
    },
    {
      id: 'loc-15',
      enunciado: '¿Cuál es la complejidad temporal promedio de búsqueda en una tabla Hash correctamente dimensionada?',
      opciones: [
        { id: 'A', texto: 'O(log n)' },
        { id: 'B', texto: 'O(1)' },
        { id: 'C', texto: 'O(n)' },
        { id: 'D', texto: 'O(n^2)' },
      ],
      respuestaCorrecta: 'B',
      dificultad: 'MEDIO',
    },
  ],
};
