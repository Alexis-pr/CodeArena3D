import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Room } from '../../rooms/entities/room.entity';

export type ConnectionStatus = 'conectado' | 'desconectado';

@Entity({ name: 'jugadores' })
export class Player {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'sala_id', type: 'uuid' })
  salaId: string;

  @ManyToOne(() => Room, (room) => room.jugadores, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sala_id' })
  sala: Room;

  @Column({ name: 'nickname', type: 'varchar', length: 50 })
  nickname: string;

  @Column({ name: 'estado_conexion', type: 'varchar', length: 20, default: 'conectado' })
  estadoConexion: ConnectionStatus;

  @Column({ name: 'puntaje', type: 'int', default: 0 })
  puntaje: number;

  @Column({ name: 'vida', type: 'int', default: 100 })
  vida: number;

  @Column({ name: 'mana', type: 'int', default: 100 })
  mana: number;

  @Column({ name: 'poder_especial', type: 'int', default: 0 })
  poderEspecial: number;

  @Column({ name: 'racha_correctas', type: 'int', default: 0 })
  rachaCorrectas: number;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn: Date;
}
