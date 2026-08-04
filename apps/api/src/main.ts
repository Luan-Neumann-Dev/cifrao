import 'reflect-metadata';
import './load-env'; // carrega .env antes de qualquer módulo instanciar o Prisma
import { installBigIntJsonSerializer } from '@cifrao/shared';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

// Armadilha #2: instala o serializer global de BigInt antes de subir a app,
// para que qualquer resposta com BigInt (ex.: amountCents) vire string no JSON.
installBigIntJsonSerializer();

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableShutdownHooks();

  // O upload da importação (Fase 6) trafega em base64 no corpo JSON; o padrão
  // de 100 kB do Express derrubaria qualquer extrato de verdade.
  const bodyLimit = process.env.API_BODY_LIMIT ?? '12mb';
  app.useBodyParser('json', { limit: bodyLimit });

  const port = process.env.API_PORT ? Number(process.env.API_PORT) : 3001;
  await app.listen(port);
  console.log(`[cifrao-api] escutando em http://localhost:${port}`);
}

void bootstrap();
