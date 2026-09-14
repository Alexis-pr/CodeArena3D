import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RoomsModule } from './rooms/rooms.module';
import { PlayersModule } from './players/players.module';
import { QuestionsModule } from './questions/questions.module';
import { GameModule } from './game/game.module';

@Module({
  imports: [
    // 1. Configuración global de variables de entorno (.env)
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // 2. Conexión asíncrona a PostgreSQL (Supabase directo en puerto 5432)
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const dbUrl = configService.get<string>('DATABASE_URL');
        const isSupabase = dbUrl?.includes('supabase');

        return {
          type: 'postgres',
          url: dbUrl,
          // Conexión SSL requerida para Supabase directo
          ssl: isSupabase ? { rejectUnauthorized: false } : false,
          // REGLA CRÍTICA: synchronize en false explícito. Tablas creadas vía schema.sql
          synchronize: false,
          autoLoadEntities: true,
          logging: ['error', 'warn'],
        };
      },
    }),

    // 3. Módulos de dominio modular
    RoomsModule,
    PlayersModule,
    QuestionsModule,
    GameModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
