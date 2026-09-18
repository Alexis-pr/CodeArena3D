import * as dotenv from 'dotenv';
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  const defaultOrigins = ['http://localhost:4200', 'http://127.0.0.1:4200'];
  const frontendUrl = process.env.FRONTEND_URL?.trim();
  const allowedOrigins = frontendUrl
    ? Array.from(
        new Set([
          ...defaultOrigins,
          ...frontendUrl.split(',').map((url) => url.trim().replace(/\/$/, '')).filter(Boolean),
        ]),
      )
    : defaultOrigins;

  // Habilitar CORS dinámico (por defecto http://localhost:4200, ampliable vía FRONTEND_URL)
  app.enableCors({
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  logger.log(`CORS configurado para orígenes: ${JSON.stringify(allowedOrigins)}`);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  logger.log(`CodeArena 3D Backend corriendo en: http://localhost:${port}`);
}
bootstrap();
