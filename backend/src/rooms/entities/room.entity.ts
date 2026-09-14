import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany } from 'typeorm';
import { Player } from '../../players/entities/player.entity';

export type RoomStatus = 'WAITING' | 'PLAYING' | 'FINISHED';

@Entity({ name: 'salas' })
export class Room {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'codigo', type: 'varchar', length: 10, unique: true })
  codigo: string;

  @Column({ name: 'tema', type: 'varchar', length: 60 })
  tema: string;

  @Column({ name: 'estado', type: 'varchar', length: 20, default: 'WAITING' })
  estado: RoomStatus;

  @Column({ name: 'capacidad_maxima', type: 'int', default: 4 })
  capacidadMaxima: number;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn: Date;

  @OneToMany(() => Player, (player) => player.sala)
  jugadores: Player[];
}
