import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RecurringRulesController } from './recurring-rules.controller';
import { RecurringRulesService } from './recurring-rules.service';
import { RecurringCron } from './recurring.cron';

@Module({
  imports: [AuthModule],
  controllers: [RecurringRulesController],
  providers: [RecurringRulesService, RecurringCron],
  exports: [RecurringRulesService],
})
export class RecurringModule {}
