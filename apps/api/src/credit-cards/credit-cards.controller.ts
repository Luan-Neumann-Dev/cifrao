import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  type CreateCardPurchaseInput,
  type CreateCreditCardInput,
  type UpdateCreditCardInput,
  createCardPurchaseSchema,
  createCreditCardSchema,
  updateCreditCardSchema,
} from '@cifrao/shared';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthUser } from '../auth/jwt-verifier';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CreditCardsService } from './credit-cards.service';

@Controller('credit-cards')
@UseGuards(JwtAuthGuard)
export class CreditCardsController {
  constructor(private readonly service: CreditCardsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.id);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.get(user.id, id);
  }

  @Get(':id/commitment')
  commitment(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.commitment(user.id, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createCreditCardSchema)) dto: CreateCreditCardInput,
  ) {
    return this.service.create(user.id, dto);
  }

  @Post(':id/purchases')
  createPurchase(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createCardPurchaseSchema)) dto: CreateCardPurchaseInput,
  ) {
    return this.service.createPurchase(user.id, id, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateCreditCardSchema)) dto: UpdateCreditCardInput,
  ) {
    return this.service.update(user.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.remove(user.id, id);
  }
}
