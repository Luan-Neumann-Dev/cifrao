import { Injectable } from '@nestjs/common';
import {
  type AppNotification,
  type NotificationPrefs,
  addDaysToParts,
  addMonths,
  buildNotifications,
  monthKeyInSaoPaulo,
  saoPauloDateParts,
  saoPauloWallClockToUtc,
} from '@cifrao/shared';
import { netExpenseByCategory } from '../common/expense-aggregates';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Avisos do sino (Fase 9). Decisão do dono: sem e-mail e sem push — nada é
 * gravado nem agendado. Cada chamada olha o estado atual (faturas em aberto,
 * orçamento do mês, metas, previstos) e a lógica pura de `buildNotifications`
 * decide o que merece aparecer.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<{ notifications: AppNotification[]; unread: number }> {
    const prefs = await this.prefs(userId);
    const today = saoPauloDateParts(new Date());
    const horizonte = addDaysToParts(today, prefs.notifyDaysBefore);
    // Fim do dia do horizonte, para não perder o que vence na própria data.
    const limite = saoPauloWallClockToUtc(
      horizonte.year,
      horizonte.month,
      horizonte.day,
      '23:59:59',
    );

    const [invoices, budgets, goals, forecasts] = await Promise.all([
      prefs.notifyInvoiceDue ? this.openInvoices(limite) : [],
      prefs.notifyBudgetExceeded ? this.budgets() : [],
      prefs.notifyGoalReached ? this.goals() : [],
      prefs.notifyForecastDue ? this.forecasts(limite) : [],
    ]);

    const notifications = buildNotifications({ today, prefs, invoices, budgets, goals, forecasts });
    return { notifications, unread: notifications.length };
  }

  async prefs(userId: string): Promise<NotificationPrefs> {
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
      select: {
        notifyInvoiceDue: true,
        notifyBudgetExceeded: true,
        notifyGoalReached: true,
        notifyForecastDue: true,
        notifyDaysBefore: true,
      },
    });
    return (
      user ?? {
        notifyInvoiceDue: true,
        notifyBudgetExceeded: true,
        notifyGoalReached: true,
        notifyForecastDue: true,
        notifyDaysBefore: 3,
      }
    );
  }

  /** Fatura ainda devendo: o que falta é o total lançado menos o já pago. */
  private async openInvoices(limite: Date) {
    const invoices = await this.prisma.client.invoice.findMany({
      where: { status: { in: ['OPEN', 'CLOSED', 'PARTIAL'] }, dueDate: { lte: limite } },
      select: {
        id: true,
        dueDate: true,
        paidCents: true,
        creditCard: { select: { nickname: true } },
      },
    });
    if (invoices.length === 0) return [];

    // Soma no banco (armadilha #5), não em memória.
    const totals = await this.prisma.client.transaction.groupBy({
      by: ['invoiceId'],
      where: { invoiceId: { in: invoices.map((i) => i.id) }, type: 'EXPENSE' },
      _sum: { amountCents: true },
    });
    const totalById = new Map(totals.map((t) => [t.invoiceId, t._sum.amountCents ?? 0n]));

    return invoices
      .map((invoice) => ({
        id: invoice.id,
        cardName: invoice.creditCard.nickname,
        dueDate: saoPauloDateParts(invoice.dueDate),
        remainingCents: (totalById.get(invoice.id) ?? 0n) - invoice.paidCents,
      }))
      .filter((i) => i.remainingCents > 0n);
  }

  /** Orçamento do mês corrente, com gasto líquido de reembolso (regra 5.13). */
  private async budgets() {
    const month = monthKeyInSaoPaulo(new Date());
    const budgets = await this.prisma.client.budget.findMany({
      where: { month },
      select: { categoryId: true, limitCents: true, category: { select: { name: true } } },
    });
    if (budgets.length === 0) return [];

    const [year, monthNumber] = month.split('-').map(Number);
    const start = saoPauloWallClockToUtc(year, monthNumber, 1, '00:00:00');
    const next = addMonths(year, monthNumber, 1);
    const end = saoPauloWallClockToUtc(next.year, next.month, 1, '00:00:00');

    const spend = await netExpenseByCategory(this.prisma.client, {
      status: { not: 'FORECAST' },
      date: { gte: start, lt: end },
    });

    return budgets.map((budget) => ({
      categoryId: budget.categoryId,
      categoryName: budget.category.name,
      limitCents: budget.limitCents,
      spentCents: spend.byCategory.get(budget.categoryId) ?? 0n,
    }));
  }

  /** Regra 5.9: progresso é o saldo vinculado, lido — nunca somado à parte. */
  private async goals() {
    const goals = await this.prisma.client.goal.findMany({
      where: { archived: false },
      select: {
        id: true,
        name: true,
        targetCents: true,
        linkedAccount: { select: { balanceCents: true } },
      },
    });
    return goals.map((goal) => ({
      id: goal.id,
      name: goal.name,
      targetCents: goal.targetCents,
      currentCents: goal.linkedAccount.balanceCents,
    }));
  }

  /** Previstos da regra 5.11 que já dá para confirmar. */
  private async forecasts(limite: Date) {
    const rows = await this.prisma.client.transaction.findMany({
      where: { status: 'FORECAST', date: { lte: limite } },
      orderBy: { date: 'asc' },
      take: 20,
      select: { id: true, description: true, date: true, amountCents: true, type: true },
    });
    return rows.map((row) => ({
      id: row.id,
      description: row.description,
      date: saoPauloDateParts(row.date),
      amountCents: row.amountCents,
      type: row.type === 'INCOME' ? ('INCOME' as const) : ('EXPENSE' as const),
    }));
  }
}
