import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SplitsService } from './splits.service';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';

@Module({
  imports: [AuthModule],
  controllers: [TransactionsController],
  providers: [TransactionsService, SplitsService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
