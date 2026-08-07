import { Injectable } from '@nestjs/common';
import { monthKeyInSaoPaulo, nowUtc, recentMonthKeys, saoPauloWallClockToUtc } from '@cifrao/shared';
import { netExpenseByCategory, netIncomeCents } from '../common/expense-aggregates';
import { PrismaService } from '../prisma/prisma.service';

/** Quantos meses entram na média de comparação. */
const COMPARISON_MONTHS = 3;
/** Quantas categorias aparecem no "onde você mais gastou". */
const TOP_CATEGORIES = 3;

function monthBounds(month: string): { start: Date; end: Date } {
  const [year, m] = month.split('-').map(Number);
  const start = saoPauloWallClockToUtc(year, m, 1, '00:00:00');
  const nextYear = m === 12 ? year + 1 : year;
  const nextMonth = m === 12 ? 1 : m + 1;
  const end = saoPauloWallClockToUtc(nextYear, nextMonth, 1, '00:00:00');
  return { start, end };
}

@Injectable()
export class MonthReviewService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retrospectiva do mês: entrou, saiu, para onde foi e se o orçamento segurou.
   * Tudo agregado no banco e com as mesmas funções que os relatórios usam, para
   * o número da retrospectiva bater com o do relatório do mesmo mês.
   */
  async build(month?: string) {
    const target = month ?? recentMonthKeys(2, monthKeyInSaoPaulo(nowUtc()))[0];
    const { start, end } = monthBounds(target);
    const where = { status: { not: 'FORECAST' as const }, date: { gte: start, lt: end } };

    const [income, expense, budgets, categories, comparison] = await Promise.all([
      netIncomeCents(this.prisma.client, where),
      netExpenseByCategory(this.prisma.client, where),
      this.prisma.client.budget.findMany({
        where: { month: target },
        include: { category: { select: { id: true, name: true, color: true, icon: true } } },
      }),
      this.prisma.client.category.findMany({ select: { id: true, name: true, color: true, icon: true } }),
      this.comparisonAverages(target),
    ]);

    const byId = new Map(categories.map((c) => [c.id, c]));
    const topCategories = [...expense.byCategory.entries()]
      .filter(([, cents]) => cents > 0n)
      .sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0))
      .slice(0, TOP_CATEGORIES)
      .map(([categoryId, cents]) => ({
        // Gasto sem categoria também conta — some-lo daria um "onde gastei"
        // que não fecha com o total de saídas do slide anterior.
        category: (categoryId && byId.get(categoryId)) || {
          id: categoryId ?? 'sem-categoria',
          name: 'Sem categoria',
          color: null,
          icon: null,
        },
        totalCents: cents,
      }));

    // Gasto por categoria já líquido de reembolso (5.13) — o mesmo que o
    // orçamento usa, então "estourou" aqui e lá dizem a mesma coisa.
    const budgetVerdicts = budgets.map((b) => {
      // `byCategory` só tem chave de categoria de verdade; sem categoria não
      // consome orçamento nenhum.
      const spentCents = (b.categoryId && expense.byCategory.get(b.categoryId)) || 0n;
      return {
        category: b.category,
        limitCents: b.limitCents,
        spentCents,
        exceeded: spentCents > b.limitCents,
      };
    });

    const incomeCents = income;
    const expenseCents = expense.totalCents;
    return {
      month: target,
      incomeCents,
      expenseCents,
      leftoverCents: incomeCents - expenseCents,
      /** Quanto das entradas foi consumido, 0–100+ (null sem entrada nenhuma). */
      spentPercent:
        incomeCents > 0n ? Number((expenseCents * 100n) / incomeCents) : null,
      comparison,
      topCategories,
      budgets: budgetVerdicts,
      /** Sem nada lançado não há retrospectiva a contar. */
      empty: incomeCents === 0n && expenseCents === 0n,
    };
  }

  /** Média dos meses anteriores, para o "R$ 700 a mais que a média". */
  private async comparisonAverages(month: string) {
    // Os `COMPARISON_MONTHS` meses ANTES do mês da retrospectiva.
    const keys = recentMonthKeys(COMPARISON_MONTHS + 1, month).slice(0, COMPARISON_MONTHS);
    if (keys.length === 0) return { months: 0, avgIncomeCents: 0n, avgExpenseCents: 0n };

    const first = monthBounds(keys[0]).start;
    const last = monthBounds(keys[keys.length - 1]).end;
    const where = { status: { not: 'FORECAST' as const }, date: { gte: first, lt: last } };

    const [income, expense] = await Promise.all([
      netIncomeCents(this.prisma.client, where),
      netExpenseByCategory(this.prisma.client, where),
    ]);
    const n = BigInt(keys.length);
    return {
      months: keys.length,
      avgIncomeCents: income / n,
      avgExpenseCents: expense.totalCents / n,
    };
  }
}
