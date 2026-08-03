import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import {
  type ApplySuggestionsInput,
  type MonthQuery,
  type UpsertBudgetInput,
  applySuggestionsSchema,
  monthQuerySchema,
  upsertBudgetSchema,
} from '@cifrao/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { BudgetsService } from './budgets.service';

@Controller('budgets')
@UseGuards(JwtAuthGuard)
export class BudgetsController {
  constructor(private readonly service: BudgetsService) {}

  @Get()
  list(@Query(new ZodValidationPipe(monthQuerySchema)) query: MonthQuery) {
    return this.service.list(query);
  }

  @Get('suggestions')
  suggestions(@Query(new ZodValidationPipe(monthQuerySchema)) query: MonthQuery) {
    return this.service.suggestions(query);
  }

  @Put()
  upsert(@Body(new ZodValidationPipe(upsertBudgetSchema)) dto: UpsertBudgetInput) {
    return this.service.upsert(dto);
  }

  @Post('apply-suggestions')
  applySuggestions(
    @Body(new ZodValidationPipe(applySuggestionsSchema)) dto: ApplySuggestionsInput,
  ) {
    return this.service.applySuggestions(dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
