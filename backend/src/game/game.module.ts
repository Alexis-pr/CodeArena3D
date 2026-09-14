import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GameSessionService } from './game-session.service';
import { Player } from '../players/entities/player.entity';
import { Room } from '../rooms/entities/room.entity';
import { QuestionsModule } from '../questions/questions.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Player, Room]),
    QuestionsModule,
  ],
  providers: [GameSessionService],
  exports: [GameSessionService],
})
export class GameModule {}
