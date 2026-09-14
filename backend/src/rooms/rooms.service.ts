import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Room } from './entities/room.entity';
import { Player } from '../players/entities/player.entity';
import { CreateRoomDto } from './dto/create-room.dto';
import { JoinRoomDto } from './dto/join-room.dto';
import { QuestionsService } from '../questions/questions.service';
import { GameSessionService } from '../game/game-session.service';

@Injectable()
export class RoomsService {
  private readonly logger = new Logger(RoomsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly questionsService: QuestionsService,
    private readonly gameSessionService: GameSessionService,
  ) {}

  /**
   * Genera un código de sala alfanumérico legible (6 caracteres, sin caracteres ambiguos)
   */
  private generateRandomCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  /**
   * Regla R1: Crea una sala con código único garantizado mediante reintentos
   */
  async createRoom(dto: CreateRoomDto): Promise<Room> {
    const maxRetries = 5;
    const roomRepo = this.dataSource.getRepository(Room);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const candidateCode = this.generateRandomCode();

      // Verificar si ya existe alguna sala con ese código
      const exists = await roomRepo.findOne({ where: { codigo: candidateCode } });
      if (exists) {
        this.logger.warn(`Colisión de código detectada (${candidateCode}) en intento ${attempt}. Reintentando...`);
        continue;
      }

      try {
        const room = roomRepo.create({
          codigo: candidateCode,
          tema: dto.tema.trim(),
          estado: 'WAITING',
          capacidadMaxima: 4,
        });

        const savedRoom = await roomRepo.save(room);
        this.logger.log(`Sala creada con éxito. Código: ${savedRoom.codigo} | Tema: ${savedRoom.tema}`);

        // Generar lote de 15 preguntas con Gemini (o fallback R5) e inicializar en memoria rápida
        try {
          const questions = await this.questionsService.generateQuestionsBatch(savedRoom.tema, 15);
          this.gameSessionService.initializeRoom(savedRoom.codigo, savedRoom.tema, questions);
        } catch (err: any) {
          this.logger.warn(`Error al inicializar pool de preguntas para sala ${savedRoom.codigo}: ${err.message}`);
        }

        return savedRoom;
      } catch (error: any) {
        // Código de error Postgres 23505 = unique_violation
        if (error.code === '23505' && attempt < maxRetries) {
          this.logger.warn(`Colisión en inserción para código ${candidateCode}. Reintentando...`);
          continue;
        }
        this.logger.error(`Error al crear la sala: ${error.message}`);
        throw new InternalServerErrorException('Error interno al crear la sala en base de datos');
      }
    }

    throw new InternalServerErrorException('No se pudo generar un código único de sala tras múltiples intentos');
  }

  /**
   * Reglas R2 y R3: Unirse a sala existente con transacción atómica y bloqueo pesimista
   * Garantiza que en concurrencia (ej: 3 jugadores y dos intentando el último cupo simultáneamente)
   * solo uno tome el cupo y el otro sea rechazado explícitamente a nivel de PostgreSQL.
   */
  async joinRoom(codigo: string, dto: JoinRoomDto): Promise<{ sala: Room; jugador: Player; totalJugadores: number }> {
    const normalizedCode = codigo.toUpperCase().trim();
    const queryRunner = this.dataSource.createQueryRunner();

    // 1. Conexión explícita al pool directo de Postgres
    await queryRunner.connect();
    // 2. Inicio de transacción atómica
    await queryRunner.startTransaction();

    try {
      // 3. PASO OBLIGATORIO: SELECT ... FOR UPDATE bloqueando la fila de la sala
      const sala = await queryRunner.manager
        .createQueryBuilder(Room, 'sala')
        .setLock('pessimistic_write')
        .where('sala.codigo = :codigo', { codigo: normalizedCode })
        .getOne();

      // Validación de existencia
      if (!sala) {
        throw new NotFoundException(`La sala con código "${normalizedCode}" no fue encontrada.`);
      }

      // Validación de estado de sala (no admite jugadores si PLAYING o FINISHED)
      if (sala.estado !== 'WAITING') {
        throw new BadRequestException(
          `No es posible unirse a la sala "${sala.codigo}" porque la partida se encuentra en estado "${sala.estado}".`
        );
      }

      // 4. PASO OBLIGATORIO: Contar jugadores usando queryRunner.manager (dentro de la transacción bloqueada)
      const currentPlayersCount = await queryRunner.manager.count(Player, {
        where: { salaId: sala.id },
      });

      // 5. REGLAS R2 y R3: Validación de cupo máximo (4 jugadores)
      if (currentPlayersCount >= sala.capacidadMaxima) {
        throw new ConflictException(
          `La sala "${sala.codigo}" ha alcanzado su capacidad máxima (${currentPlayersCount}/${sala.capacidadMaxima} jugadores). Ingreso rechazado.`
        );
      }

      // 6. Inserción atómica del nuevo jugador dentro del mismo queryRunner.manager
      const newPlayer = queryRunner.manager.create(Player, {
        salaId: sala.id,
        nickname: dto.nickname.trim(),
        estadoConexion: 'conectado',
        puntaje: 0,
        vida: 100,
        mana: 100,
        poderEspecial: 0,
        rachaCorrectas: 0,
      });

      const savedPlayer = await queryRunner.manager.save(Player, newPlayer);

      // 7. Si se completó el 4to cupo, podemos actualizar el estado si corresponde o mantener WAITING hasta que inicie
      const totalJugadores = currentPlayersCount + 1;

      // 8. Commit de la transacción exitosa
      await queryRunner.commitTransaction();

      this.logger.log(
        `Jugador "${savedPlayer.nickname}" ingresó a la sala "${sala.codigo}" exitosamente (${totalJugadores}/${sala.capacidadMaxima})`
      );

      // 9. Registrar al jugador en memoria rápida
      try {
        if (!this.gameSessionService.hasRoom(sala.codigo)) {
          await this.gameSessionService.ensureRoomInitialized(sala.codigo, sala.tema);
        }
        this.gameSessionService.registerPlayer(sala.codigo, savedPlayer.id, savedPlayer.nickname, {
          rachaCorrectas: savedPlayer.rachaCorrectas,
          poderEspecial: savedPlayer.poderEspecial,
          puntaje: savedPlayer.puntaje,
        });
      } catch (memError: any) {
        this.logger.warn(`Error al registrar jugador en memoria: ${memError.message}`);
      }

      return {
        sala,
        jugador: savedPlayer,
        totalJugadores,
      };
    } catch (error) {
      // Rollback explícito si la transacción sigue activa tras cualquier fallo
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      // Relanzar la excepción HTTP original
      throw error;
    } finally {
      // Liberación garantizada de la conexión hacia el pool de Supabase
      await queryRunner.release();
    }
  }

  /**
   * Obtiene la información completa de una sala y sus jugadores actuales
   */
  async getRoomByCode(codigo: string): Promise<Room> {
    const normalizedCode = codigo.toUpperCase().trim();
    const room = await this.dataSource.getRepository(Room).findOne({
      where: { codigo: normalizedCode },
      relations: { jugadores: true },
    });

    if (!room) {
      throw new NotFoundException(`La sala con código "${normalizedCode}" no existe.`);
    }

    return room;
  }
}
