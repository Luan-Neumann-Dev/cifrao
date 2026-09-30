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
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthUser } from '../auth/jwt-verifier';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { InvestmentsService } from './investments.service';

@Controller('investments')
@UseGuards(JwtAuthGuard)
export class InvestmentsController {
  constructor(private readonly service: InvestmentsService) {}

  /** Painel da carteira: totais, posições, alocação e evolução. */
  @Get()
  overview(@CurrentUser() user: AuthUser) {
    return this.service.overview(user.id);
  }

  @Get('list')
  list(@CurrentUser() user: AuthUser, @Query('includeArchived') includeArchived?: string) {
    return this.service.list(user.id, includeArchived === 'true');
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.get(user.id, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createInvestmentSchema)) dto: CreateInvestmentInput,
  ) {
    return this.service.create(user.id, dto);
  }

  @Post(':id/contribute')
  contribute(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(investmentTradeSchema)) dto: InvestmentTradeInput,
  ) {
    return this.service.contribute(user.id, id, dto);
  }

  @Post(':id/redeem')
  redeem(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(investmentTradeSchema)) dto: InvestmentTradeInput,
  ) {
    return this.service.redeem(user.id, id, dto);
  }

  @Patch(':id/price')
  updatePrice(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updatePriceSchema)) dto: UpdatePriceInput,
  ) {
    return this.service.updatePrice(user.id, id, dto);
  }

  @Put('targets')
  setTargets(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(allocationTargetsSchema)) dto: AllocationTargetsInput,
  ) {
    return this.service.setTargets(user.id, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateInvestmentSchema)) dto: UpdateInvestmentInput,
  ) {
    return this.service.update(user.id, id, dto);
  }

  @Delete(':id/trades/:tradeId')
  removeTrade(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('tradeId') tradeId: string,
  ) {
    return this.service.removeTrade(user.id, id, tradeId);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.remove(user.id, id);
  }
}
