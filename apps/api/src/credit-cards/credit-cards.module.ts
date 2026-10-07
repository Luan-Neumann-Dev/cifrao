import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CreditCardsController } from './credit-cards.controller';
import { CreditCardsService } from './credit-cards.service';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { PurchasesController } from './purchases.controller';
import { PurchasesService } from './purchases.service';

@Module({
  imports: [AuthModule],
  controllers: [CreditCardsController, InvoicesController, PurchasesController],
  providers: [CreditCardsService, InvoicesService, PurchasesService],
  exports: [CreditCardsService, InvoicesService, PurchasesService],
})
export class CreditCardsModule {}
