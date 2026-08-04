import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AccountsModule } from './accounts/accounts.module';
import { BackupModule } from './backup/backup.module';
import { BudgetsModule } from './budgets/budgets.module';
import { CalendarModule } from './calendar/calendar.module';
import { CategoriesModule } from './categories/categories.module';
import { CategoryRulesModule } from './category-rules/category-rules.module';
import { CreditCardsModule } from './credit-cards/credit-cards.module';
import { ImportsModule } from './imports/imports.module';
import { InvestmentsModule } from './investments/investments.module';
import { QueueModule } from './queue/queue.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { GoalsModule } from './goals/goals.module';
import { HealthModule } from './health/health.module';
import { MeModule } from './me/me.module';
import { PrismaModule } from './prisma/prisma.module';
import { ReceivablesModule } from './receivables/receivables.module';
import { RecurringModule } from './recurring/recurring.module';
import { ReportsModule } from './reports/reports.module';
import { SettingsModule } from './settings/settings.module';
import { TagsModule } from './tags/tags.module';
import { TransactionsModule } from './transactions/transactions.module';

@Module({
  imports: [
    // Cron da regra 5.11 (geração diária de previstos).
    ScheduleModule.forRoot(),
    PrismaModule,
    // Fila do pg-boss (regra 5.12: importação roda em job, não no request).
    QueueModule,
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
    ImportsModule,
    CategoryRulesModule,
    ReportsModule,
    InvestmentsModule,
    // Fase 9: configurações, avisos, backup e zona de risco.
    SettingsModule,
    BackupModule,
  ],
})
export class AppModule {}
