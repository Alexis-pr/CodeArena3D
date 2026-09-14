import { Component, ElementRef, ViewChild, AfterViewInit, OnDestroy, NgZone, Output, EventEmitter, Input } from '@angular/core';
import * as THREE from 'three';
import { Subscription } from 'rxjs';
import { InputService } from '../../core/services/input.service';
import { SocketService } from '../../core/services/socket.service';
import { PlayerHudData } from '../../core/models/player.model';

interface DroneModel {
  group: THREE.Group;
  baseY: number;
  rotors: THREE.Mesh[];
  playerIndex: number;
  playerId?: string;
  targetPosition?: THREE.Vector3;
  targetRotationY?: number;
}

@Component({
  selector: 'app-arena-scene',
  standalone: true,
  templateUrl: './arena-scene.component.html',
  styleUrls: ['./arena-scene.component.css']
})
export class ArenaSceneComponent implements AfterViewInit, OnDestroy {
  @ViewChild('arenaCanvas', { static: true }) private canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('containerRef', { static: true }) private containerRef!: ElementRef<HTMLDivElement>;

  /**
   * Mana inicial recibido (por defecto 80/100 para probar de inmediato)
   */
  @Input() initialMana: number = 80;

  /**
   * Código de sala activa para sincronización WebSocket
   */
  @Input() roomCode: string = 'CODE-9942';

  /**
   * Identificador del jugador local para mapear su dron (por defecto '1' para el Host / Jugador 1)
   */
  @Input() localPlayerId: string = '1';

  /**
   * Lista de datos de los 4 jugadores para validar vida/isAlive en targeting
   */
  @Input() players: PlayerHudData[] = [];

  /**
   * ID del jugador actualmente apuntado como objetivo
   */
  @Input() targetedPlayerId: string | number | null = null;

  /**
   * Congela el movimiento del dron local mientras responde la pregunta de la cajita "?"
   */
  private _isFrozen: boolean = false;

  @Input()
  set isFrozen(val: boolean) {
    this._isFrozen = val;
    console.log(`[ArenaScene] isFrozen actualizado: ${val}`);
  }

  get isFrozen(): boolean {
    return this._isFrozen;
  }

  /**
   * Emite el valor del mana redondeado del jugador local cuando cambia, para actualizar el HUD
   */
  @Output() manaChanged = new EventEmitter<number>();

  /**
   * Emite las actualizaciones de mana de jugadores remotos recibidas por WebSocket
   */
  @Output() remotePlayerManaChanged = new EventEmitter<{ playerId: string; mana: number }>();

  /**
   * Emite el ID del jugador seleccionado mediante clic en la escena 3D (Targeting)
   */
  @Output() playerTargeted = new EventEmitter<string | number>();

  /**
   * Emite el resultado al colisionar exitosamente con la cajita "?"
   */
  @Output() boxClaimed = new EventEmitter<any>();

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private animationFrameId: number | null = null;
  private resizeObserver: ResizeObserver | null = null;

  private drones: DroneModel[] = [];
  private playerRingIndicator!: THREE.Mesh;

  // Targeting y Raycasting
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private targetIndicator!: THREE.Group;
  private boxGroup!: THREE.Group;
  private isClaimingBox = false;
  private clickHandler: ((e: MouseEvent) => void) | null = null;

  // Throttling para emisión de movimiento (Regla: no saturar a 60 FPS, emitir cada 100ms = 10 Hz)
  private lastMoveEmitTime: number = 0;
  private readonly MOVE_EMIT_INTERVAL_MS: number = 100;
  private lastSentPos = { x: Infinity, z: Infinity };
  private lastSentRotY: number = Infinity;
  private socketSub: Subscription | null = null;

  // Constantes de físicas simples para el Dron
  private readonly DRONE_NORMAL_SPEED = 6.8; // Unidades por segundo
  private readonly ARENA_MAX_RADIUS = 6.8;   // Radio perimetral del octágono

