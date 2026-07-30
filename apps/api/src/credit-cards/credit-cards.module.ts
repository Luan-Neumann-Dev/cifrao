import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CreditCardsController } from './credit-cards.controller';
import { CreditCardsService } from './credit-cards.service';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';

@Module({
  imports: [AuthModule],
  controllers: [CreditCardsController, InvoicesController],
  providers: [CreditCardsService, InvoicesService],
  exports: [CreditCardsService, InvoicesService],
})
export class CreditCardsModule {}
