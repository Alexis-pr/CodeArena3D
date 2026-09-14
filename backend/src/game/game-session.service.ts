import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Question } from '../questions/interfaces/question.interface';
import { Player } from '../players/entities/player.entity';
import { Room } from '../rooms/entities/room.entity';
import { QuestionsService } from '../questions/questions.service';

export interface PlayerGameState {
  playerId: string;
  nickname: string;
  questionIndex: number;
  rachaCorrectas: number;
  poderEspecial: number;
  puntaje: number;
  vida: number;
  mana: number;
  hasShield: boolean;
  hasAttackCharge: boolean;
  isFrozen: boolean;
  isAlive: boolean;
  speedMultiplier: number;
  boostExpiresAt: number;
}

export interface AttackBoxState {
  id: string;
  position: { x: number; y: number; z: number };
  spawnedAt: number;
  claimedByPlayerId: string | null;
  claimedByNickname: string | null;
}

export interface RoomGameState {
  codigo: string;
  tema: string;
  questions: Question[];
  players: Map<string, PlayerGameState>;
  activeBox: AttackBoxState | null;
  boxCooldownUntil: number;
  estado: 'WAITING' | 'PLAYING' | 'FINISHED';
  winnerId: string | null;
  winnerNickname: string | null;
}

export interface AttackResult {
  success: boolean;
  message?: string;
  attackerId: string;
  targetPlayerId: string;
  damageDealt: number;
  targetRemainingHp: number;
  shieldAbsorbed: boolean;
  targetEliminated: boolean;
  gameOver: boolean;
  winner?: { id: string; nickname: string } | null;
  attackerPuntaje?: number;
}

export interface AnswerResult {
  isCorrect: boolean;
  correctAnswer: 'A' | 'B' | 'C' | 'D';
  rachaCorrectas: number;
  poderEspecial: number;
  puntaje: number;
  peGainedOrLost: number;
  canUnlockSpecial: boolean; // Regla R10: poderEspecial >= 100 O racha >= 4
  nextQuestion: Omit<Question, 'respuestaCorrecta'> | null;
  hasAttackCharge?: boolean;
  isFrozen?: boolean;
}

@Injectable()
export class GameSessionService {
  private readonly logger = new Logger(GameSessionService.name);

  // Estado rápido en memoria por sala
  private readonly activeRooms: Map<string, RoomGameState> = new Map();

  constructor(
    private readonly dataSource: DataSource,
    private readonly questionsService: QuestionsService,
  ) {}

  /**
   * Verifica si la sala ya cuenta con pool activo en memoria
   */
  hasRoom(codigo: string): boolean {
    return this.activeRooms.has(codigo.toUpperCase().trim());
  }

  /**
   * Garantiza que la sala esté inicializada con su pool de preguntas en memoria
   */
  async ensureRoomInitialized(codigo: string, tema: string): Promise<void> {
    const normalizedCode = codigo.toUpperCase().trim();
    if (!this.activeRooms.has(normalizedCode)) {
      this.logger.log(`Inicializando pool de sala [${normalizedCode}] con tema: "${tema}"`);
      const questions = await this.questionsService.generateQuestionsBatch(tema, 15);
      this.initializeRoom(normalizedCode, tema, questions);
    }
  }

  /**
   * Inicializa el pool de 15 preguntas generado para una sala
   */
  initializeRoom(codigo: string, tema: string, questions: Question[]): void {
    const normalizedCode = codigo.toUpperCase().trim();
    this.activeRooms.set(normalizedCode, {
      codigo: normalizedCode,
      tema,
      questions,
      players: new Map(),
      activeBox: null,
      boxCooldownUntil: 0,
      estado: 'PLAYING',
      winnerId: null,
      winnerNickname: null,
    });
    this.logger.log(`Sala [${normalizedCode}] inicializada en memoria con ${questions.length} preguntas.`);
  }

