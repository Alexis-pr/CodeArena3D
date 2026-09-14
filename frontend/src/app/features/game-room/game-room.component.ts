import { Component, OnInit, OnDestroy, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { ArenaSceneComponent } from '../arena-scene/arena-scene.component';
import { HudCardComponent } from '../hud-card/hud-card.component';
import { TriviaPanelComponent } from '../trivia-panel/trivia-panel.component';
import { PlayerHudData } from '../../core/models/player.model';
import { TriviaQuestion } from '../../core/models/question.model';
import { SocketService, GameOverEvent } from '../../core/services/socket.service';

@Component({
  selector: 'app-game-room',
  standalone: true,
  imports: [CommonModule, ArenaSceneComponent, HudCardComponent, TriviaPanelComponent],
  templateUrl: './game-room.component.html',
  styleUrls: ['./game-room.component.css']
})
export class GameRoomComponent implements OnInit, OnDestroy {
  // Información de la sala
  roomCode = 'CODE-9942';
  readonly techTopic = 'TypeScript & Angular';
  roomState: 'WAITING' | 'PLAYING' | 'FINISHED' = 'PLAYING';
  playerCount = 4;
  readonly maxPlayers = 4;

  // Identificador y nickname del cliente local (dinámico)
  localPlayerId: string = '1';
  localNickname: string = 'Jugador 1';

  // Trivia Interactiva Continua
  currentQuestion: TriviaQuestion | null = null;
  isWaitingAnswer: boolean = false;
  isBoxQuestionActive: boolean = false;
  lastTriviaResult: { isCorrect: boolean; peGainedOrLost: number; racha: number } | null = null;

  // Targeting y Combate
  selectedTargetPlayerId: string | number | null = null;
  combatNotification: string = '';

  // Game Over y Fin de Partida (Regla R7)
  gameOverData: GameOverEvent | null = null;
  isGameOverModalOpen: boolean = false;

  private subscriptions = new Subscription();

  /**
   * Estado de los 4 jugadores
   */
  players: PlayerHudData[] = [
    {
      id: '1',
      nickname: 'Jugador 1',
      color: '#00f0ff',
      vida: 100,
      mana: 80,
      poderEspecial: 0,
      rachaCorrectas: 0,
      puntaje: 0,
      isCurrentPlayer: true
    },
    {
      id: '2',
      nickname: 'Jugador 2',
      color: '#9d4edd',
      vida: 100,
      mana: 80,
      poderEspecial: 0,
      rachaCorrectas: 0,
      puntaje: 0,
      isCurrentPlayer: false
    },
    {
      id: '3',
      nickname: 'Jugador 3',
      color: '#ffb703',
      vida: 100,
      mana: 80,
      poderEspecial: 0,
      rachaCorrectas: 0,
      puntaje: 0,
      isCurrentPlayer: false
    },
    {
      id: '4',
      nickname: 'Jugador 4',
      color: '#00ff88',
      vida: 100,
      mana: 80,
      poderEspecial: 0,
      rachaCorrectas: 0,
      puntaje: 0,
      isCurrentPlayer: false
    }
  ];

  /**
   * REGLA ESTRICTA DE HUD:
   * Cada jugador se ve SIEMPRE a sí mismo en la esquina superior izquierda ("Tú"),
   * sin importar su ID o el orden de conexión.
   */
  get hudTopLeft(): PlayerHudData {
    const self = this.players.find((p) => String(p.id) === String(this.localPlayerId));
    if (self) {
      return { ...self, isCurrentPlayer: true, nickname: this.formatSelfNickname(self.nickname) };
    }
    return { ...this.players[0], isCurrentPlayer: true };
  }

  /**
   * Lista de los jugadores remotos restantes (excluye al jugador local)
   */
  get remotePlayers(): PlayerHudData[] {
    return this.players.filter((p) => String(p.id) !== String(this.localPlayerId));
  }

  get hudTopRight(): PlayerHudData {
    return this.remotePlayers[0] || this.players[1];
  }

  get hudBottomLeft(): PlayerHudData {
    return this.remotePlayers[1] || this.players[2];
  }

  get hudBottomRight(): PlayerHudData {
    return this.remotePlayers[2] || this.players[3];
  }

  get selectedTargetPlayer(): PlayerHudData | undefined {
    return this.players.find((p) => String(p.id) === String(this.selectedTargetPlayerId));
  }

  get canUseSpecial(): boolean {
    const self = this.hudTopLeft;
    return (self.poderEspecial >= 100) || (self.rachaCorrectas >= 4);
  }

  constructor(
    private socketService: SocketService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone,
  ) {}

  ngOnInit(): void {
    // Parámetros opcionales de URL para pruebas multijugador (?playerId=2&nickname=Beta)
    if (typeof window !== 'undefined' && window.location?.search) {
      const params = new URLSearchParams(window.location.search);
      if (params.get('playerId')) {
        this.localPlayerId = params.get('playerId')!;
      }
      if (params.get('nickname')) {
        this.localNickname = params.get('nickname')!;
      }
      if (params.get('room')) {
        this.roomCode = params.get('room')!.toUpperCase();
      }
    }

    // Configurar estado isCurrentPlayer de la lista inicial
    this.players.forEach((p) => {
      const isLocal = String(p.id) === String(this.localPlayerId);
      p.isCurrentPlayer = isLocal;
      if (isLocal && this.localNickname) {
        p.nickname = this.localNickname;
      }
    });

    // 1. Unirse a la sala nativa por Socket.IO
    this.socketService
      .joinRoom(this.roomCode, this.localNickname, this.localPlayerId)
      .then((res) => {
        console.log(`[GameRoom] Conectado a la sala aislada "${this.roomCode}":`, res);
      })
      .catch((err) => {
        console.warn(`[GameRoom] Advertencia en joinRoom: ${err.message}`);
      });

    // 2. Sincronización: Estadísticas de Jugadores (Vida/PE/Racha/Puntaje)
    this.subscriptions.add(
      this.socketService.playerStatsUpdated$.subscribe((event) => {
        this.ngZone.run(() => {
          const target = this.players.find((p) => String(p.id) === String(event.playerId));
          if (target) {
            target.rachaCorrectas = event.rachaCorrectas;
            target.poderEspecial = event.poderEspecial;
            target.puntaje = event.puntaje;
            target.hasAttackCharge = event.hasAttackCharge;
            if (event.nickname && !target.isCurrentPlayer) {
              target.nickname = event.nickname;
            }
          }

          // Red de seguridad: si el servidor notifica isFrozen: false para el jugador local,
          // forzar reseteo de la pregunta activa y volver al estado Standby (descongelando el dron)
          if (String(event.playerId) === String(this.localPlayerId) && event.isFrozen === false) {
            if (this.isBoxQuestionActive || this.currentQuestion) {
              console.log('[GameRoom] playerStatsUpdated confirmó isFrozen=false. Reseteando UI a Standby.');
              this.isBoxQuestionActive = false;
              this.currentQuestion = null;
              this.isWaitingAnswer = false;
            }
          }

          this.cdr.detectChanges();
        });
      })
    );

    // 3. Sincronización: Mana remoto vía payload throttled de playerMove
    this.subscriptions.add(
      this.socketService.playerMoved$.subscribe((event) => {
        if (String(event.playerId) !== String(this.localPlayerId)) {
          const target = this.players.find((p) => String(p.id) === String(event.playerId));
          if (target && typeof event.mana === 'number') {
            target.mana = event.mana;
          }
        }
      })
    );

    // 4. Sincronización: Combate y Daño (attackExecuted)
    this.subscriptions.add(
      this.socketService.attackExecuted$.subscribe((event) => {
        // Actualizar objetivo
        const target = this.players.find((p) => String(p.id) === String(event.targetPlayerId));
        if (target) {
          target.vida = event.targetRemainingHp;
          if (event.targetEliminated) {
            target.isEliminated = true;
            // Si el objetivo fijado fue eliminado, deseleccionarlo
            if (String(this.selectedTargetPlayerId) === String(event.targetPlayerId)) {
              this.selectedTargetPlayerId = null;
            }
          }
          if (event.shieldAbsorbed) {
            target.hasShield = false;
          }
        }

        // Actualizar atacante
        const attacker = this.players.find((p) => String(p.id) === String(event.attackerId));
        if (attacker) {
          attacker.puntaje = event.attackerPuntaje;
          attacker.poderEspecial = 0;
          attacker.hasAttackCharge = false;
        }

        // Notificación en pantalla
        const atkName = attacker?.nickname || event.attackerId;
        const tgtName = target?.nickname || event.targetPlayerId;
        if (event.shieldAbsorbed) {
          this.showCombatNotification(`🛡️ ¡${tgtName} absorbió el ataque de ${atkName} con su Escudo!`);
        } else if (event.targetEliminated) {
          if (String(event.targetPlayerId) === String(this.localPlayerId)) {
            this.showCombatNotification('💀 ¡TU DRON HA SIDO ELIMINADO! Regresando a bahía desactivado.');
          } else {
            this.showCombatNotification(`💀 ¡${tgtName} ha sido eliminado por ${atkName}!`);
          }
        } else {
          this.showCombatNotification(`💥 ¡${atkName} atacó a ${tgtName} causando ${event.damageDealt} DMG!`);
        }

        // Si el combate finalizó la partida (Regla R7)
        if (event.gameOver && event.winner) {
          this.handleGameOver({
            codigo: event.codigo,
            winnerId: event.winner.id,
            winnerNickname: event.winner.nickname,
          });
        }
      })
    );

    // 5. Escudo activado
    this.subscriptions.add(
      this.socketService.shieldActivated$.subscribe((event) => {
        const target = this.players.find((p) => String(p.id) === String(event.playerId));
        if (target) {
          target.hasShield = true;
          target.poderEspecial = 0;
          this.showCombatNotification(`🛡️ ¡${target.nickname} activó su Escudo Protector!`);
        }
      })
    );

    // 6. Boost activado
    this.subscriptions.add(
      this.socketService.boostActivated$.subscribe((event) => {
        const target = this.players.find((p) => String(p.id) === String(event.playerId));
        if (target) {
          target.hasBoost = true;
          target.poderEspecial = 0;
          this.showCombatNotification(`⚡ ¡${target.nickname} activó Boost (+50% velocidad)!`);
          setTimeout(() => {
            target.hasBoost = false;
          }, event.durationMs || 5000);
        }
      })
    );

    // 7. Jugador conectado
    this.subscriptions.add(
      this.socketService.playerJoined$.subscribe((event) => {
        this.playerCount = event.totalJugadores;
        const existing = this.players.find((p) => String(p.id) === String(event.playerId));
        if (existing) {
          existing.nickname = event.nickname;
        } else {
          const slot = this.players.find((p) => !p.isCurrentPlayer && p.nickname.startsWith('Jugador '));
          if (slot) {
            slot.id = event.playerId;
            slot.nickname = event.nickname;
          }
        }
      })
    );

    // 8. Jugador desconectado
    this.subscriptions.add(
      this.socketService.playerDisconnected$.subscribe((event) => {
        const target = this.players.find((p) => String(p.id) === String(event.playerId));
        if (target) {
          target.isDisconnected = true;
        }
      })
    );

    // 9. Sincronización: Fin de Partida (Regla R7)
    this.subscriptions.add(
      this.socketService.gameOver$.subscribe((event) => {
        this.handleGameOver(event);
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  private formatSelfNickname(name: string): string {
    return name.includes('(Tú)') ? name : `${name} (Tú)`;
  }

  private showCombatNotification(msg: string): void {
    this.combatNotification = msg;
    setTimeout(() => {
      if (this.combatNotification === msg) {
        this.combatNotification = '';
      }
    }, 3500);
  }

  /**
   * Carga la siguiente pregunta del pool personal del jugador (o pregunta de cajita si aplica)
   */
  loadNextQuestion(): void {
    this.isWaitingAnswer = true;
    this.socketService
      .getQuestion(this.roomCode, this.localPlayerId)
      .then((res) => {
        if (res?.success && res.question) {
          this.currentQuestion = res.question;
        }
      })
      .catch((err) => {
        console.warn('[Trivia] Error al cargar pregunta:', err.message);
      })
      .finally(() => {
        this.isWaitingAnswer = false;
      });
  }

  /**
   * Envía la respuesta seleccionada al backend (Regla R6):
   * - Procesa acierto/fallo mediante el método oficial submitAnswer
   * - Otorga PE y Racha (R10) con persistencia en Postgres
   * - Si acierta, otorga la carga de Attack
   * - Regresa el panel de trivia al estado Standby ("Busca la caja ? en la arena")
   * - Descongela el movimiento del dron
   */
  handleAnswerSubmitted(optionId: 'A' | 'B' | 'C' | 'D'): void {
    if (!this.currentQuestion || this.isWaitingAnswer) return;

    this.isWaitingAnswer = true;
    const isBox = true; // La cajita "?" es ahora la única fuente de preguntas
    const qId = this.currentQuestion.id;
    console.log(`[GameRoom] Enviando respuesta '${optionId}' para pregunta '${qId}'`);

    this.socketService
      .submitAnswer({
        codigo: this.roomCode,
        playerId: this.localPlayerId,
        questionId: qId,
        chosenOption: optionId,
        isBoxQuestion: isBox
      })
      .then((res) => {
        this.ngZone.run(() => {
          if (res?.success) {
            this.lastTriviaResult = {
              isCorrect: res.isCorrect,
              peGainedOrLost: res.peGainedOrLost,
              racha: res.rachaCorrectas
            };

            if (res.isCorrect) {
              this.showCombatNotification('🎯 ¡CARGA DE ATAQUE OBTENIDA! Apunta a un dron vivo y dispara.');
            } else {
              this.showCombatNotification('❌ Respuesta incorrecta. Busca la próxima cajita "?" en la arena.');
            }

            // Ocultar feedback tras 6 segundos
            setTimeout(() => {
              this.ngZone.run(() => {
                this.lastTriviaResult = null;
                this.cdr.detectChanges();
              });
            }, 6000);
          }

          // RESET INCONDICIONAL: Salir del estado de pregunta de cajita y regresar al Standby
          this.isBoxQuestionActive = false;
          this.currentQuestion = null;
          this.isWaitingAnswer = false;
          this.cdr.detectChanges();
          console.log('[GameRoom] Pregunta finalizada. isBoxQuestionActive=false, currentQuestion=null, UI en Standby');
        });
      })
      .catch((err) => {
        console.error('[Trivia] Error en submitAnswer:', err);
        this.ngZone.run(() => {
          this.isBoxQuestionActive = false;
          this.currentQuestion = null;
          this.isWaitingAnswer = false;
          this.cdr.detectChanges();
        });
      })
      .finally(() => {
        this.ngZone.run(() => {
          this.isWaitingAnswer = false;
          this.cdr.detectChanges();
        });
      });
  }

  /**
   * Manejador de selección de objetivo por clic en la arena 3D
   * Valida estrictamente que solo se pueda apuntar a drones enemigos con vida > 0 y no eliminados
   */
  handlePlayerTargeted(targetId: string | number): void {
    if (String(targetId) === String(this.localPlayerId)) {
      this.showCombatNotification('⚠️ No puedes apuntar a tu propio dron.');
      return;
    }

    const target = this.players.find((p) => String(p.id) === String(targetId));
    if (target && target.vida > 0 && !target.isEliminated) {
      this.selectedTargetPlayerId = targetId;
      this.showCombatNotification(`🎯 Objetivo fijado: ${target.nickname}`);
    } else {
      this.showCombatNotification('⚠️ Solo puedes apuntar a drones activos (vida > 0).');
    }
  }

  /**
   * Manejador al colisionar con la cajita "?"
   * Congela el movimiento del dron y muestra la pregunta en el panel de trivia
   */
  handleBoxClaimed(data: any): void {
    console.log('[GameRoom] ¡Cajita "?" capturada!', data);
    this.ngZone.run(() => {
      this.isBoxQuestionActive = true;
      if (data.question) {
        this.currentQuestion = data.question;
        this.showCombatNotification('🎁 ¡Capturaste la cajita "?"! Responde para cargar Attack.');
      } else {
        this.showCombatNotification('🎁 ¡Capturaste la cajita "?"!');
      }
      this.cdr.detectChanges();
    });
  }

  /**
   * Ejecuta el ataque contra el objetivo seleccionado (sin límite de rango)
   */
  executeAttack(): void {
    if (!this.selectedTargetPlayerId) {
      this.showCombatNotification('⚠️ Selecciona un objetivo haciendo clic en un dron.');
      return;
    }

    const self = this.hudTopLeft;
    if (!self.hasAttackCharge) {
      this.showCombatNotification('⚠️ No tienes carga de Ataque. Captura una cajita "?" para obtenerla.');
      return;
    }

    this.socketService
      .executeAttack(this.roomCode, this.localPlayerId, String(this.selectedTargetPlayerId))
      .then((res) => {
        if (!res?.success) {
          this.showCombatNotification(res?.message || 'Error al ejecutar ataque');
        }
      })
      .catch((err) => {
        console.error('[Attack] Error:', err);
      });
  }

  /**
   * Activa el Escudo Protector (absorbe 100% de 1 impacto y se apaga)
   */
  activateShield(): void {
    this.socketService
      .activateShield(this.roomCode, this.localPlayerId)
      .then((res) => {
        if (!res?.success) {
          this.showCombatNotification(res?.message || 'Poder especial insuficiente');
        }
      })
      .catch((err) => {
        console.error('[Shield] Error:', err);
      });
  }

  /**
   * Activa el Boost (+50% velocidad por 5 segundos)
   */
  activateBoost(): void {
    this.socketService
      .activateBoost(this.roomCode, this.localPlayerId)
      .then((res) => {
        if (!res?.success) {
          this.showCombatNotification(res?.message || 'Poder especial insuficiente');
        }
      })
      .catch((err) => {
        console.error('[Boost] Error:', err);
      });
  }

  /**
   * Actualiza el valor de mana del jugador local emitido desde el loop de Three.js
   */
  handleLocalPlayerManaChanged(newMana: number): void {
    const self = this.players.find((p) => String(p.id) === String(this.localPlayerId));
    if (self) {
      self.mana = newMana;
    }
  }

  /**
   * Actualiza el mana de un jugador remoto recibido desde el canvas 3D
   */
  handleRemotePlayerManaChanged(event: { playerId: string; mana: number }): void {
    const target = this.players.find((p) => String(p.id) === String(event.playerId));
    if (target && !target.isCurrentPlayer) {
      target.mana = event.mana;
    }
  }

  get isLocalWinner(): boolean {
    return String(this.gameOverData?.winnerId) === String(this.localPlayerId);
  }

  get finalLeaderboard(): Array<{
    id: string;
    nickname: string;
    puntaje: number;
    vida: number;
    isAlive: boolean;
    isWinner: boolean;
    isSelf: boolean;
  }> {
    if (this.gameOverData?.leaderboard && this.gameOverData.leaderboard.length > 0) {
      return this.gameOverData.leaderboard.map((item) => ({
        id: String(item.id),
        nickname: item.nickname,
        puntaje: item.puntaje ?? 0,
        vida: item.vida ?? 0,
        isAlive: item.isAlive ?? (item.vida > 0),
        isWinner: String(item.id) === String(this.gameOverData?.winnerId),
        isSelf: String(item.id) === String(this.localPlayerId),
      }));
    }

    return [...this.players]
      .sort((a, b) => (b.puntaje ?? 0) - (a.puntaje ?? 0))
      .map((p) => ({
        id: String(p.id),
        nickname: p.nickname,
        puntaje: p.puntaje ?? 0,
        vida: p.vida,
        isAlive: p.vida > 0 && !p.isEliminated,
        isWinner: String(p.id) === String(this.gameOverData?.winnerId),
        isSelf: String(p.id) === String(this.localPlayerId),
      }));
  }

  handleGameOver(event: GameOverEvent): void {
    this.roomState = 'FINISHED';
    this.gameOverData = event;
    this.isGameOverModalOpen = true;

    const winnerName = event.winnerNickname || 'Campeón';
    const isWinner = String(event.winnerId) === String(this.localPlayerId);

    if (isWinner) {
      this.showCombatNotification('🏆 ¡VICTORIA ROYALE! Eres el último dron en pie.');
    } else {
      this.showCombatNotification(`🏁 PARTIDA FINALIZADA. Ganador: ${winnerName}`);
    }
  }

  closeGameOverModal(): void {
    this.isGameOverModalOpen = false;
  }

  restartGame(): void {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  }
}
