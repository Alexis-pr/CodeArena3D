import { Controller, Post, Get, Body, Param, HttpCode, HttpStatus, UsePipes, ValidationPipe } from '@nestjs/common';
import { RoomsService } from './rooms.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { JoinRoomDto } from './dto/join-room.dto';

@Controller('rooms')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  /**
   * Endpoint para crear una nueva sala con código único (Regla R1)
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createRoom(@Body() dto: CreateRoomDto) {
    return this.roomsService.createRoom(dto);
  }

  /**
   * Endpoint para unirse a una sala existente resolviendo concurrencia a nivel de base de datos (Reglas R2 y R3)
   */
  @Post(':codigo/join')
  @HttpCode(HttpStatus.OK)
  async joinRoom(@Param('codigo') codigo: string, @Body() dto: JoinRoomDto) {
    return this.roomsService.joinRoom(codigo, dto);
  }

  /**
   * Endpoint de consulta para obtener el estado y jugadores de una sala
   */
  @Get(':codigo')
  async getRoom(@Param('codigo') codigo: string) {
    return this.roomsService.getRoomByCode(codigo);
  }
}