  /**
   * Registra un jugador en la sesión de juego en memoria
   */
  registerPlayer(
    codigo: string,
    playerId: string,
    nickname: string,
    initialStats?: { rachaCorrectas?: number; poderEspecial?: number; puntaje?: number; vida?: number },
  ): void {
    const normalizedCode = codigo.toUpperCase().trim();
    const roomState = this.activeRooms.get(normalizedCode);
    if (!roomState) return;

    if (!roomState.players.has(playerId)) {
      roomState.players.set(playerId, {
        playerId,
        nickname,
        questionIndex: 0,
        rachaCorrectas: initialStats?.rachaCorrectas ?? 0,
        poderEspecial: initialStats?.poderEspecial ?? 0,
        puntaje: initialStats?.puntaje ?? 0,
        vida: initialStats?.vida ?? 100,
        mana: 100,
        hasShield: false,
        hasAttackCharge: false,
        isFrozen: false,
        isAlive: (initialStats?.vida ?? 100) > 0,
        speedMultiplier: 1.0,
        boostExpiresAt: 0,
      });
      this.logger.log(`Jugador [${nickname}] (${playerId}) registrado en pool de sala [${normalizedCode}]`);
    }
  }

  /**
   * Obtiene la pregunta actual para un jugador (sin revelar la respuesta correcta al cliente)
   */
  getCurrentQuestion(codigo: string, playerId: string): Omit<Question, 'respuestaCorrecta'> | null {
    const normalizedCode = codigo.toUpperCase().trim();
    const roomState = this.activeRooms.get(normalizedCode);
    if (!roomState || roomState.questions.length === 0) return null;

    const playerState = roomState.players.get(playerId);
    if (!playerState) return null;

    const currentQ = roomState.questions[playerState.questionIndex % roomState.questions.length];
    
    // Regla R6: Nunca enviar la respuesta correcta al cliente
    return {
      id: currentQ.id,
      enunciado: currentQ.enunciado,
      opciones: currentQ.opciones,
      dificultad: currentQ.dificultad,
    };
  }

