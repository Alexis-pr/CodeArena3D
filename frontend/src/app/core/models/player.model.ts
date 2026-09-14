/**
 * Modelo de datos del jugador para visualización y sincronización en tiempo real
 */
export interface PlayerHudData {
  id: string | number;
  nickname: string;
  color: string;
  vida: number;            // 0 - 100 (Verde)
  mana: number;            // 0 - 100 (Celeste)
  poderEspecial: number;   // 0 - 100 (Roja)
  rachaCorrectas: number;  // Racha de respuestas acertadas
  puntaje?: number;        // Puntaje acumulado (respuestas × 10 + daño)
  isCurrentPlayer?: boolean; // Si es el cliente local
  targetPlayerId?: string | number | null; // Objetivo fijado para combate
  hasShield?: boolean;     // Escudo activo
  hasBoost?: boolean;      // Aceleración activa
  hasAttackCharge?: boolean; // Carga de ataque disponible
  isEliminated?: boolean;  // Dron destruido (0 HP)
  isDisconnected?: boolean;
}

