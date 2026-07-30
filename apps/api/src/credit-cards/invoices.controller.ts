import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { type PayInvoiceInput, payInvoiceSchema } from '@cifrao/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { InvoicesService } from './invoices.service';

@Controller('invoices')
@UseGuards(JwtAuthGuard)
export class InvoicesController {
  constructor(private readonly service: InvoicesService) {}

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Post(':id/pay')
  pay(@Param('id') id: string, @Body(new ZodValidationPipe(payInvoiceSchema)) dto: PayInvoiceInput) {
    return this.service.pay(id, dto);
  }
}