  /**
   * Resuelve la respuesta enviada por el jugador:
   * - Calcula racha y PE escalado según las reglas de Sesión 4
   * - Actualiza la memoria rápida para el loop de juego
   * - Persiste racha_correctas y poder_especial en PostgreSQL (Supabase) como fuente de verdad
   * - Si es pregunta de cajita ('?'): si acierta otorga carga de Attack y descongela movimiento
   */
  async submitAnswer(
    codigo: string,
    playerId: string,
    questionId: string,
    chosenOption: 'A' | 'B' | 'C' | 'D',
    isBoxQuestion: boolean = false,
  ): Promise<AnswerResult> {
    const normalizedCode = codigo.toUpperCase().trim();
    const roomState = this.activeRooms.get(normalizedCode);
    if (!roomState) {
      throw new NotFoundException(`La sala [${normalizedCode}] no está activa en memoria.`);
    }

    const playerState = roomState.players.get(playerId);
    if (!playerState) {
      throw new NotFoundException(`El jugador ${playerId} no está registrado en la sala [${normalizedCode}].`);
    }

    const currentQ = roomState.questions[playerState.questionIndex % roomState.questions.length];
    if (currentQ.id !== questionId) {
      this.logger.warn(`Desfase de pregunta: recibida ${questionId}, esperada ${currentQ.id}`);
    }

    const isCorrect = chosenOption.toUpperCase() === currentQ.respuestaCorrecta.toUpperCase();
    let peDelta = 0;

    if (isCorrect) {
      // 1. ACIERTO: Racha incrementa y el PE escala
      playerState.rachaCorrectas += 1;
      playerState.puntaje += 10; // Fórmula oficial: +10 puntos por respuesta correcta

      // Escalado definido para Sesión 4:
      // Racha 1: +15 PE, Racha 2: +18 PE, Racha 3: +21 PE, Racha 4+: +25 PE
      if (playerState.rachaCorrectas === 1) peDelta = 15;
      else if (playerState.rachaCorrectas === 2) peDelta = 18;
      else if (playerState.rachaCorrectas === 3) peDelta = 21;
      else peDelta = 25;

      playerState.poderEspecial = Math.min(100, playerState.poderEspecial + peDelta);

      // ADICIONAL CAJITA: Si acertó la pregunta de la cajita "?", obtiene carga de Attack
      if (isBoxQuestion) {
        playerState.hasAttackCharge = true;
        this.logger.log(`¡Jugador [${playerState.nickname}] (${playerId}) obtuvo carga de ATTACK vía cajita "?"!`);
      }
    } else {
      // 2. FALLO: Racha a 0 y -18 PE (piso en 0)
      playerState.rachaCorrectas = 0;
      peDelta = -18;
      playerState.poderEspecial = Math.max(0, playerState.poderEspecial - 18);
    }

    // Descongelar al jugador tras resolver su respuesta
    playerState.isFrozen = false;

    // Si era pregunta de cajita, se consume y se inicia cooldown de 15s
    if (isBoxQuestion && roomState.activeBox) {
      roomState.activeBox = null;
      roomState.boxCooldownUntil = Date.now() + 15000;
      this.logger.log(`Cajita "?" consumida en sala [${normalizedCode}]. Cooldown de 15s iniciado.`);
    }

    // 3. Regla R10: Desbloqueo de habilidades especiales
    const canUnlockSpecial = playerState.poderEspecial >= 100 || playerState.rachaCorrectas >= 4;

    // 4. PERSISTENCIA OBLIGATORIA EN POSTGRESQL (SUPABASE):
    // La memoria es la copia rápida, pero Postgres es la fuente de verdad persistente
    if (this.isUuid(playerId)) {
      try {
        await this.dataSource.getRepository(Player).update(playerId, {
          rachaCorrectas: playerState.rachaCorrectas,
          poderEspecial: playerState.poderEspecial,
          puntaje: playerState.puntaje,
        });
        this.logger.log(
          `[Postgres Sync] Jugador ${playerId} actualizado -> Racha: ${playerState.rachaCorrectas} | PE: ${playerState.poderEspecial} | Puntos: ${playerState.puntaje}`
        );
      } catch (err: any) {
        this.logger.error(`Error persistiendo estadísticas del jugador en Supabase: ${err.message}`);
      }
    }

    // 5. Avanzar al siguiente índice personal del pool de 15 preguntas
    playerState.questionIndex += 1;
    const nextQ = this.getCurrentQuestion(normalizedCode, playerId);

    return {
      isCorrect,
      correctAnswer: currentQ.respuestaCorrecta,
      rachaCorrectas: playerState.rachaCorrectas,
      poderEspecial: playerState.poderEspecial,
      puntaje: playerState.puntaje,
      peGainedOrLost: peDelta,
      canUnlockSpecial,
      nextQuestion: nextQ,
      hasAttackCharge: playerState.hasAttackCharge,
      isFrozen: playerState.isFrozen,
    };
  }

  /**
   * Spawnea una cajita "?" en una posición válida del octágono (radio <= 5.5, sin superponer plataformas)
   * Respeta el nuevo cooldown de 15 segundos entre apariciones.
   */
  spawnBox(codigo: string): AttackBoxState | null {
    const normalizedCode = codigo.toUpperCase().trim();
    const roomState = this.activeRooms.get(normalizedCode);
    if (!roomState) return null;

    if (roomState.activeBox) {
      return roomState.activeBox;
    }

    const now = Date.now();
    if (now < roomState.boxCooldownUntil) {
      const remainingSec = Math.ceil((roomState.boxCooldownUntil - now) / 1000);
      this.logger.log(`Cajita en cooldown para sala [${normalizedCode}]. Restan ${remainingSec}s.`);
      return null;
    }

    const position = this.generateRandomBoxPosition();
    const box: AttackBoxState = {
      id: `box-${now}`,
      position,
      spawnedAt: now,
      claimedByPlayerId: null,
      claimedByNickname: null,
    };

    roomState.activeBox = box;
    this.logger.log(`Cajita "?" spawneada en [${normalizedCode}] en pos (${position.x}, ${position.y}, ${position.z})`);
    return box;
  }

