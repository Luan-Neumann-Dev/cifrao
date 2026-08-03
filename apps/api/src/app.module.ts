import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AccountsModule } from './accounts/accounts.module';
import { BudgetsModule } from './budgets/budgets.module';
import { CalendarModule } from './calendar/calendar.module';
import { CategoriesModule } from './categories/categories.module';
import { CreditCardsModule } from './credit-cards/credit-cards.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { GoalsModule } from './goals/goals.module';
import { HealthModule } from './health/health.module';
import { MeModule } from './me/me.module';
import { PrismaModule } from './prisma/prisma.module';
import { ReceivablesModule } from './receivables/receivables.module';
import { RecurringModule } from './recurring/recurring.module';
import { TagsModule } from './tags/tags.module';
import { TransactionsModule } from './transactions/transactions.module';

@Module({
  imports: [
    // Cron da regra 5.11 (geração diária de previstos).
    ScheduleModule.forRoot(),
    PrismaModule,
    HealthModule,
    MeModule,
    AccountsModule,
    CategoriesModule,
    TagsModule,
    TransactionsModule,
    CreditCardsModule,
    DashboardModule,
    RecurringModule,
    BudgetsModule,
    GoalsModule,
    CalendarModule,
    ReceivablesModule,
  ],
})
export class AppModule {}
