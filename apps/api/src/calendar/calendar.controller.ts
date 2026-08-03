import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { type MonthQuery, monthQuerySchema } from '@cifrao/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CalendarService } from './calendar.service';

@Controller('calendar')
@UseGuards(JwtAuthGuard)
export class CalendarController {
  constructor(private readonly service: CalendarService) {}

  @Get()
  month(@Query(new ZodValidationPipe(monthQuerySchema)) query: MonthQuery) {
    return this.service.month(query);
  }
}
