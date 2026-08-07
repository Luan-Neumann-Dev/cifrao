import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MonthReviewService } from './month-review.service';
import { ReportsExportService } from './reports-export.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [AuthModule],
  controllers: [ReportsController],
  providers: [ReportsService, ReportsExportService, MonthReviewService],
  exports: [ReportsService, MonthReviewService],
})
export class ReportsModule {}