  /**
   * Reclama la interacción con la cajita "?":
   * - Si hay llegada simultánea (< 250ms), desempata por mayor % de mana
   * - Congela el movimiento del jugador que la gana mientras responde
   * - Retorna la pregunta de su propio pool
   */
  claimBox(
    codigo: string,
    playerId: string,
    playerMana: number,
  ): {
    success: boolean;
    reason?: string;
    box?: AttackBoxState;
    question?: Omit<Question, 'respuestaCorrecta'> | null;
  } {
    const normalizedCode = codigo.toUpperCase().trim();
    const roomState = this.activeRooms.get(normalizedCode);
    if (!roomState || !roomState.activeBox) {
      return { success: false, reason: 'No hay cajita activa en la sala' };
    }

    const playerState = roomState.players.get(playerId);
    if (!playerState) {
      return { success: false, reason: 'Jugador no encontrado en sala' };
    }

    playerState.mana = playerMana;

    // Si ya está reclamada por otro jugador
    if (roomState.activeBox.claimedByPlayerId && roomState.activeBox.claimedByPlayerId !== playerId) {
      const existingClaimer = roomState.players.get(roomState.activeBox.claimedByPlayerId);
      const timeSinceClaim = Date.now() - roomState.activeBox.spawnedAt;

      // Desempate simultáneo: si ocurrió en ventana cerrada (< 350ms), gana el de mayor mana
      if (timeSinceClaim < 350 && existingClaimer && playerMana > (existingClaimer.mana ?? 0)) {
        this.logger.log(
          `[Desempate Cajita "?"] [${playerState.nickname}] (${playerMana}% mana) superó a [${existingClaimer.nickname}] (${existingClaimer.mana}% mana)`
        );
        existingClaimer.isFrozen = false;
        roomState.activeBox.claimedByPlayerId = playerId;
        roomState.activeBox.claimedByNickname = playerState.nickname;
        playerState.isFrozen = true;
      } else {
        return {
          success: false,
          reason: `La cajita ya fue tomada por ${existingClaimer?.nickname || 'otro drone'}`,
        };
      }
    } else {
      roomState.activeBox.claimedByPlayerId = playerId;
      roomState.activeBox.claimedByNickname = playerState.nickname;
      playerState.isFrozen = true;
    }

    const question = this.getCurrentQuestion(normalizedCode, playerId);
    return {
      success: true,
      box: roomState.activeBox,
      question,
    };
  }

  /**
   * Genera coordenadas válidas dentro del octágono (radio <= 4.8) alejadas de las 4 plataformas cardinales
   */
  private generateRandomBoxPosition(): { x: number; y: number; z: number } {
    const maxRadius = 4.8;
    const minDistanceFromPlatform = 2.2;
    const platforms = [
      { x: 0, z: -5.5 }, // Norte
      { x: 0, z: 5.5 },  // Sur
      { x: 5.5, z: 0 },  // Este
      { x: -5.5, z: 0 }, // Oeste
    ];

    for (let attempt = 0; attempt < 50; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const r = 1.0 + Math.random() * (maxRadius - 1.0);
      const x = Math.round(Math.cos(angle) * r * 100) / 100;
      const z = Math.round(Math.sin(angle) * r * 100) / 100;

      const collidesWithPlatform = platforms.some((p) => {
        const dist = Math.hypot(x - p.x, z - p.z);
        return dist < minDistanceFromPlatform;
      });

      if (!collidesWithPlatform) {
        return { x, y: 0.75, z };
      }
    }

    return { x: 2.0, y: 0.75, z: 2.0 };
  }

  /**
   * Obtiene la cajita activa actual de una sala
   */
  getActiveBox(codigo: string): AttackBoxState | null {
    const roomState = this.activeRooms.get(codigo.toUpperCase().trim());
    return roomState?.activeBox || null;
  }

  /**
   * Obtiene el estado en memoria de un jugador
   */
  getPlayerState(codigo: string, playerId: string): PlayerGameState | null {
    const roomState = this.activeRooms.get(codigo.toUpperCase().trim());
    return roomState?.players.get(playerId) || null;
  }

  /**
   * Obtiene la colección completa de jugadores en memoria de una sala
   */
  getRoomPlayers(codigo: string): Map<string, PlayerGameState> | null {
    const roomState = this.activeRooms.get(codigo.toUpperCase().trim());
    return roomState?.players || null;
  }

  /**
   * Obtiene la lista completa de preguntas para una sala (para pruebas e inspección)
   */
  getRoomQuestions(codigo: string): Question[] | null {
    const roomState = this.activeRooms.get(codigo.toUpperCase().trim());
    return roomState?.questions || null;
  }

