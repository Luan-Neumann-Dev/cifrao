import { Controller, Get, Header, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import {
  type ReportExportQuery,
  type ReportQuery,
  reportExportSchema,
  reportQuerySchema,
} from '@cifrao/shared';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthUser } from '../auth/jwt-verifier';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ReportsExportService } from './reports-export.service';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(
    private readonly service: ReportsService,
    private readonly exporter: ReportsExportService,
  ) {}

  @Get()
  overview(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(reportQuerySchema)) query: ReportQuery,
  ) {
    return this.service.overview(user.id, query);
  }

  /** CSV pronto para planilha. O PDF sai pela impressão do navegador. */
  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async export(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(reportExportSchema)) query: ReportExportQuery,
    @Res() res: Response,
  ): Promise<void> {
    const { filename, content } = await this.exporter.toCsvFile(user.id, query);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(content);
  }
}
