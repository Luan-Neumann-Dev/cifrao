import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  type CreateCardPurchaseInput,
  type CreateCreditCardInput,
  type UpdateCreditCardInput,
  createCardPurchaseSchema,
  createCreditCardSchema,
  updateCreditCardSchema,
} from '@cifrao/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CreditCardsService } from './credit-cards.service';

@Controller('credit-cards')
@UseGuards(JwtAuthGuard)
export class CreditCardsController {
  constructor(private readonly service: CreditCardsService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Get(':id/commitment')
  commitment(@Param('id') id: string) {
    return this.service.commitment(id);
  }

  @Post()
  create(@Body(new ZodValidationPipe(createCreditCardSchema)) dto: CreateCreditCardInput) {
    return this.service.create(dto);
  }

  @Post(':id/purchases')
  createPurchase(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createCardPurchaseSchema)) dto: CreateCardPurchaseInput,
  ) {
    return this.service.createPurchase(id, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateCreditCardSchema)) dto: UpdateCreditCardInput,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
