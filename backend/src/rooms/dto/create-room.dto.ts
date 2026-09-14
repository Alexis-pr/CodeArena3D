import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateRoomDto {
  @IsNotEmpty({ message: 'El tema tecnológico es obligatorio' })
  @IsString({ message: 'El tema debe ser una cadena de texto' })
  @MaxLength(60, { message: 'El tema no puede exceder 60 caracteres' })
  tema: string;
}
