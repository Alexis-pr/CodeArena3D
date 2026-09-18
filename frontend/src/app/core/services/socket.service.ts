import { Injectable, NgZone } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Observable, Subject } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface PlayerMovePayload {
  codigo: string;
  playerId: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  mana: number;
}

export interface PlayerMovedEvent {
  playerId: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  mana: number;
}

export interface PlayerJoinedEvent {
  codigo: string;
  playerId: string;
  nickname: string;
  totalJugadores: number;
}

export interface PlayerStatsUpdatedEvent {
  codigo: string;
  playerId: string;
  nickname?: string;
  rachaCorrectas: number;
  poderEspecial: number;
  puntaje: number;
  peGainedOrLost: number;
  isCorrect: boolean;
  canUnlockSpecial: boolean;
  hasAttackCharge: boolean;
  isFrozen: boolean;
}

export interface AttackExecutedEvent {
  codigo: string;
  attackerId: string;
  targetPlayerId: string;
  damageDealt: number;
  targetRemainingHp: number;
  shieldAbsorbed: boolean;
  targetEliminated: boolean;
  gameOver: boolean;
  winner?: { id: string; nickname: string };
  attackerPuntaje: number;
}

export interface GameOverEvent {
  codigo: string;
  winnerId: string;
  winnerNickname: string;
  leaderboard?: Array<{
    id: string;
    nickname: string;
    puntaje: number;
    vida: number;
    isAlive: boolean;
    rachaCorrectas?: number;
  }>;
}

@Injectable({
  providedIn: 'root'
})
export class SocketService {
  private socket: Socket | null = null;
  private readonly serverUrl: string =
    environment.serverUrl || (typeof window !== 'undefined' ? window.location.origin : '');

  // Event subjects
  private playerJoinedSubject = new Subject<PlayerJoinedEvent>();
  private playerMovedSubject = new Subject<PlayerMovedEvent>();
  private playerDisconnectedSubject = new Subject<any>();
  private playerStatsUpdatedSubject = new Subject<PlayerStatsUpdatedEvent>();
  private boxSpawnedSubject = new Subject<any>();
  private boxDespawnedSubject = new Subject<any>();
  private boxInteractedSubject = new Subject<any>();
  private attackExecutedSubject = new Subject<AttackExecutedEvent>();
  private shieldActivatedSubject = new Subject<any>();
  private boostActivatedSubject = new Subject<any>();
  private gameOverSubject = new Subject<GameOverEvent>();

  // Public observables
  readonly playerJoined$ = this.playerJoinedSubject.asObservable();
  readonly playerMoved$ = this.playerMovedSubject.asObservable();
  readonly playerDisconnected$ = this.playerDisconnectedSubject.asObservable();
  readonly playerStatsUpdated$ = this.playerStatsUpdatedSubject.asObservable();
  readonly boxSpawned$ = this.boxSpawnedSubject.asObservable();
  readonly boxDespawned$ = this.boxDespawnedSubject.asObservable();
  readonly boxInteracted$ = this.boxInteractedSubject.asObservable();
  readonly attackExecuted$ = this.attackExecutedSubject.asObservable();
  readonly shieldActivated$ = this.shieldActivatedSubject.asObservable();
  readonly boostActivated$ = this.boostActivatedSubject.asObservable();
  readonly gameOver$ = this.gameOverSubject.asObservable();

  constructor(private ngZone: NgZone) {
    this.initSocket();
  }

  /**
   * Conecta el cliente Socket.IO al backend y registra los listeners
   */
  initSocket(): void {
    if (this.socket?.connected) return;

    this.socket = io(this.serverUrl, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      withCredentials: true
    });

    this.socket.on('connect', () => {
      console.log(`[SocketService] Conectado al servidor WebSocket: ${this.socket?.id}`);
    });

    this.socket.on('disconnect', (reason) => {
      console.warn(`[SocketService] Desconectado del servidor WebSocket: ${reason}`);
    });

    // Registrar receptores de eventos de sala (siempre dentro de NgZone para reactividad inmediata)
    this.socket.on('playerJoined', (data: PlayerJoinedEvent) => {
      this.ngZone.run(() => this.playerJoinedSubject.next(data));
    });

    this.socket.on('playerMoved', (data: PlayerMovedEvent) => {
      this.ngZone.run(() => this.playerMovedSubject.next(data));
    });

    this.socket.on('playerDisconnected', (data: any) => {
      this.ngZone.run(() => this.playerDisconnectedSubject.next(data));
    });

