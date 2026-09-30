import { Injectable } from '@nestjs/common';
import type { Prisma } from '@cifrao/db';
import {
  type DashboardQuery,
  addMonths,
  computeAvailableEndOfMonthCents,
  computeBudgetStatus,
  daysRemainingInMonth,
  deriveInvoiceStatus,
  monthKeyInSaoPaulo,
  pickTopInsight,
  saoPauloDateParts,
  saoPauloWallClockToUtc,
} from '@cifrao/shared';
import { netExpenseByCategory } from '../common/expense-aggregates';
import { currentPortfolioValueCents } from '../common/portfolio';
import { PrismaService } from '../prisma/prisma.service';

const recentInclude = {
  account: { select: { id: true, name: true, color: true } },
  fromAccount: { select: { id: true, name: true, color: true } },
  toAccount: { select: { id: true, name: true, color: true } },
  category: { select: { id: true, name: true, color: true, icon: true } },
  creditCard: { select: { id: true, nickname: true, color: true } },
  tags: { include: { tag: true } },
} satisfies Prisma.TransactionInclude;

function sumBigint(rows: { _sum: { amountCents: bigint | null } }[]): bigint {
  return rows.reduce((acc, r) => acc + (r._sum.amountCents ?? 0n), 0n);
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(userId: string, query: DashboardQuery) {
    const monthKey = query.month ?? monthKeyInSaoPaulo(new Date());
    const [year, month] = monthKey.split('-').map(Number);

    const monthStart = saoPauloWallClockToUtc(year, month, 1, '00:00:00');
    const next = addMonths(year, month, 1);
    const nextMonthStart = saoPauloWallClockToUtc(next.year, next.month, 1, '00:00:00');
    const prev3 = addMonths(year, month, -3);
    const prev3Start = saoPauloWallClockToUtc(prev3.year, prev3.month, 1, '00:00:00');

    const now = new Date();
    const t = saoPauloDateParts(now);
    const startOfToday = saoPauloWallClockToUtc(t.year, t.month, t.day, '00:00:00');

    const db = this.prisma.client;
    const monthRange = { gte: monthStart, lt: nextMonthStart };

    const [
      accounts,
      invoices,
      invoiceTotals,
      categories,
      monthSpend,
      prevSpend,
      monthIncomeCents,
      forecastTypeRows,
      forecastUpcoming,
      recent,
      budgets,
      portfolioValueCents,
    ] = await Promise.all([
      db.account.findMany({ where: { userId, archived: false }, orderBy: { createdAt: 'asc' } }),
      db.invoice.findMany({
        where: { userId },
        include: { creditCard: { select: { id: true, nickname: true, color: true } } },
      }),
      db.transaction.groupBy({
        by: ['invoiceId'],
        where: { userId, invoiceId: { not: null }, type: 'EXPENSE', status: { not: 'FORECAST' } },
        _sum: { amountCents: true },
      }),
      db.category.findMany({
        where: { OR: [{ userId }, { userId: null }] },
        select: { id: true, name: true, color: true, icon: true },
      }),
      // Gasto líquido de reembolso, no mês e na janela de 3 meses (regra 5.13).
      netExpenseByCategory(db, { userId, status: { not: 'FORECAST' }, date: monthRange }),
      netExpenseByCategory(db, {
        userId,
        status: { not: 'FORECAST' },
        date: { gte: prev3Start, lt: monthStart },
      }),
      // Receita do mês exclui estornos: devolução não é ganho.
      db.transaction
        .aggregate({
          where: {
            userId,
            type: 'INCOME',
            reimbursesTransactionId: null,
            status: { not: 'FORECAST' },
            date: monthRange,
          },
          _sum: { amountCents: true },
        })
        .then((agg) => agg._sum.amountCents ?? 0n),
      db.transaction.groupBy({
        by: ['type'],
        where: {
          userId,
          type: { in: ['EXPENSE', 'INCOME'] },
          status: 'FORECAST',
          date: { lt: nextMonthStart },
        },
        _sum: { amountCents: true },
      }),
      db.transaction.findMany({
        where: {
          userId,
          status: 'FORECAST',
          date: { gte: startOfToday },
          type: { in: ['EXPENSE', 'INCOME'] },
        },
        orderBy: { date: 'asc' },
        take: 12,
        include: { category: { select: { id: true, name: true, color: true, icon: true } } },
      }),
      db.transaction.findMany({
        where: { userId },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        take: 8,
        include: recentInclude,
      }),
      // Orçamento do mês (Fase 5): reaproveita o groupBy de gastos por categoria.
      db.budget.findMany({
        where: { userId, month: monthKey },
        include: { category: { select: { id: true, name: true, color: true, icon: true } } },
      }),
      // Carteira a preço de mercado (Fase 8). Aportar tira o dinheiro da conta,
      // então somar contas + carteira não conta o mesmo real duas vezes.
      currentPortfolioValueCents(db, userId),
    ]);

    // ── Saldos e patrimônio ───────────────────────────────────────────────────
    const availableTodayCents = accounts
      .filter((a) => a.type !== 'INVESTMENT')
      .reduce((acc, a) => acc + a.balanceCents, 0n);
    const accountsTotalCents = accounts.reduce((acc, a) => acc + a.balanceCents, 0n);

    // ── Faturas e comprometido do cartão ──────────────────────────────────────
    const totalByInvoice = new Map<string, bigint>();
    for (const r of invoiceTotals) {
      if (r.invoiceId) totalByInvoice.set(r.invoiceId, r._sum.amountCents ?? 0n);
    }
    let cardCommittedCents = 0n;
    const openInvoices = invoices
      .map((inv) => {
        const totalCents = totalByInvoice.get(inv.id) ?? 0n;
        const remainingRaw = totalCents - inv.paidCents;
        const remainingCents = remainingRaw > 0n ? remainingRaw : 0n;
        cardCommittedCents += remainingCents;
        return {
          id: inv.id,
          creditCardId: inv.creditCardId,
          cardNickname: inv.creditCard.nickname,
          cardColor: inv.creditCard.color,
          referenceMonth: inv.referenceMonth,
          closingDate: inv.closingDate,
          dueDate: inv.dueDate,
          totalCents,
          paidCents: inv.paidCents,
          remainingCents,
          status: deriveInvoiceStatus({ totalCents, paidCents: inv.paidCents, closingDate: inv.closingDate, now }),
        };
      })
      .filter((inv) => inv.remainingCents > 0n)
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

    const openInvoicesTop = openInvoices.slice(0, 6);

    // ── Patrimônio = contas + carteira − faturas em aberto ────────────────────
    const netWorthCents = accountsTotalCents + portfolioValueCents - cardCommittedCents;

    // ── Disponível de verdade até o fim do mês (regra 5.11) ───────────────────
    const forecastIncomeCents = sumBigint(forecastTypeRows.filter((r) => r.type === 'INCOME'));
    const forecastExpenseCents = sumBigint(forecastTypeRows.filter((r) => r.type === 'EXPENSE'));
    const availableEndOfMonthCents = computeAvailableEndOfMonthCents({
      liquidTodayCents: availableTodayCents,
      forecastIncomeCents,
      forecastExpenseCents,
      cardCommittedCents,
    });

    // ── Gastos por categoria (mês corrente, líquido de reembolso) ─────────────
    const catById = new Map(categories.map((c) => [c.id, c]));
    const categorySpending = [...monthSpend.byCategory.entries()]
      .map(([categoryId, cents]) => {
        const cat = categoryId ? catById.get(categoryId) : null;
        return {
          categoryId,
          name: cat?.name ?? 'Sem categoria',
          color: cat?.color ?? null,
          icon: cat?.icon ?? null,
          cents,
        };
      })
      .filter((c) => c.cents > 0n)
      .sort((a, b) => (b.cents > a.cents ? 1 : -1));

    // ── Totais do mês (realizados) ────────────────────────────────────────────
    const incomeCents = monthIncomeCents;
    const expenseCents = monthSpend.totalCents;

    // ── Insight do mês (categoria que mais estourou vs. média de 3 meses) ─────
    const avgByCat = new Map<string | null, bigint>(
      [...prevSpend.byCategory.entries()].map(([categoryId, cents]) => [categoryId, cents / 3n]),
    );
    const top = pickTopInsight(monthSpend.byCategory, avgByCat);
    const insight = top
      ? {
          categoryId: top.categoryId,
          name: catById.get(top.categoryId)?.name ?? 'Categoria',
          color: catById.get(top.categoryId)?.color ?? null,
          currentCents: top.currentCents,
          avgCents: top.avgCents,
          deltaCents: top.deltaCents,
        }
      : null;

    // ── Orçamento do mês (regra 5.10) ─────────────────────────────────────────
    const spentByCategory = monthSpend.byCategory;
    const daysRemaining = daysRemainingInMonth(year, month, t);
    const budgetItems = budgets
      .map((b) => ({
        id: b.id,
        categoryId: b.categoryId,
        category: b.category,
        ...computeBudgetStatus({
          limitCents: b.limitCents,
          spentCents: spentByCategory.get(b.categoryId) ?? 0n,
          daysRemaining,
        }),
      }))
      .sort((a, b) => b.percentUsed - a.percentUsed);
    const budgetSummary = {
      daysRemaining,
      count: budgetItems.length,
      items: budgetItems.slice(0, 5),
      totals: computeBudgetStatus({
        limitCents: budgetItems.reduce((acc, i) => acc + i.limitCents, 0n),
        spentCents: budgetItems.reduce((acc, i) => acc + i.spentCents, 0n),
        daysRemaining,
      }),
    };

    // ── Timeline "o que vem por aí" ───────────────────────────────────────────
    type Event = { date: Date; kind: string; label: string; amountCents: bigint; positive: boolean };
    const events: Event[] = [];
    for (const inv of openInvoices) {
      if (inv.dueDate.getTime() >= startOfToday.getTime()) {
        events.push({
          date: inv.dueDate,
          kind: 'invoice-due',
          label: `Fatura ${inv.cardNickname} · ${inv.referenceMonth}`,
          amountCents: inv.remainingCents,
          positive: false,
        });
      }
    }
    for (const f of forecastUpcoming) {
      events.push({
        date: f.date,
        kind: f.type === 'INCOME' ? 'forecast-income' : 'forecast-expense',
        label: f.description,
        amountCents: f.amountCents,
        positive: f.type === 'INCOME',
      });
    }
    events.sort((a, b) => a.date.getTime() - b.date.getTime());
    const timeline = events.slice(0, 8);

    return {
      month: monthKey,
      balances: {
        availableTodayCents,
        netWorthCents,
        portfolioValueCents,
        availableEndOfMonthCents,
        accounts: accounts.map((a) => ({
          id: a.id,
          name: a.name,
          type: a.type,
          color: a.color,
          balanceCents: a.balanceCents,
        })),
      },
      availableBreakdown: {
        liquidTodayCents: availableTodayCents,
        forecastIncomeCents,
        forecastExpenseCents,
        cardCommittedCents,
        resultCents: availableEndOfMonthCents,
      },
      monthTotals: { incomeCents, expenseCents, netCents: incomeCents - expenseCents },
      openInvoices: openInvoicesTop,
      categorySpending,
      budgetSummary,
      insight,
      timeline,
      recent,
    };
  }
}
