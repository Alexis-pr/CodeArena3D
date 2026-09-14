/**
 * Estructura de opción individual (A, B, C, D)
 */
export interface TriviaOption {
  id: 'A' | 'B' | 'C' | 'D';
  texto: string;
}

/**
 * Modelo de Pregunta de Trivia según Regla R4 de Gemini.md:
 * - Enunciado
 * - Opciones múltiples
 * - Única respuesta correcta
 * - Nivel de dificultad
 */
export interface TriviaQuestion {
  id: string;
  enunciado: string;
  opciones: TriviaOption[];
  respuestaCorrecta: 'A' | 'B' | 'C' | 'D';
  dificultad: 'FACIL' | 'MEDIO' | 'DIFICIL';
  habilidadAsociada?: 'BOOST' | 'ATTACK' | 'SHIELD';
}
