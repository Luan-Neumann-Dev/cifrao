import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ImportsController } from './imports.controller';
import { ImportsProcessor } from './imports.processor';
import { ImportsService } from './imports.service';

@Module({
  imports: [AuthModule],
  controllers: [ImportsController],
  providers: [ImportsService, ImportsProcessor],
  exports: [ImportsService],
})
export class ImportsModule {}
