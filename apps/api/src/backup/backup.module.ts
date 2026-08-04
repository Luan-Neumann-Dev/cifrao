import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { QueueModule } from '../queue/queue.module';
import { BackupController } from './backup.controller';
import { BackupProcessor } from './backup.processor';
import { BackupService } from './backup.service';

@Module({
  imports: [AuthModule, QueueModule],
  controllers: [BackupController],
  providers: [BackupService, BackupProcessor],
  exports: [BackupService],
})
export class BackupModule {}