    this.socket.on('playerStatsUpdated', (data: PlayerStatsUpdatedEvent) => {
      this.ngZone.run(() => this.playerStatsUpdatedSubject.next(data));
    });

    this.socket.on('boxSpawned', (data: any) => {
      this.ngZone.run(() => this.boxSpawnedSubject.next(data));
    });

    this.socket.on('boxDespawned', (data: any) => {
      this.ngZone.run(() => this.boxDespawnedSubject.next(data));
    });

    this.socket.on('boxInteracted', (data: any) => {
      this.ngZone.run(() => this.boxInteractedSubject.next(data));
    });

    this.socket.on('attackExecuted', (data: AttackExecutedEvent) => {
      this.ngZone.run(() => this.attackExecutedSubject.next(data));
    });

    this.socket.on('shieldActivated', (data: any) => {
      this.ngZone.run(() => this.shieldActivatedSubject.next(data));
    });

    this.socket.on('boostActivated', (data: any) => {
      this.ngZone.run(() => this.boostActivatedSubject.next(data));
    });

    this.socket.on('gameOver', (data: GameOverEvent) => {
      this.ngZone.run(() => this.gameOverSubject.next(data));
    });
  }

  /**
   * Unirse a una sala nativa de Socket.IO
   */
  joinRoom(codigo: string, nickname: string, playerId?: string): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        return reject(new Error('Socket no inicializado'));
      }

      this.socket.emit('joinRoom', { codigo, nickname, playerId }, (response: any) => {
        this.ngZone.run(() => {
          if (response?.success) {
            resolve(response);
          } else {
            reject(new Error(response?.message || 'Error al unirse a la sala'));
          }
        });
      });
    });
  }

  /**
   * Emisión throttled de movimiento, orientación y mana local (10 Hz)
   */
  emitPlayerMove(data: PlayerMovePayload): void {
    if (this.socket && this.socket.connected) {
      this.socket.emit('playerMove', data);
    }
  }

  /**
   * Obtiene la pregunta actual del pool personal del jugador
   */
  getQuestion(codigo: string, playerId: string): Promise<any> {
    return new Promise((resolve) => {
      if (!this.socket) return resolve({ success: false });
      this.socket.emit('getQuestion', { codigo, playerId }, (response: any) => {
        this.ngZone.run(() => resolve(response));
      });
    });
  }

  /**
   * Responde una pregunta (del pool regular o de cajita)
   */
  submitAnswer(data: {
    codigo: string;
    playerId: string;
    questionId: string;
    chosenOption: 'A' | 'B' | 'C' | 'D';
    isBoxQuestion?: boolean;
  }): Promise<any> {
    return new Promise((resolve) => {
      if (!this.socket) return resolve({ success: false });
      this.socket.emit('submitAnswer', data, (response: any) => {
        this.ngZone.run(() => resolve(response));
      });
    });
  }

  /**
   * Reclama la colisión con la cajita "?"
   */
  claimBox(codigo: string, playerId: string, mana: number): Promise<any> {
    return new Promise((resolve) => {
      if (!this.socket) return resolve({ success: false });
      this.socket.emit('claimBox', { codigo, playerId, mana }, (response: any) => {
        this.ngZone.run(() => resolve(response));
      });
    });
  }

  /**
   * Ejecuta un ataque de targeting directo sin límite de rango
   */
  executeAttack(codigo: string, attackerId: string, targetPlayerId: string): Promise<any> {
    return new Promise((resolve) => {
      if (!this.socket) return resolve({ success: false });
      this.socket.emit('executeAttack', { codigo, attackerId, targetPlayerId }, (response: any) => {
        this.ngZone.run(() => resolve(response));
      });
    });
  }

  /**
   * Activa el escudo protector (R10)
   */
  activateShield(codigo: string, playerId: string): Promise<any> {
    return new Promise((resolve) => {
      if (!this.socket) return resolve({ success: false });
      this.socket.emit('activateShield', { codigo, playerId }, (response: any) => {
        this.ngZone.run(() => resolve(response));
      });
    });
  }

  /**
   * Activa la aceleración Boost +50% (R10)
   */
  activateBoost(codigo: string, playerId: string): Promise<any> {
    return new Promise((resolve) => {
      if (!this.socket) return resolve({ success: false });
      this.socket.emit('activateBoost', { codigo, playerId }, (response: any) => {
        this.ngZone.run(() => resolve(response));
      });
    });
  }
}
