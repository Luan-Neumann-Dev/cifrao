import { Module } from '@nestjs/common';
import { AccountsModule } from './accounts/accounts.module';
import { CategoriesModule } from './categories/categories.module';
import { CreditCardsModule } from './credit-cards/credit-cards.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { HealthModule } from './health/health.module';
import { MeModule } from './me/me.module';
import { PrismaModule } from './prisma/prisma.module';
import { TagsModule } from './tags/tags.module';
import { TransactionsModule } from './transactions/transactions.module';

@Module({
  imports: [
    PrismaModule,
    HealthModule,
    MeModule,
    AccountsModule,
    CategoriesModule,
    TagsModule,
    TransactionsModule,
    CreditCardsModule,
    DashboardModule,
  ],
})
export class AppModule {}
