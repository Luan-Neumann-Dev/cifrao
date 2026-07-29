import 'reflect-metadata';
import { installBigIntJsonSerializer } from '@cifrao/shared';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

// Armadilha #2: instala o serializer global de BigInt antes de subir a app,
// para que qualquer resposta com BigInt (ex.: amountCents) vire string no JSON.
installBigIntJsonSerializer();

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();

  const port = process.env.API_PORT ? Number(process.env.API_PORT) : 3001;
  await app.listen(port);
  console.log(`[cifrao-api] escutando em http://localhost:${port}`);
}

void bootstrap();
