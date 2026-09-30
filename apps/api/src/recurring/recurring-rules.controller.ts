import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  type CreateRecurringRuleInput,
  type UpdateRecurringRuleInput,
  createRecurringRuleSchema,
  updateRecurringRuleSchema,
} from '@cifrao/shared';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthUser } from '../auth/jwt-verifier';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { RecurringRulesService } from './recurring-rules.service';

@Controller('recurring-rules')
@UseGuards(JwtAuthGuard)
export class RecurringRulesController {
  constructor(private readonly service: RecurringRulesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.id);
  }

  /** Previstos já gerados (opcionalmente de uma regra). Antes de :id na ordem. */
  @Get('forecasts')
  forecasts(@CurrentUser() user: AuthUser, @Query('ruleId') ruleId?: string) {
    return this.service.forecasts(user.id, ruleId);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.get(user.id, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createRecurringRuleSchema)) dto: CreateRecurringRuleInput,
  ) {
    return this.service.create(user.id, dto);
  }

  /** Dispara a geração manualmente (o cron diário faz o mesmo às 03:00). */
  @Post('generate')
  generateAll(@CurrentUser() user: AuthUser) {
    return this.service.generateAllForUser(user.id);
  }

  @Post(':id/generate')
  generate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.generateForRuleAsUser(user.id, id).then((created) => ({ created }));
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateRecurringRuleSchema)) dto: UpdateRecurringRuleInput,
  ) {
    return this.service.update(user.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.remove(user.id, id);
  }
}
