import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import {
  type AllocationTargetsInput,
  type CreateInvestmentInput,
  type InvestmentTradeInput,
  type UpdateInvestmentInput,
  type UpdatePriceInput,
  allocationTargetsSchema,
  createInvestmentSchema,
  investmentTradeSchema,
  updateInvestmentSchema,
  updatePriceSchema,
} from '@cifrao/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { InvestmentsService } from './investments.service';

@Controller('investments')
@UseGuards(JwtAuthGuard)
export class InvestmentsController {
  constructor(private readonly service: InvestmentsService) {}

  /** Painel da carteira: totais, posições, alocação e evolução. */
  @Get()
  overview() {
    return this.service.overview();
  }

  @Get('list')
  list(@Query('includeArchived') includeArchived?: string) {
    return this.service.list(includeArchived === 'true');
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Post()
  create(@Body(new ZodValidationPipe(createInvestmentSchema)) dto: CreateInvestmentInput) {
    return this.service.create(dto);
  }

  @Post(':id/contribute')
  contribute(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(investmentTradeSchema)) dto: InvestmentTradeInput,
  ) {
    return this.service.contribute(id, dto);
  }

  @Post(':id/redeem')
  redeem(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(investmentTradeSchema)) dto: InvestmentTradeInput,
  ) {
    return this.service.redeem(id, dto);
  }

  @Patch(':id/price')
  updatePrice(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updatePriceSchema)) dto: UpdatePriceInput,
  ) {
    return this.service.updatePrice(id, dto);
  }

  @Put('targets')
  setTargets(@Body(new ZodValidationPipe(allocationTargetsSchema)) dto: AllocationTargetsInput) {
    return this.service.setTargets(dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateInvestmentSchema)) dto: UpdateInvestmentInput,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id/trades/:tradeId')
  removeTrade(@Param('id') id: string, @Param('tradeId') tradeId: string) {
    return this.service.removeTrade(id, tradeId);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
