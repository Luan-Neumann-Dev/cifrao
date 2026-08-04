import { Global, Module } from '@nestjs/common';
import { QueueService } from './queue.service';

/** Fila global: a importação (Fase 6) e o backup (Fase 9) publicam nela. */
@Global()
@Module({
  providers: [QueueService],
  exports: [QueueService],
})
export class QueueModule {}