  /**
   * Ajusta la vida de un jugador para pruebas unitarias y de integración
   */
  setPlayerHpForTest(codigo: string, playerId: string, vida: number): boolean {
    const roomState = this.activeRooms.get(codigo.toUpperCase().trim());
    const player = roomState?.players.get(playerId);
    if (player) {
      player.vida = vida;
      return true;
    }
    return false;
  }

  /**
   * Daño de Attack escalado según PE (Sesión 4):
   * 0-24% = 5 DMG, 25-49% = 10 DMG, 50-74% = 15 DMG, 75-100% = 20 DMG
   */
  calculateAttackDamage(pe: number): number {
    if (pe < 25) return 5;
    if (pe < 50) return 10;
    if (pe < 75) return 15;
    return 20;
  }

  /**
   * Ejecuta el ataque sin límite de rango:
   * - Requiere carga de Attack obtenida de la cajita "?"
   * - Daño escala según PE del atacante (5, 10, 15 o 20 DMG)
   * - Escudo objetivo absorbe el 100% del daño y se desactiva
   * - Reduce vida del objetivo; si llega a 0, queda eliminado (dron regresa a bahía y se desactiva)
   * - Evalúa fin de partida (R7) si solo queda 1 jugador activo en pie
   * - Resetea carga de Attack y poder especial del atacante a 0
   * - Persiste cambios en PostgreSQL (Supabase)
   */
  async executeAttack(
    codigo: string,
    attackerId: string,
    targetPlayerId: string,
  ): Promise<AttackResult> {
    const normalizedCode = codigo.toUpperCase().trim();
    const roomState = this.activeRooms.get(normalizedCode);
    if (!roomState) {
      throw new NotFoundException(`La sala [${normalizedCode}] no está activa.`);
    }

    if (roomState.estado === 'FINISHED') {
      return {
        success: false,
        message: 'La partida ya ha finalizado.',
        attackerId,
        targetPlayerId,
        damageDealt: 0,
        targetRemainingHp: 0,
        shieldAbsorbed: false,
        targetEliminated: false,
        gameOver: true,
        winner: roomState.winnerId
          ? { id: roomState.winnerId, nickname: roomState.winnerNickname || '' }
          : null,
      };
    }

    const attacker = roomState.players.get(attackerId);
    const target = roomState.players.get(targetPlayerId);

    if (!attacker) {
      throw new NotFoundException(`Atacante ${attackerId} no encontrado en la sala.`);
    }
    if (!target) {
      throw new NotFoundException(`Objetivo ${targetPlayerId} no encontrado en la sala.`);
    }

    if (!attacker.isAlive || attacker.vida <= 0) {
      return {
        success: false,
        message: 'El dron atacante está eliminado y no puede atacar.',
        attackerId,
        targetPlayerId,
        damageDealt: 0,
        targetRemainingHp: target.vida,
        shieldAbsorbed: false,
        targetEliminated: false,
        gameOver: false,
      };
    }

    if (!target.isAlive || target.vida <= 0) {
      return {
        success: false,
        message: 'El objetivo ya ha sido eliminado previamente.',
        attackerId,
        targetPlayerId,
        damageDealt: 0,
        targetRemainingHp: 0,
        shieldAbsorbed: false,
        targetEliminated: true,
        gameOver: false,
      };
    }

    if (!attacker.hasAttackCharge) {
      return {
        success: false,
        message: 'No dispones de carga de Attack. Consigue una cajita "?" primero.',
        attackerId,
        targetPlayerId,
        damageDealt: 0,
        targetRemainingHp: target.vida,
        shieldAbsorbed: false,
        targetEliminated: false,
        gameOver: false,
      };
    }

    // Calcular daño según PE acumulado del atacante
    const rawDamage = this.calculateAttackDamage(attacker.poderEspecial);
    let damageDealt = rawDamage;
    let shieldAbsorbed = false;

    // Verificar si el objetivo tiene escudo protector
    if (target.hasShield) {
      shieldAbsorbed = true;
      damageDealt = 0;
      target.hasShield = false; // Absorbe el 100% y se desactiva
      this.logger.log(`¡Ataque absorbido por el ESCUDO de [${target.nickname}]! 0 daño recibido.`);
    } else {
      target.vida = Math.max(0, target.vida - damageDealt);
      // Fórmula oficial: puntaje = (respuestas_correctas * 10) + daño_total_infligido
      attacker.puntaje += damageDealt;
      this.logger.log(
        `[${attacker.nickname}] infligió ${damageDealt} DMG a [${target.nickname}]. HP restante: ${target.vida} | Puntaje atacante: ${attacker.puntaje}`
      );
    }

    // Evaluar eliminación del objetivo
    const targetEliminated = target.vida === 0;
    if (targetEliminated) {
      target.isAlive = false;
      target.isFrozen = true; // El dron se desactiva
      this.logger.log(`¡DRON ELIMINADO! [${target.nickname}] ha caído a 0 HP y regresa desactivado a su bahía.`);
    }

    // Evaluar condición de victoria (Regla R7): si solo queda 1 jugador activo en pie
    const alivePlayers = Array.from(roomState.players.values()).filter((p) => p.isAlive && p.vida > 0);
    let gameOver = false;
    let winner: { id: string; nickname: string } | null = null;

    if (roomState.players.size >= 2 && alivePlayers.length === 1) {
      gameOver = true;
      roomState.estado = 'FINISHED';
      roomState.winnerId = alivePlayers[0].playerId;
      roomState.winnerNickname = alivePlayers[0].nickname;
      winner = { id: alivePlayers[0].playerId, nickname: alivePlayers[0].nickname };
      this.logger.log(`🏆 PARTIDA FINALIZADA (R7): [${winner.nickname}] es el único sobreviviente y gana la partida.`);

      // Persistir estado FINISHED de la sala en Supabase
      try {
        await this.dataSource.getRepository(Room).update({ codigo: normalizedCode }, { estado: 'FINISHED' });
      } catch (err: any) {
        this.logger.error(`Error actualizando estado FINISHED de la sala en Supabase: ${err.message}`);
      }
    }

    // Resetear carga de attack y poder especial del atacante (Regla R10)
    attacker.hasAttackCharge = false;
    attacker.poderEspecial = 0;

    // PERSISTIR EN POSTGRESQL (SUPABASE):
    try {
      const updates: Promise<any>[] = [];
      if (this.isUuid(attackerId)) {
        updates.push(
          this.dataSource.getRepository(Player).update(attackerId, {
            poderEspecial: 0,
            puntaje: attacker.puntaje,
          })
        );
      }
      if (this.isUuid(targetPlayerId)) {
        updates.push(
          this.dataSource.getRepository(Player).update(targetPlayerId, { vida: target.vida })
        );
      }
      if (updates.length > 0) {
        await Promise.all(updates);
        this.logger.log(
          `[Postgres Sync] Atacante PE=0, Puntaje=${attacker.puntaje} y Objetivo HP=${target.vida} sincronizados.`
        );
      }
    } catch (err: any) {
      this.logger.error(`Error persistiendo combate en Supabase: ${err.message}`);
    }

    return {
      success: true,
      attackerId,
      targetPlayerId,
      damageDealt,
      targetRemainingHp: target.vida,
      shieldAbsorbed,
      targetEliminated,
      gameOver,
      winner,
      attackerPuntaje: attacker.puntaje,
    };
  }

