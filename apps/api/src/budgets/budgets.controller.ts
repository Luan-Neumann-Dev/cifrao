import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import {
  type ApplySuggestionsInput,
  type MonthQuery,
  type UpsertBudgetInput,
  applySuggestionsSchema,
  monthQuerySchema,
  upsertBudgetSchema,
} from '@cifrao/shared';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthUser } from '../auth/jwt-verifier';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { BudgetsService } from './budgets.service';

@Controller('budgets')
@UseGuards(JwtAuthGuard)
export class BudgetsController {
  constructor(private readonly service: BudgetsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(monthQuerySchema)) query: MonthQuery,
  ) {
    return this.service.list(user.id, query);
  }

  @Get('suggestions')
  suggestions(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(monthQuerySchema)) query: MonthQuery,
  ) {
    return this.service.suggestions(user.id, query);
  }

  @Put()
  upsert(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(upsertBudgetSchema)) dto: UpsertBudgetInput,
  ) {
    return this.service.upsert(user.id, dto);
  }

  @Post('apply-suggestions')
  applySuggestions(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(applySuggestionsSchema)) dto: ApplySuggestionsInput,
  ) {
    return this.service.applySuggestions(user.id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.remove(user.id, id);
  }
}