  // Reglas de Mana
  private readonly MANA_DRAIN_RATE = 14.0;   // Consumo por segundo al moverse
  private readonly MANA_REGEN_RATE = 22.0;   // Regeneración por segundo en bahía propia
  private readonly HOME_BAY_RADIUS = 1.35;   // Radio de detección sobre la bahía
  private readonly HOME_BAY_POS = { x: 0, z: -7.5 }; // Bahía del Jugador 1 (Norte)

  // Estado del Mana (calculado dentro de requestAnimationFrame)
  private currentMana: number = 80;
  private lastReportedMana: number = 80;

  // Configuración de los 4 jugadores en los 4 ejes cardinales
  private readonly PLAYER_CONFIGS = [
    { id: 1, name: 'Jugador 1', axis: 'Norte', color: 0x00f0ff, pos: { x: 0, z: -7.5 } }, // Norte (-Z)
    { id: 2, name: 'Jugador 2', axis: 'Este',  color: 0x9d4edd, pos: { x: 7.5, z: 0 } },  // Este (+X)
    { id: 3, name: 'Jugador 3', axis: 'Oeste', color: 0xffb703, pos: { x: -7.5, z: 0 } }, // Oeste (-X)
    { id: 4, name: 'Jugador 4', axis: 'Sur',   color: 0x00ff88, pos: { x: 0, z: 7.5 } }   // Sur (+Z)
  ];

  constructor(
    private ngZone: NgZone,
    private inputService: InputService,
    private socketService: SocketService
  ) {}

  ngAfterViewInit(): void {
    this.currentMana = this.initialMana;
    this.lastReportedMana = Math.round(this.currentMana);

    this.initThree();
    this.createArena();
    this.createCardinalPlatforms();
    this.createDrones();
    this.createLocalPlayerIndicator();
    this.createTargetIndicator();
    this.createBoxMesh();
    this.setupClickHandler();
    this.setupResizeHandler();
    this.setupSocketSync();
    this.startAnimationLoop();
  }

  ngOnDestroy(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    if (this.socketSub) {
      this.socketSub.unsubscribe();
    }
    if (this.clickHandler && this.canvasRef?.nativeElement) {
      this.canvasRef.nativeElement.removeEventListener('click', this.clickHandler);
    }
    this.disposeScene();
  }