  /**
   * Activa el Escudo protector (Regla R10):
   * - Requiere poderEspecial >= 100 O rachaCorrectas >= 4
   * - Bloquea 100% del siguiente ataque
   * - Resetea poderEspecial a 0 y persiste en Supabase
   */
  async activateShield(
    codigo: string,
    playerId: string,
  ): Promise<{ success: boolean; message?: string; playerId?: string; nickname?: string; hasShield?: boolean }> {
    const normalizedCode = codigo.toUpperCase().trim();
    const roomState = this.activeRooms.get(normalizedCode);
    if (!roomState) throw new NotFoundException(`Sala [${normalizedCode}] no encontrada.`);

    const playerState = roomState.players.get(playerId);
    if (!playerState) throw new NotFoundException(`Jugador ${playerId} no encontrado.`);

    if (!playerState.isAlive || playerState.vida <= 0) {
      return { success: false, message: 'Jugador eliminado no puede activar escudo.' };
    }

    const canUnlock = playerState.poderEspecial >= 100 || playerState.rachaCorrectas >= 4;
    if (!canUnlock) {
      return {
        success: false,
        message: `Requisitos no cumplidos (100 PE o Racha 4). Tienes PE=${playerState.poderEspecial}, Racha=${playerState.rachaCorrectas}`,
      };
    }

    playerState.hasShield = true;
    playerState.poderEspecial = 0; // Regla R10: reset a 0

    if (this.isUuid(playerId)) {
      try {
        await this.dataSource.getRepository(Player).update(playerId, { poderEspecial: 0 });
        this.logger.log(`[Postgres Sync] Escudo activado para [${playerState.nickname}], PE reseteado a 0.`);
      } catch (err: any) {
        this.logger.error(`Error sincronizando escudo en Supabase: ${err.message}`);
      }
    }

    return {
      success: true,
      playerId,
      nickname: playerState.nickname,
      hasShield: true,
    };
  }

