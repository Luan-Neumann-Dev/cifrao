import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { type DashboardQuery, dashboardQuerySchema } from '@cifrao/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get()
  overview(@Query(new ZodValidationPipe(dashboardQuerySchema)) query: DashboardQuery) {
    return this.service.overview(query);
  }
}
