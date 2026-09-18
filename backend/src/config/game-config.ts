/**
 * ============================================================================
 * ARCHIVO CENTRAL DE CONFIGURACIÓN Y BALANCE DE JUEGO (GAME CONFIG)
 * ============================================================================
 * Puedes modificar aquí directamente cualquier valor del juego (vida, daño,
 * maná, tiempo de reaparición de cajas, habilidades, puntajes, etc.) y el
 * servidor aplicará los cambios de forma centralizada.
 */

export const GAME_CONFIG = {
  // --------------------------------------------------------------------------
  // 1. CAJAS MISTERIOSAS ("?")
  // --------------------------------------------------------------------------
  BOX: {
    /** Tiempo de espera (en segundos) para que vuelva a salir una nueva caja tras ser consumida */
    COOLDOWN_SECONDS: 10,

    /** Tiempo equivalente en milisegundos para temporizadores internos */
    get COOLDOWN_MS(): number {
      return this.COOLDOWN_SECONDS * 1000;
    },

    /** Radio máximo dentro de la arena octagonal donde puede spawnear una caja */
    SPAWN_RADIUS_MAX: 5.5,

    /** Altura flotante de la caja sobre el suelo (eje Y) */
    FLOAT_HEIGHT_Y: 0.75,
  },

  // --------------------------------------------------------------------------
  // 2. ESTADÍSTICAS DEL JUGADOR / DRON
  // --------------------------------------------------------------------------
  PLAYER: {
    /** Vida máxima y vida con la que inicia cada jugador */
    MAX_HP: 100,

    /** Maná inicial con el que comienza el dron */
    INITIAL_MANA: 100,

    /** Maná máximo permitido */
    MAX_MANA: 100,

    /** Poder Especial (PE) inicial */
    INITIAL_PE: 0,

    /** Poder Especial (PE) máximo acumulable */
    MAX_PE: 100,
  },

  // --------------------------------------------------------------------------
  // 3. COMBATE Y DAÑO DIRECTO
  // --------------------------------------------------------------------------
  COMBAT: {
    /**
     * Daño infligido por el ataque directo según el nivel de Poder Especial (PE):
     * - Tier 1: 0% a 24% PE
     * - Tier 2: 25% a 49% PE
     * - Tier 3: 50% a 74% PE
     * - Tier 4: 75% a 100% PE
     */
    DAMAGE_BY_PE_TIER: {
      TIER_1_LOW: 5,    // 0 - 24% PE
      TIER_2_MED: 10,   // 25 - 49% PE
      TIER_3_HIGH: 15,  // 50 - 74% PE
      TIER_4_MAX: 20,   // 75 - 100% PE
    },

    /** ¿El escudo absorbe el 100% del siguiente ataque recibido? (true = sí) */
    SHIELD_ABSORBS_FULL_DAMAGE: true,
  },

  // --------------------------------------------------------------------------
  // 4. HABILIDADES ESPECIALES (ESCUDO Y BOOST)
  // --------------------------------------------------------------------------
  SKILLS: {
    /** Poder Especial (PE) mínimo requerido para activar Escudo o Boost */
    PE_REQUIRED_TO_UNLOCK: 100,

    /** O alternativamente, racha de respuestas correctas requerida para desbloquear */
    STREAK_REQUIRED_TO_UNLOCK: 4,

    /** Multiplicador de velocidad al activar Boost (1.5 = +50% de velocidad extra) */
    BOOST_SPEED_MULTIPLIER: 1.5,

    /** Duración del efecto de Boost en milisegundos (5000 ms = 5 segundos) */
    BOOST_DURATION_MS: 5000,
  },

  // --------------------------------------------------------------------------
  // 5. TRIVIA, PREGUNTAS Y PUNTUACIÓN
  // --------------------------------------------------------------------------
  TRIVIA: {
    /** Puntos otorgados al atacante/jugador por cada respuesta correcta */
    POINTS_PER_CORRECT: 10,

    /** Cantidad total de preguntas generadas por Gemini AI para la sala */
    TOTAL_QUESTIONS_PER_ROOM: 15,

    /** Escalado de Poder Especial (PE) ganado según la racha actual de aciertos */
    PE_GAIN_BY_STREAK: {
      STREAK_1: 15,
      STREAK_2: 18,
      STREAK_3: 21,
      STREAK_4_PLUS: 25,
    },

    /** Penalización de PE al equivocarse en una pregunta */
    PE_LOSS_ON_FAIL: 18,
  },
};
