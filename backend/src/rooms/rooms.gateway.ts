import * as dotenv from 'dotenv';
dotenv.config();

import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { RoomsService } from './rooms.service';
import { DataSource } from 'typeorm';
import { Player } from '../players/entities/player.entity';
import { GameSessionService } from '../game/game-session.service';

interface ClientMetadata {
  codigo: string;
  playerId: string;
  nickname: string;
}

const getAllowedOrigins = (): string[] => {
  const defaultOrigins = ['http://localhost:4200', 'http://127.0.0.1:4200'];
  const frontendUrl = process.env.FRONTEND_URL?.trim();
  if (!frontendUrl) {
    return defaultOrigins;
  }
  const customOrigins = frontendUrl
    .split(',')
    .map((url) => url.trim().replace(/\/$/, ''))
    .filter(Boolean);
  return Array.from(new Set([...defaultOrigins, ...customOrigins]));
};

@WebSocketGateway({
  cors: {
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      const allowedOrigins = getAllowedOrigins();
      const normalizedOrigin = origin?.replace(/\/$/, '');
      if (!origin || (normalizedOrigin && allowedOrigins.includes(normalizedOrigin)) || allowedOrigins.includes('*')) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
  },
})
export class RoomsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RoomsGateway.name);

  // Registro en memoria de sockets conectados para gestión de desconexiones (Regla R9)
  private readonly connectedClients: Map<string, ClientMetadata> = new Map();

  constructor(
    private readonly roomsService: RoomsService,
    private readonly dataSource: DataSource,
    private readonly gameSessionService: GameSessionService,
  ) {}

  handleConnection(client: Socket) {
    this.logger.log(`Cliente WebSocket conectado: ${client.id}`);
  }

  /**
   * Regla R9: La desconexión no rompe la partida.
   * Se actualiza el estado en PostgreSQL a 'desconectado' y se notifica exclusivamente a la sala correspondiente.
   */
  async handleDisconnect(client: Socket) {
    this.logger.log(`Cliente WebSocket desconectado: ${client.id}`);
    const meta = this.connectedClients.get(client.id);

    if (meta) {
      try {
        // Actualizar estado en la base de datos de Supabase
        await this.dataSource.getRepository(Player).update(meta.playerId, {
          estadoConexion: 'desconectado',
        });

        // CONDICIÓN ESTRICTA: Emitir únicamente a la sala nativa de Socket.IO, nunca broadcast global
        this.server.to(meta.codigo).emit('playerDisconnected', {
          playerId: meta.playerId,
          nickname: meta.nickname,
          codigo: meta.codigo,
        });

        this.logger.log(`Jugador "${meta.nickname}" marcado como desconectado en sala "${meta.codigo}"`);
      } catch (error: any) {
        this.logger.error(`Error al procesar desconexión de jugador ${meta.playerId}: ${error.message}`);
      } finally {
        this.connectedClients.delete(client.id);
      }
    }
  }

  /**
   * Suscribe un socket a una sala nativa de Socket.IO (aislamiento estricto por sala)
   */
  @SubscribeMessage('joinRoom')
  async handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { codigo: string; nickname: string; playerId?: string },
  ) {
    try {
      const codigo = payload.codigo.toUpperCase().trim();
      let playerId = payload.playerId;
      let totalJugadores = 0;

      // Si no viene playerId, procesamos el join atómico en base de datos (Reglas R2 y R3)
      if (!playerId) {
        const result = await this.roomsService.joinRoom(codigo, { nickname: payload.nickname });
        playerId = result.jugador.id;
        totalJugadores = result.totalJugadores;
      } else {
        // Obtener estado actual si existe en la base de datos
        try {
          const room = await this.roomsService.getRoomByCode(codigo);
          totalJugadores = room?.jugadores?.length || 1;
        } catch {
          totalJugadores = 1;
        }
      }

      // CONDICIÓN ESTRICTA: Unión a la sala nativa de Socket.IO
      await client.join(codigo);

      // Guardar metadata para gestionar desconexión limpia (R9)
      this.connectedClients.set(client.id, {
        codigo,
        playerId,
        nickname: payload.nickname,
      });

      // Registrar al jugador en el GameSessionService en memoria si aún no lo está
      try {
        if (!this.gameSessionService.hasRoom(codigo)) {
          const room = await this.roomsService.getRoomByCode(codigo).catch(() => null);
          await this.gameSessionService.ensureRoomInitialized(codigo, room?.tema || 'General');
        }
        this.gameSessionService.registerPlayer(codigo, playerId, payload.nickname);
      } catch (err: any) {
        this.logger.warn(`Error al asegurar registro de jugador en memoria: ${err.message}`);
      }

      // CONDICIÓN ESTRICTA: Emitir evento únicamente a los clientes dentro de la sala 'codigo'
      this.server.to(codigo).emit('playerJoined', {
        codigo,
        playerId,
        nickname: payload.nickname,
        totalJugadores,
      });

      // Asegurar que exista una cajita "?" activa en la arena para los jugadores
      try {
        let currentBox = this.gameSessionService.getActiveBox(codigo);
        if (!currentBox) {
          currentBox = this.gameSessionService.spawnBox(codigo);
          if (currentBox) {
            this.server.to(codigo).emit('boxSpawned', currentBox);
            this.logger.log(`Cajita "?" inicial disponible en sala [${codigo}].`);
          }
        } else {
          client.emit('boxSpawned', currentBox);
        }
      } catch {}

      this.logger.log(`Socket ${client.id} [${payload.nickname}] se unió a sala aislada "${codigo}" (${totalJugadores}/4)`);

      return {
        success: true,
        codigo,
        playerId,
        totalJugadores,
      };
    } catch (error: any) {
      this.logger.warn(`Error en joinRoom por socket: ${error.message}`);
      return {
        success: false,
        message: error.message || 'Error al unirse a la sala',
      };
    }
  }

  /**
   * Obtiene la pregunta actual asignada al jugador según su índice personal de pool
   * Regla R6: Jamás envía 'respuestaCorrecta' al cliente.
   */
  @SubscribeMessage('getQuestion')
  async handleGetQuestion(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { codigo: string; playerId: string },
  ) {
    try {
      const codigo = payload.codigo?.toUpperCase().trim();
      if (!codigo || !payload.playerId) {
        return { success: false, message: 'Código de sala y playerId son requeridos' };
      }

      if (!this.gameSessionService.hasRoom(codigo)) {
        const room = await this.roomsService.getRoomByCode(codigo);
        await this.gameSessionService.ensureRoomInitialized(codigo, room.tema);
      }

      const question = this.gameSessionService.getCurrentQuestion(codigo, payload.playerId);
      if (!question) {
        return { success: false, message: 'No hay preguntas disponibles o jugador no registrado' };
      }

      const playerState = this.gameSessionService.getPlayerState(codigo, payload.playerId);

      return {
        success: true,
        question,
        questionIndex: playerState?.questionIndex ?? 0,
        rachaCorrectas: playerState?.rachaCorrectas ?? 0,
        poderEspecial: playerState?.poderEspecial ?? 0,
      };
    } catch (error: any) {
      this.logger.error(`Error en getQuestion: ${error.message}`);
      return { success: false, message: error.message };
    }
  }

  /**
   * Resuelve la respuesta enviada por un jugador:
   * - Reutiliza el mismo flujo de validación R10 (racha y PE escalado)
   * - Persiste racha_correctas y poder_especial en PostgreSQL Supabase
   * - Si isBoxQuestion=true y acierta, otorga la carga de Attack y descongela movimiento
   * - Notifica a todos los clientes de la sala con 'playerStatsUpdated' (estricto a this.server.to(codigo))
   * - Devuelve resultado detallado y siguiente pregunta al jugador
   */
  @SubscribeMessage('submitAnswer')
  async handleSubmitAnswer(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: {
      codigo: string;
      playerId: string;
      questionId: string;
      chosenOption: 'A' | 'B' | 'C' | 'D';
      isBoxQuestion?: boolean;
    },
  ) {
    try {
      const codigo = payload.codigo?.toUpperCase().trim();
      if (!codigo || !payload.playerId || !payload.questionId || !payload.chosenOption) {
        return { success: false, message: 'Datos incompletos para submitAnswer' };
      }

      const result = await this.gameSessionService.submitAnswer(
        codigo,
        payload.playerId,
        payload.questionId,
        payload.chosenOption,
        Boolean(payload.isBoxQuestion),
      );

      const playerState = this.gameSessionService.getPlayerState(codigo, payload.playerId);

      // CONDICIÓN ESTRICTA: Emitir playerStatsUpdated únicamente a los clientes en la sala nativa
      this.server.to(codigo).emit('playerStatsUpdated', {
        codigo,
        playerId: payload.playerId,
        nickname: playerState?.nickname,
        rachaCorrectas: result.rachaCorrectas,
        poderEspecial: result.poderEspecial,
        puntaje: result.puntaje,
        peGainedOrLost: result.peGainedOrLost,
        isCorrect: result.isCorrect,
        canUnlockSpecial: result.canUnlockSpecial,
        hasAttackCharge: result.hasAttackCharge,
        isFrozen: result.isFrozen,
      });

      // Si era pregunta de cajita, notificar que la cajita desaparece e inicia cooldown de 15s
      if (payload.isBoxQuestion) {
        this.server.to(codigo).emit('boxDespawned', {
          codigo,
          cooldownSeconds: 15,
        });

        // Programar reaparición automática tras 15 segundos
        setTimeout(() => {
          const newBox = this.gameSessionService.spawnBox(codigo);
          if (newBox) {
            this.server.to(codigo).emit('boxSpawned', newBox);
            this.logger.log(`Cajita "?" reapareció en sala [${codigo}] tras 15s de cooldown.`);
          }
        }, 15000);
      }

      this.logger.log(
        `Respuesta procesada para [${playerState?.nickname || payload.playerId}] en [${codigo}]: ` +
          `Acierto=${result.isCorrect} | Racha=${result.rachaCorrectas} | PE=${result.poderEspecial} | Attack=${result.hasAttackCharge}`
      );

      return {
        success: true,
        ...result,
      };
    } catch (error: any) {
      this.logger.error(`Error en submitAnswer: ${error.message}`);
      return { success: false, message: error.message };
    }
  }

  /**
   * Spawnea una cajita "?" en la arena y lo notifica a la sala (aislamiento estricto)
   */
  @SubscribeMessage('spawnBox')
  handleSpawnBox(@MessageBody() payload: { codigo: string }) {
    const codigo = payload.codigo?.toUpperCase().trim();
    const box = this.gameSessionService.spawnBox(codigo);
    if (box) {
      this.server.to(codigo).emit('boxSpawned', box);
      return { success: true, box };
    }
    return { success: false, message: 'Cajita en cooldown o no disponible' };
  }

  /**
   * Reclamo de interacción con la cajita "?":
   * - Resuelve desempates por % de mana si hay colisión simultánea
   * - Congela al jugador mientras responde
   * - Retorna la pregunta de su propio pool
   */
  @SubscribeMessage('claimBox')
  async handleClaimBox(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { codigo: string; playerId: string; mana: number },
  ) {
    try {
      const codigo = payload.codigo?.toUpperCase().trim();
      if (!codigo || !payload.playerId) {
        return { success: false, message: 'Parámetros incompletos para claimBox' };
      }

      const claimResult = this.gameSessionService.claimBox(
        codigo,
        payload.playerId,
        payload.mana ?? 100,
      );

      if (!claimResult.success) {
        return claimResult;
      }

      // Notificar a los clientes de la sala que la caja está siendo interactuada
      this.server.to(codigo).emit('boxInteracted', {
        codigo,
        boxId: claimResult.box?.id,
        playerId: payload.playerId,
        nickname: claimResult.box?.claimedByNickname,
        isFrozen: true,
      });

      return {
        success: true,
        box: claimResult.box,
        question: claimResult.question,
        isFrozen: true,
      };
    } catch (error: any) {
      this.logger.error(`Error en claimBox: ${error.message}`);
      return { success: false, message: error.message };
    }
  }

  /**
   * Endpoint de desarrollo/pruebas para verificar el lote de preguntas generado
   */
  @SubscribeMessage('debugGetPool')
  handleDebugGetPool(@MessageBody() payload: { codigo: string }) {
    const codigo = payload.codigo?.toUpperCase().trim();
    const questions = this.gameSessionService.getRoomQuestions(codigo);
    return {
      success: true,
      count: questions?.length ?? 0,
      questions,
    };
  }

  /**
   * Endpoint de pruebas para ajustar la vida de un jugador
   */
  @SubscribeMessage('debugSetPlayerHp')
  handleDebugSetPlayerHp(
    @MessageBody() payload: { codigo: string; playerId: string; vida: number },
  ) {
    const codigo = payload.codigo?.toUpperCase().trim();
    const success = this.gameSessionService.setPlayerHpForTest(
      codigo,
      payload.playerId,
      payload.vida,
    );
    return { success, vida: payload.vida };
  }

  /**
   * Ejecuta el ataque de un dron hacia otro objetivo en la sala (sin límite de rango)
   */
  @SubscribeMessage('executeAttack')
  async handleExecuteAttack(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { codigo: string; attackerId: string; targetPlayerId: string },
  ) {
    try {
      const codigo = payload.codigo?.toUpperCase().trim();
      if (!codigo || !payload.attackerId || !payload.targetPlayerId) {
        return { success: false, message: 'Parámetros incompletos para executeAttack' };
      }

      const result = await this.gameSessionService.executeAttack(
        codigo,
        payload.attackerId,
        payload.targetPlayerId,
      );

      if (!result.success) {
        return result;
      }

      // CONDICIÓN ESTRICTA: Emitir attackExecuted a los clientes de la sala nativa
      this.server.to(codigo).emit('attackExecuted', {
        codigo,
        attackerId: result.attackerId,
        targetPlayerId: result.targetPlayerId,
        damageDealt: result.damageDealt,
        targetRemainingHp: result.targetRemainingHp,
        shieldAbsorbed: result.shieldAbsorbed,
        targetEliminated: result.targetEliminated,
        gameOver: result.gameOver,
        winner: result.winner,
        attackerPuntaje: result.attackerPuntaje,
      });

      // Si la partida terminó (Regla R7), emitir evento formal de fin de partida
      if (result.gameOver && result.winner) {
        const roomPlayers = this.gameSessionService.getRoomPlayers(codigo);
        const leaderboard = roomPlayers
          ? Array.from(roomPlayers.values())
              .map((p) => ({
                id: p.playerId,
                nickname: p.nickname,
                puntaje: p.puntaje,
                vida: p.vida,
                isAlive: p.isAlive,
                rachaCorrectas: p.rachaCorrectas,
              }))
              .sort((a, b) => b.puntaje - a.puntaje)
          : [];

        this.server.to(codigo).emit('gameOver', {
          codigo,
          winnerId: result.winner.id,
          winnerNickname: result.winner.nickname,
          leaderboard,
        });
        this.logger.log(`🏆 Evento 'gameOver' emitido para sala [${codigo}]. Ganador: ${result.winner.nickname}`);
      }

      return result;
    } catch (error: any) {
      this.logger.error(`Error en executeAttack: ${error.message}`);
      return { success: false, message: error.message };
    }
  }

  /**
   * Activa el Escudo protector (Regla R10)
   */
  @SubscribeMessage('activateShield')
  async handleActivateShield(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { codigo: string; playerId: string },
  ) {
    try {
      const codigo = payload.codigo?.toUpperCase().trim();
      if (!codigo || !payload.playerId) {
        return { success: false, message: 'Parámetros incompletos para activateShield' };
      }

      const result = await this.gameSessionService.activateShield(codigo, payload.playerId);
      if (!result.success) return result;

      // CONDICIÓN ESTRICTA: Notificar exclusivamente a la sala nativa
      this.server.to(codigo).emit('shieldActivated', {
        codigo,
        playerId: result.playerId,
        nickname: result.nickname,
        hasShield: true,
      });

      return result;
    } catch (error: any) {
      this.logger.error(`Error en activateShield: ${error.message}`);
      return { success: false, message: error.message };
    }
  }

  /**
   * Activa la aceleración Boost (+50% velocidad por 5 segundos)
   */
  @SubscribeMessage('activateBoost')
  async handleActivateBoost(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { codigo: string; playerId: string },
  ) {
    try {
      const codigo = payload.codigo?.toUpperCase().trim();
      if (!codigo || !payload.playerId) {
        return { success: false, message: 'Parámetros incompletos para activateBoost' };
      }

      const result = await this.gameSessionService.activateBoost(codigo, payload.playerId);
      if (!result.success) return result;

      // CONDICIÓN ESTRICTA: Notificar exclusivamente a la sala nativa
      this.server.to(codigo).emit('boostActivated', {
        codigo,
        playerId: result.playerId,
        nickname: result.nickname,
        speedMultiplier: result.speedMultiplier,
        durationMs: result.durationMs,
      });

      return result;
    } catch (error: any) {
      this.logger.error(`Error en activateBoost: ${error.message}`);
      return { success: false, message: error.message };
    }
  }

  /**
   * Sincronización de movimiento del dron (con throttling de 100ms aplicado en el cliente).
   * Se retransmite únicamente a los otros clientes de la sala mediante client.to(codigo) (sin loopback/eco).
   * Incluye la posición, rotación y mana actual calculado localmente.
   */
  @SubscribeMessage('playerMove')
  handlePlayerMove(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: {
      codigo: string;
      playerId: string;
      position: { x: number; y: number; z: number };
      rotation: { x: number; y: number; z: number };
      mana: number;
    },
  ) {
    if (!payload?.codigo || !payload?.playerId) return;

    const codigo = payload.codigo.toUpperCase().trim();

    // Retransmitir a los otros clientes de la sala (excluyendo al emisor)
    client.to(codigo).emit('playerMoved', {
      playerId: payload.playerId,
      position: payload.position,
      rotation: payload.rotation,
      mana: payload.mana,
    });
  }

  /**
   * Salir voluntariamente de una sala
   */
  @SubscribeMessage('leaveRoom')
  async handleLeaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { codigo: string },
  ) {
    const codigo = payload.codigo.toUpperCase().trim();
    const meta = this.connectedClients.get(client.id);

    await client.leave(codigo);
    this.connectedClients.delete(client.id);

    if (meta) {
      // CONDICIÓN ESTRICTA: Notificar solo a los clientes de esa sala
      this.server.to(codigo).emit('playerLeft', {
        codigo,
        playerId: meta.playerId,
        nickname: meta.nickname,
      });
    }

    return { success: true };
  }
}