  /**
   * Inicializa el renderer, la escena, la cámara y las luces básicas
   */
  private initThree(): void {
    const width = this.containerRef.nativeElement.clientWidth || 800;
    const height = this.containerRef.nativeElement.clientHeight || 600;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05070c);
    this.scene.fog = new THREE.FogExp2(0x05070c, 0.022);

    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    this.camera.position.set(0, 18, 14);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvasRef.nativeElement,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const ambientLight = new THREE.AmbientLight(0x223355, 1.4);
    this.scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0xffffff, 1.2);
    mainLight.position.set(5, 18, 10);
    this.scene.add(mainLight);

    const fillLight = new THREE.DirectionalLight(0x005577, 0.8);
    fillLight.position.set(-5, -5, -5);
    this.scene.add(fillLight);
  }

  /**
   * Construye el octágono central simétrico
   */
  private createArena(): void {
    const arenaRadius = 7.5;
    const arenaHeight = 0.5;

    const octagonGeo = new THREE.CylinderGeometry(arenaRadius, arenaRadius + 0.3, arenaHeight, 8);
    const octagonMat = new THREE.MeshStandardMaterial({
      color: 0x0c1422,
      roughness: 0.45,
      metalness: 0.7
    });

    const octagonMesh = new THREE.Mesh(octagonGeo, octagonMat);
    octagonMesh.position.y = -arenaHeight / 2;
    octagonMesh.rotation.y = Math.PI / 8;
    this.scene.add(octagonMesh);

    const edgesGeo = new THREE.EdgesGeometry(octagonGeo);
    const edgesMat = new THREE.LineBasicMaterial({ color: 0x00f0ff, linewidth: 2 });
    const wireframe = new THREE.LineSegments(edgesGeo, edgesMat);
    wireframe.position.copy(octagonMesh.position);
    wireframe.rotation.copy(octagonMesh.rotation);
    this.scene.add(wireframe);

    const innerRingGeo = new THREE.RingGeometry(2.5, 2.58, 32);
    const innerRingMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, side: THREE.DoubleSide });
    const innerRing = new THREE.Mesh(innerRingGeo, innerRingMat);
    innerRing.rotation.x = -Math.PI / 2;
    innerRing.position.y = 0.02;
    this.scene.add(innerRing);

    const gridHelper = new THREE.GridHelper(9, 12, 0x00f0ff, 0x162238);
    gridHelper.position.y = 0.01;
    this.scene.add(gridHelper);
  }

  /**
   * Crea las 4 plataformas de despegue en cruz cardinal (Norte, Este, Sur, Oeste)
   */
  private createCardinalPlatforms(): void {
    const platformSize = 2.4;
    const platformHeight = 0.35;

    this.PLAYER_CONFIGS.forEach((cfg) => {
      const platformGroup = new THREE.Group();
      platformGroup.position.set(cfg.pos.x, 0, cfg.pos.z);

      const boxGeo = new THREE.BoxGeometry(platformSize, platformHeight, platformSize);
      const boxMat = new THREE.MeshStandardMaterial({
        color: 0x101a2b,
        roughness: 0.5,
        metalness: 0.8
      });
      const boxMesh = new THREE.Mesh(boxGeo, boxMat);
      boxMesh.position.y = -platformHeight / 2;
      platformGroup.add(boxMesh);

      const boxEdges = new THREE.EdgesGeometry(boxGeo);
      const boxLineMat = new THREE.LineBasicMaterial({ color: cfg.color });
      const boxLines = new THREE.LineSegments(boxEdges, boxLineMat);
      boxLines.position.copy(boxMesh.position);
      platformGroup.add(boxLines);

      const padRingGeo = new THREE.RingGeometry(0.7, 0.85, 24);
      const padRingMat = new THREE.MeshBasicMaterial({ color: cfg.color, side: THREE.DoubleSide });
      const padRing = new THREE.Mesh(padRingGeo, padRingMat);
      padRing.rotation.x = -Math.PI / 2;
      padRing.position.y = 0.02;
      platformGroup.add(padRing);

      const pointLight = new THREE.PointLight(cfg.color, 1.2, 5);
      pointLight.position.set(0, 1.2, 0);
      platformGroup.add(pointLight);

      this.scene.add(platformGroup);
    });
  }

  /**
   * Construye los 4 drones con geometrías básicas
   */
  private createDrones(): void {
    this.PLAYER_CONFIGS.forEach((cfg, index) => {
      const droneGroup = new THREE.Group();
      const baseY = 1.6;
      droneGroup.position.set(cfg.pos.x, baseY, cfg.pos.z);
      droneGroup.lookAt(0, baseY, 0);

      const bodyGeo = new THREE.CylinderGeometry(0.5, 0.55, 0.28, 6);
      const bodyMat = new THREE.MeshStandardMaterial({
        color: 0x1c2436,
        roughness: 0.3,
        metalness: 0.85
      });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      droneGroup.add(body);

      const coreGeo = new THREE.SphereGeometry(0.24, 16, 12);
      const coreMat = new THREE.MeshStandardMaterial({
        color: cfg.color,
        emissive: cfg.color,
        emissiveIntensity: 0.6
      });
      const core = new THREE.Mesh(coreGeo, coreMat);
      core.position.y = 0.16;
      droneGroup.add(core);

      const armGeo = new THREE.BoxGeometry(1.6, 0.07, 0.12);
      const armMat = new THREE.MeshStandardMaterial({ color: 0x2e3b52 });

      const arm1 = new THREE.Mesh(armGeo, armMat);
      arm1.rotation.y = Math.PI / 4;
      droneGroup.add(arm1);

      const arm2 = new THREE.Mesh(armGeo, armMat);
      arm2.rotation.y = -Math.PI / 4;
      droneGroup.add(arm2);

      const rotorPositions = [
        { x: 0.56, z: 0.56 },
        { x: -0.56, z: 0.56 },
        { x: 0.56, z: -0.56 },
        { x: -0.56, z: -0.56 }
      ];

      const rotors: THREE.Mesh[] = [];
      const rotorGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.02, 10);
      const rotorMat = new THREE.MeshBasicMaterial({
        color: cfg.color,
        transparent: true,
        opacity: 0.75
      });

      rotorPositions.forEach((rPos) => {
        const rotor = new THREE.Mesh(rotorGeo, rotorMat);
        rotor.position.set(rPos.x, 0.08, rPos.z);
        droneGroup.add(rotor);
        rotors.push(rotor);
      });

      this.scene.add(droneGroup);

      this.drones.push({
        group: droneGroup,
        baseY: baseY,
        rotors: rotors,
        playerIndex: index,
        playerId: String(cfg.id),
        targetPosition: new THREE.Vector3(cfg.pos.x, baseY, cfg.pos.z),
        targetRotationY: droneGroup.rotation.y
      });
    });
  }

  /**
   * Configura la recepción de movimiento, interpolación LERP y eventos de cajita "?"
   */
  private setupSocketSync(): void {
    const sub = new Subscription();

    sub.add(
      this.socketService.playerMoved$.subscribe((event) => {
        // Ignorar actualizaciones del propio cliente local
        if (String(event.playerId) === String(this.localPlayerId)) return;

        const targetDrone = this.findDroneByPlayerId(event.playerId);
        if (targetDrone) {
          if (event.position) {
            targetDrone.targetPosition = new THREE.Vector3(
              event.position.x,
              targetDrone.baseY,
              event.position.z
            );
          }
          if (event.rotation) {
            targetDrone.targetRotationY = event.rotation.y;
          }
          if (typeof event.mana === 'number') {
            this.ngZone.run(() => {
              this.remotePlayerManaChanged.emit({
                playerId: String(event.playerId),
                mana: event.mana
              });
            });
          }
        }
      })
    );

    // Evento de spawn de cajita "?" en la arena
    sub.add(
      this.socketService.boxSpawned$.subscribe((box) => {
        if (box?.position && this.boxGroup) {
          this.boxGroup.position.set(box.position.x, 0.75, box.position.z);
          this.boxGroup.visible = true;
          console.log(`[Cajita 3D] Spawn en (${box.position.x}, ${box.position.z})`);
        }
      })
    );

    // Evento de desaparición de la cajita "?"
    sub.add(
      this.socketService.boxDespawned$.subscribe(() => {
        if (this.boxGroup) {
          this.boxGroup.visible = false;
        }
        this.isClaimingBox = false;
      })
    );

    this.socketSub = sub;
  }

  /**
   * Retículo cyberpunk 3D de targeting que orbita sobre el dron enemigo seleccionado
   */
  private createTargetIndicator(): void {
    this.targetIndicator = new THREE.Group();
    this.targetIndicator.visible = false;

    // Aro rojo de fijación
    const ringGeo = new THREE.RingGeometry(0.85, 1.05, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xff0055,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    this.targetIndicator.add(ring);

    // Cono luminoso tipo flecha invertida apuntando al dron
    const pointerGeo = new THREE.ConeGeometry(0.2, 0.45, 6);
    const pointerMat = new THREE.MeshBasicMaterial({ color: 0xff0055 });
    const pointer = new THREE.Mesh(pointerGeo, pointerMat);
    pointer.rotation.x = Math.PI; // invertido hacia abajo
    pointer.position.y = 1.35;
    this.targetIndicator.add(pointer);

    this.scene.add(this.targetIndicator);
  }

  /**
   * Cajita "?" dorada holográfica con bordes brillantes y luz propia
   */
  private createBoxMesh(): void {
    this.boxGroup = new THREE.Group();
    this.boxGroup.visible = false;

    const boxGeo = new THREE.BoxGeometry(0.7, 0.7, 0.7);
    const boxMat = new THREE.MeshStandardMaterial({
      color: 0xffb703,
      emissive: 0xff9100,
      emissiveIntensity: 0.8,
      metalness: 0.4,
      roughness: 0.3,
    });
    const boxMesh = new THREE.Mesh(boxGeo, boxMat);
    this.boxGroup.add(boxMesh);

    const edgesGeo = new THREE.EdgesGeometry(boxGeo);
    const edgesMat = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 });
    const edges = new THREE.LineSegments(edgesGeo, edgesMat);
    this.boxGroup.add(edges);

    const pointLight = new THREE.PointLight(0xffb703, 1.8, 4);
    this.boxGroup.add(pointLight);

    this.scene.add(this.boxGroup);
  }

  /**
   * Configura el listener de clics para targeting mediante Raycasting Three.js
   * Solo permite apuntar a drones con isAlive: true (vida > 0)
   */
  private setupClickHandler(): void {
    this.clickHandler = (event: MouseEvent) => {
      const rect = this.canvasRef.nativeElement.getBoundingClientRect();
      this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      this.raycaster.setFromCamera(this.mouse, this.camera);

      // Filtrar drones vivos excluyendo al local
      const candidates: THREE.Object3D[] = [];
      const droneMap = new Map<THREE.Object3D, DroneModel>();

      for (const drone of this.drones) {
        if (String(drone.playerId) === String(this.localPlayerId)) continue;

        // Validar isAlive en la lista de jugadores (solo drones vivos)
        const pData = this.players.find((p) => String(p.id) === String(drone.playerId));
        if (pData && (pData.vida <= 0 || pData.isEliminated)) {
          console.warn(`[Targeting] Dron ${drone.playerId} está eliminado. No se puede apuntar.`);
          continue;
        }

        drone.group.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            candidates.push(child);
            droneMap.set(child, drone);
          }
        });
      }

      const intersects = this.raycaster.intersectObjects(candidates, false);
      if (intersects.length > 0) {
        const hitMesh = intersects[0].object;
        const targetDrone = droneMap.get(hitMesh);
        if (targetDrone && targetDrone.playerId) {
          this.targetedPlayerId = targetDrone.playerId;
          this.targetIndicator.position.copy(targetDrone.group.position);
          this.targetIndicator.visible = true;

          this.ngZone.run(() => {
            this.playerTargeted.emit(targetDrone.playerId!);
          });
          console.log(`[Targeting] Objetivo fijado: Jugador [${targetDrone.playerId}] (isAlive=true)`);
        }
      }
    };

    this.canvasRef.nativeElement.addEventListener('click', this.clickHandler);
  }

  /**
   * Busca el dron correspondiente a un playerId o índice
   */
  private findDroneByPlayerId(playerId: string | number): DroneModel | undefined {
    return this.drones.find(
      (d) => String(d.playerId) === String(playerId) || String(d.playerIndex + 1) === String(playerId)
    );
  }

  /**
   * Indicador luminoso en el suelo para identificar al dron del jugador local
   */
  private createLocalPlayerIndicator(): void {
    const ringGeo = new THREE.RingGeometry(0.8, 0.95, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8
    });
    this.playerRingIndicator = new THREE.Mesh(ringGeo, ringMat);
    this.playerRingIndicator.rotation.x = -Math.PI / 2;
    this.playerRingIndicator.position.set(0, 0.03, -7.5);
    this.scene.add(this.playerRingIndicator);
  }

  /**
   * Restricción matemática simple del borde del octágono y bahías cardinales
   */
  private clampToArenaBounds(x: number, z: number): { x: number; z: number } {
    const dist = Math.hypot(x, z);

    if (dist <= this.ARENA_MAX_RADIUS) {
      return { x, z };
    }

    if (Math.abs(x) <= 1.25 && z <= -6.3 && z >= -8.7) {
      return { x: Math.max(-1.25, Math.min(1.25, x)), z: Math.max(-8.7, Math.min(-6.3, z)) };
    }
    if (Math.abs(z) <= 1.25 && x >= 6.3 && x <= 8.7) {
      return { x: Math.max(6.3, Math.min(8.7, x)), z: Math.max(-1.25, Math.min(1.25, z)) };
    }
    if (Math.abs(z) <= 1.25 && x <= -6.3 && x >= -8.7) {
      return { x: Math.max(-8.7, Math.min(-6.3, x)), z: Math.max(-1.25, Math.min(1.25, z)) };
    }
    if (Math.abs(x) <= 1.25 && z >= 6.3 && z <= 8.7) {
      return { x: Math.max(-1.25, Math.min(1.25, x)), z: Math.max(6.3, Math.min(8.7, z)) };
    }

    return {
      x: (x / dist) * this.ARENA_MAX_RADIUS,
      z: (z / dist) * this.ARENA_MAX_RADIUS
    };
  }

  /**
   * Bucle de renderizado: movimiento, animación y cálculo de MANA a 60 FPS dentro de requestAnimationFrame
   */
  private startAnimationLoop(): void {
    this.ngZone.runOutsideAngular(() => {
      const clock = new THREE.Clock();

      const render = () => {
        const delta = Math.min(clock.getDelta(), 0.1);
        const elapsedTime = clock.getElapsedTime();
        const localDrone = this.drones.length > 0
          ? (this.findDroneByPlayerId(this.localPlayerId) || this.drones[0])
          : null;

        // 1. Manejo del Dron Local y Ciclo de Mana (según localPlayerId)
        if (localDrone) {
          const localConfig = this.PLAYER_CONFIGS.find(cfg => String(cfg.id) === String(this.localPlayerId)) || this.PLAYER_CONFIGS[0];
          const homeBayPos = localConfig.pos;
          const localPData = this.players.find(p => String(p.id) === String(this.localPlayerId));
          const isEliminated = localPData ? (localPData.vida <= 0 || localPData.isEliminated) : false;

          const movement = (this.isFrozen || isEliminated)
            ? { x: 0, z: 0, isMoving: false }
            : this.inputService.getMovementVector();

          if (isEliminated) {
            // Regla R7: Si la vida llega a 0, el dron regresa suavemente a su bahía y se desactiva
            localDrone.group.position.x = THREE.MathUtils.lerp(localDrone.group.position.x, homeBayPos.x, 0.05);
            localDrone.group.position.z = THREE.MathUtils.lerp(localDrone.group.position.z, homeBayPos.z, 0.05);
            localDrone.group.rotation.x = THREE.MathUtils.lerp(localDrone.group.rotation.x, 0, 0.1);
            localDrone.group.rotation.z = THREE.MathUtils.lerp(localDrone.group.rotation.z, 0, 0.1);
          }

          // Detección de presencia sobre la bahía propia de despegue
          const distToHome = Math.hypot(
            localDrone.group.position.x - homeBayPos.x,
            localDrone.group.position.z - homeBayPos.z
          );
          const isAtHomeBay = distToHome <= this.HOME_BAY_RADIUS;

          // Velocidad: 100% normal si mana > 0, o 30% fijo (Modo Reserva) si mana == 0
          const hasMana = this.currentMana > 0;
          const currentSpeed = hasMana
            ? this.DRONE_NORMAL_SPEED
            : this.DRONE_NORMAL_SPEED * 0.30;

          // Mover el dron si hay entrada activa
          if (movement.isMoving) {
            const nextX = localDrone.group.position.x + movement.x * currentSpeed * delta;
            const nextZ = localDrone.group.position.z + movement.z * currentSpeed * delta;

            const clamped = this.clampToArenaBounds(nextX, nextZ);
            localDrone.group.position.x = clamped.x;
            localDrone.group.position.z = clamped.z;

            // Orientación suave hacia la dirección de avance
            const targetHeading = Math.atan2(-movement.x, -movement.z);
            localDrone.group.rotation.y = THREE.MathUtils.lerp(
              localDrone.group.rotation.y,
              targetHeading,
              0.15
            );

            // Inclinación aerodinámica según velocidad actual
            const tiltFactor = hasMana ? 0.18 : 0.06;
            localDrone.group.rotation.z = THREE.MathUtils.lerp(
              localDrone.group.rotation.z,
              -movement.x * tiltFactor,
              0.2
            );
            localDrone.group.rotation.x = THREE.MathUtils.lerp(
              localDrone.group.rotation.x,
              movement.z * tiltFactor,
              0.2
            );
          } else {
            localDrone.group.rotation.z = THREE.MathUtils.lerp(localDrone.group.rotation.z, 0, 0.1);
            localDrone.group.rotation.x = THREE.MathUtils.lerp(localDrone.group.rotation.x, 0, 0.1);
          }

          // === CICLO DE MANA (Mismo Loop de requestAnimationFrame) ===
          if (isAtHomeBay) {
            // Regeneración en la bahía propia (+22 pts/segundo hasta 100)
            if (this.currentMana < 100) {
              this.currentMana = Math.min(100, this.currentMana + this.MANA_REGEN_RATE * delta);
            }
          } else if (movement.isMoving && hasMana) {
            // Consumo en movimiento fuera de la base (-14 pts/segundo)
            this.currentMana = Math.max(0, this.currentMana - this.MANA_DRAIN_RATE * delta);
          }
          // Si mana == 0 y se mueve fuera de la base: costo 0 (Modo Reserva al 30%)

          // Notificar reactivamente a Angular SOLO cuando cambie el entero, para no saturar Change Detection
          const roundedMana = Math.round(this.currentMana);
          if (roundedMana !== this.lastReportedMana) {
            this.lastReportedMana = roundedMana;
            this.ngZone.run(() => {
              this.manaChanged.emit(roundedMana);
            });
          }

          // === THROTTLING DE EMISIÓN DE MOVIMIENTO AL SERVIDOR (100ms = 10 Hz) ===
          const now = performance.now();
          if (now - this.lastMoveEmitTime >= this.MOVE_EMIT_INTERVAL_MS) {
            const currentPos = localDrone.group.position;
            const currentRotY = localDrone.group.rotation.y;
            const distMoved = Math.hypot(
              currentPos.x - this.lastSentPos.x,
              currentPos.z - this.lastSentPos.z
            );
            const rotDiff = Math.abs(currentRotY - this.lastSentRotY);

            // Emitir si hubo movimiento significativo, cambio angular o primera inicialización
            if (distMoved > 0.005 || rotDiff > 0.01 || this.lastMoveEmitTime === 0) {
              this.lastMoveEmitTime = now;
              this.lastSentPos = { x: currentPos.x, z: currentPos.z };
              this.lastSentRotY = currentRotY;

              this.socketService.emitPlayerMove({
                codigo: this.roomCode,
                playerId: String(this.localPlayerId),
                position: { x: currentPos.x, y: currentPos.y, z: currentPos.z },
                rotation: {
                  x: localDrone.group.rotation.x,
                  y: currentRotY,
                  z: localDrone.group.rotation.z
                },
                mana: roundedMana
              });
            }
          }

          // Efecto visual en el aro del suelo según estado de mana
          if (this.playerRingIndicator) {
            this.playerRingIndicator.position.x = localDrone.group.position.x;
            this.playerRingIndicator.position.z = localDrone.group.position.z;

            const ringMat = this.playerRingIndicator.material as THREE.MeshBasicMaterial;
            if (isEliminated) {
              // Dron eliminado / desactivado (Regla R7)
              ringMat.color.setHex(0xff0044);
              ringMat.opacity = 0.2;
            } else if (!hasMana) {
              // Modo Reserva: Aro tenue rojizo
              ringMat.color.setHex(0xff3366);
              ringMat.opacity = 0.4;
            } else if (isAtHomeBay && this.currentMana < 100) {
              // Recargando en base: Pulso de recarga
              ringMat.color.setHex(0x00f0ff);
              ringMat.opacity = 0.5 + Math.sin(elapsedTime * 8) * 0.4;
            } else {
              // Normal
              ringMat.color.setHex(0x00f0ff);
              ringMat.opacity = 0.8;
            }
          }
        }

        // 2. Interpolación LERP continua a 60 FPS para drones remotos (sin saltos bruscos)
        for (const remoteDrone of this.drones) {
          if (remoteDrone === localDrone) continue;
          if (remoteDrone.targetPosition) {
            remoteDrone.group.position.x = THREE.MathUtils.lerp(
              remoteDrone.group.position.x,
              remoteDrone.targetPosition.x,
              0.15
            );
            remoteDrone.group.position.z = THREE.MathUtils.lerp(
              remoteDrone.group.position.z,
              remoteDrone.targetPosition.z,
              0.15
            );
          }
          if (remoteDrone.targetRotationY !== undefined) {
            remoteDrone.group.rotation.y = THREE.MathUtils.lerp(
              remoteDrone.group.rotation.y,
              remoteDrone.targetRotationY,
              0.15
            );
          }
        }

        // 3. Seguimiento del retículo 3D de targeting
        if (this.targetIndicator?.visible && this.targetedPlayerId) {
          const targetDrone = this.findDroneByPlayerId(this.targetedPlayerId);
          if (targetDrone) {
            this.targetIndicator.position.x = targetDrone.group.position.x;
            this.targetIndicator.position.z = targetDrone.group.position.z;
            this.targetIndicator.position.y = targetDrone.group.position.y;
            this.targetIndicator.rotation.y += 0.04;
          } else {
            this.targetIndicator.visible = false;
          }
        }

        // 4. Animación y colisión con la cajita "?" 3D
        if (this.boxGroup?.visible) {
          this.boxGroup.rotation.y += 0.03;
          this.boxGroup.rotation.x += 0.015;
          this.boxGroup.position.y = 0.75 + Math.sin(elapsedTime * 3) * 0.12;

          // Detección de colisión con dron local
          if (localDrone && !this.isClaimingBox) {
            const dist = Math.hypot(
              localDrone.group.position.x - this.boxGroup.position.x,
              localDrone.group.position.z - this.boxGroup.position.z
            );
            if (dist <= 1.35) {
              this.isClaimingBox = true;
              this.socketService
                .claimBox(this.roomCode, this.localPlayerId, Math.round(this.currentMana))
                .then((res) => {
                  if (res?.success) {
                    this.boxGroup.visible = false;
                    this.ngZone.run(() => {
                      this.boxClaimed.emit(res);
                    });
                  }
                })
                .catch((err) => console.warn('[ClaimBox] Error:', err))
                .finally(() => {
                  setTimeout(() => {
                    this.isClaimingBox = false;
                  }, 2500);
                });
            }
          }
        }

        // 5. Animación de flotación y rotores para los 4 drones (Regla R7: Drones eliminados se desactivan)
        this.drones.forEach((drone, i) => {
          const cfg = this.PLAYER_CONFIGS[drone.playerIndex] || this.PLAYER_CONFIGS[0];
          const pData = this.players.find(
            (p) => String(p.id) === String(drone.playerId) || String(drone.playerIndex + 1) === String(p.id)
          );
          const isDroneDead = pData ? (pData.vida <= 0 || pData.isEliminated) : false;

          if (isDroneDead) {
            // Dron desactivado: regresa a su plataforma, desciende y apaga rotores
            drone.group.position.x = THREE.MathUtils.lerp(drone.group.position.x, cfg.pos.x, 0.05);
            drone.group.position.z = THREE.MathUtils.lerp(drone.group.position.z, cfg.pos.z, 0.05);
            drone.group.position.y = THREE.MathUtils.lerp(drone.group.position.y, 0.35, 0.05);
            drone.group.rotation.x = THREE.MathUtils.lerp(drone.group.rotation.x, 0, 0.1);
            drone.group.rotation.z = THREE.MathUtils.lerp(drone.group.rotation.z, 0, 0.1);
          } else {
            drone.group.position.y = drone.baseY + Math.sin(elapsedTime * 2.2 + i * 1.5) * 0.12;
            drone.rotors.forEach((rotor, rIdx) => {
              rotor.rotation.y += (rIdx % 2 === 0 ? 0.35 : -0.35);
            });
          }
        });

        this.renderer.render(this.scene, this.camera);
        this.animationFrameId = requestAnimationFrame(render);
      };

      render();
    });
  }

  /**
   * Mantiene el canvas ajustado al tamaño de su contenedor
   */
  private setupResizeHandler(): void {
    this.resizeObserver = new ResizeObserver(() => {
      const container = this.containerRef.nativeElement;
      const width = container.clientWidth;
      const height = container.clientHeight;

      if (width > 0 && height > 0) {
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
      }
    });

    this.resizeObserver.observe(this.containerRef.nativeElement);
  }

  /**
   * Limpieza de recursos Three.js al destruir el componente
   */
  private disposeScene(): void {
    this.scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    });
    this.renderer.dispose();
  }
}
