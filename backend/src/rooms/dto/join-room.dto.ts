import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class JoinRoomDto {
  @IsNotEmpty({ message: 'El nickname es obligatorio' })
  @IsString({ message: 'El nickname debe ser una cadena de texto' })
  @MaxLength(50, { message: 'El nickname no puede superar 50 caracteres' })
  nickname: string;
}