  /**
   * Activa la aceleración Boost (Regla R10):
   * - Requiere poderEspecial >= 100 O rachaCorrectas >= 4
   * - +50% de velocidad de movimiento (speedMultiplier = 1.5) durante 5 segundos
   * - Resetea poderEspecial a 0 y persiste en Supabase
   */
  async activateBoost(
    codigo: string,
    playerId: string,
  ): Promise<{
    success: boolean;
    message?: string;
    playerId?: string;
    nickname?: string;
    speedMultiplier?: number;
    durationMs?: number;
  }> {
    const normalizedCode = codigo.toUpperCase().trim();
    const roomState = this.activeRooms.get(normalizedCode);
    if (!roomState) throw new NotFoundException(`Sala [${normalizedCode}] no encontrada.`);

    const playerState = roomState.players.get(playerId);
    if (!playerState) throw new NotFoundException(`Jugador ${playerId} no encontrado.`);

    if (!playerState.isAlive || playerState.vida <= 0) {
      return { success: false, message: 'Jugador eliminado no puede activar boost.' };
    }

    const canUnlock = playerState.poderEspecial >= 100 || playerState.rachaCorrectas >= 4;
    if (!canUnlock) {
      return {
        success: false,
        message: `Requisitos no cumplidos (100 PE o Racha 4). Tienes PE=${playerState.poderEspecial}, Racha=${playerState.rachaCorrectas}`,
      };
    }

    playerState.speedMultiplier = 1.5;
    playerState.boostExpiresAt = Date.now() + 5000;
    playerState.poderEspecial = 0; // Regla R10: reset a 0

    // Resetear multiplicador automáticamente al expirar los 5 segundos
    setTimeout(() => {
      if (playerState.speedMultiplier === 1.5) {
        playerState.speedMultiplier = 1.0;
        this.logger.log(`Boost finalizado para [${playerState.nickname}]. Velocidad normal restaurada.`);
      }
    }, 5000);

    if (this.isUuid(playerId)) {
      try {
        await this.dataSource.getRepository(Player).update(playerId, { poderEspecial: 0 });
        this.logger.log(`[Postgres Sync] Boost (+50% / 5s) activado para [${playerState.nickname}], PE reseteado a 0.`);
      } catch (err: any) {
        this.logger.error(`Error sincronizando boost en Supabase: ${err.message}`);
      }
    }

    return {
      success: true,
      playerId,
      nickname: playerState.nickname,
      speedMultiplier: 1.5,
      durationMs: 5000,
    };
  }

  /**
   * Resetea el poder especial tras usar una habilidad
   */
  async consumeSpecialPower(codigo: string, playerId: string): Promise<void> {
    const playerState = this.getPlayerState(codigo, playerId);
    if (playerState) {
      playerState.poderEspecial = 0;
      if (this.isUuid(playerId)) {
        await this.dataSource.getRepository(Player).update(playerId, { poderEspecial: 0 });
      }
    }
  }

  /**
   * Valida si un identificador corresponde a un formato UUID válido
   */
  private isUuid(id: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  }
}
