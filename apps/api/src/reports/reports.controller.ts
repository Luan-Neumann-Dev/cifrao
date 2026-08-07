import { Controller, Get, Header, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import {
  type MonthQuery,
  type ReportExportQuery,
  type ReportQuery,
  monthQuerySchema,
  reportExportSchema,
  reportQuerySchema,
} from '@cifrao/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { MonthReviewService } from './month-review.service';
import { ReportsExportService } from './reports-export.service';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(
    private readonly service: ReportsService,
    private readonly exporter: ReportsExportService,
    private readonly review: MonthReviewService,
  ) {}

  @Get()
  overview(@Query(new ZodValidationPipe(reportQuerySchema)) query: ReportQuery) {
    return this.service.overview(query);
  }

  /** Retrospectiva do mês; sem `month`, a do mês passado. */
  @Get('revisao')
  monthReview(@Query(new ZodValidationPipe(monthQuerySchema)) query: MonthQuery) {
    return this.review.build(query.month);
  }

  /** CSV pronto para planilha. O PDF sai pela impressão do navegador. */
  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async export(
    @Query(new ZodValidationPipe(reportExportSchema)) query: ReportExportQuery,
    @Res() res: Response,
  ): Promise<void> {
    const { filename, content } = await this.exporter.toCsvFile(query);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(content);
  }
}
