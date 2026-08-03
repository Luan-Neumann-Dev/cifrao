import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  type CreateRecurringRuleInput,
  type UpdateRecurringRuleInput,
  createRecurringRuleSchema,
  updateRecurringRuleSchema,
} from '@cifrao/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { RecurringRulesService } from './recurring-rules.service';

@Controller('recurring-rules')
@UseGuards(JwtAuthGuard)
export class RecurringRulesController {
  constructor(private readonly service: RecurringRulesService) {}

  @Get()
  list() {
    return this.service.list();
  }

  /** Previstos já gerados (opcionalmente de uma regra). Antes de :id na ordem. */
  @Get('forecasts')
  forecasts(@Query('ruleId') ruleId?: string) {
    return this.service.forecasts(ruleId);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Post()
  create(@Body(new ZodValidationPipe(createRecurringRuleSchema)) dto: CreateRecurringRuleInput) {
    return this.service.create(dto);
  }

  /** Dispara a geração manualmente (o cron diário faz o mesmo às 03:00). */
  @Post('generate')
  generateAll() {
    return this.service.generateAll();
  }

  @Post(':id/generate')
  generate(@Param('id') id: string) {
    return this.service.generateForRule(id).then((created) => ({ created }));
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateRecurringRuleSchema)) dto: UpdateRecurringRuleInput,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
