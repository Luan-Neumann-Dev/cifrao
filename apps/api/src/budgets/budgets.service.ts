import { Injectable, NotFoundException } from '@nestjs/common';
import {
  type ApplySuggestionsInput,
  type MonthQuery,
  type UpsertBudgetInput,
  addMonths,
  computeBudgetStatus,
  daysRemainingInMonth,
  monthKeyInSaoPaulo,
  saoPauloDateParts,
  saoPauloWallClockToUtc,
  suggestLimitCents,
} from '@cifrao/shared';
import { netExpenseByCategory } from '../common/expense-aggregates';
import { PrismaService } from '../prisma/prisma.service';

/** Janela usada pela sugestão de limites (regra 5.10). */
const SUGGESTION_MONTHS = 3;

@Injectable()
export class BudgetsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Regra 5.10: limite mensal por categoria com gasto do mês, restante e média
   * diária permitida no que resta do mês. Gasto vem de `groupBy` no banco
   * (armadilha #5) e ignora transferências/ajustes/previstos (regra 5.7).
   */
  async list(query: MonthQuery) {
    const month = query.month ?? monthKeyInSaoPaulo(new Date());
    const { start, end } = monthRange(month);
    const [year, monthNumber] = month.split('-').map(Number);

    const [budgets, spend] = await Promise.all([
      this.prisma.client.budget.findMany({
        where: { month },
        include: { category: { select: { id: true, name: true, color: true, icon: true } } },
      }),
      // Gasto líquido: reembolso recebido não consome orçamento (regra 5.13).
      netExpenseByCategory(this.prisma.client, {
        status: { not: 'FORECAST' },
        date: { gte: start, lt: end },
      }),
    ]);

    const spentByCategory = spend.byCategory;

    const daysRemaining = daysRemainingInMonth(year, monthNumber, saoPauloDateParts(new Date()));
    const items = budgets
      .map((b) => ({
        id: b.id,
        categoryId: b.categoryId,
        category: b.category,
        month: b.month,
        ...computeBudgetStatus({
          limitCents: b.limitCents,
          spentCents: spentByCategory.get(b.categoryId) ?? 0n,
          daysRemaining,
        }),
      }))
      .sort((a, b) => b.percentUsed - a.percentUsed);

    const totalLimitCents = items.reduce((acc, i) => acc + i.limitCents, 0n);
    const totalSpentCents = items.reduce((acc, i) => acc + i.spentCents, 0n);

    return {
      month,
      daysRemaining,
      items,
      totals: computeBudgetStatus({
        limitCents: totalLimitCents,
        spentCents: totalSpentCents,
        daysRemaining,
      }),
    };
  }

  async upsert(input: UpsertBudgetInput) {
    const category = await this.prisma.client.category.findUnique({
      where: { id: input.categoryId },
    });
    if (!category) throw new NotFoundException('Categoria não encontrada');

    return this.prisma.client.budget.upsert({
      where: { categoryId_month: { categoryId: input.categoryId, month: input.month } },
      create: {
        categoryId: input.categoryId,
        month: input.month,
        limitCents: BigInt(input.limitCents),
      },
      update: { limitCents: BigInt(input.limitCents) },
      include: { category: { select: { id: true, name: true, color: true, icon: true } } },
    });
  }

  async remove(id: string) {
    const found = await this.prisma.client.budget.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Orçamento não encontrado');
    await this.prisma.client.budget.delete({ where: { id } });
    return { ok: true };
  }

  /**
   * Regra 5.10 — "sugerir limites": média do gasto por categoria nos últimos 3
   * meses (os 3 meses ANTERIORES ao mês de referência, que ainda está correndo).
   */
  async suggestions(query: MonthQuery) {
    const month = query.month ?? monthKeyInSaoPaulo(new Date());
    const { start: monthStart } = monthRange(month);
    const [year, monthNumber] = month.split('-').map(Number);
    const windowStartMonth = addMonths(year, monthNumber, -SUGGESTION_MONTHS);
    const windowStart = saoPauloWallClockToUtc(
      windowStartMonth.year,
      windowStartMonth.month,
      1,
      '00:00:00',
    );

    const [history, categories, existing] = await Promise.all([
      // Média dos 3 meses também é líquida de reembolso (5.13).
      netExpenseByCategory(this.prisma.client, {
        status: { not: 'FORECAST' },
        date: { gte: windowStart, lt: monthStart },
      }),
      this.prisma.client.category.findMany({
        select: { id: true, name: true, color: true, icon: true },
      }),
      this.prisma.client.budget.findMany({ where: { month } }),
    ]);

    const catById = new Map(categories.map((c) => [c.id, c]));
    const currentByCategory = new Map(existing.map((b) => [b.categoryId, b.limitCents]));

    return {
      month,
      months: SUGGESTION_MONTHS,
      items: [...history.byCategory.entries()]
        .filter(([categoryId, total]) => categoryId !== null && total > 0n)
        .map(([key, total]) => {
          const categoryId = key as string;
          // O total da janela já é a soma dos 3 meses; o divisor é a janela inteira.
          const suggestedCents = suggestLimitCents([total], SUGGESTION_MONTHS);
          return {
            categoryId,
            category: catById.get(categoryId) ?? null,
            historyTotalCents: total,
            suggestedCents,
            currentLimitCents: currentByCategory.get(categoryId) ?? null,
          };
        })
        .filter((i) => i.suggestedCents > 0n)
        .sort((a, b) => (b.suggestedCents > a.suggestedCents ? 1 : -1)),
    };
  }

  /** Aplica as sugestões de uma vez (todas ou só as categorias informadas). */
  async applySuggestions(input: ApplySuggestionsInput) {
    const { items } = await this.suggestions({ month: input.month });
    const wanted = input.categoryIds ? new Set(input.categoryIds) : null;
    const selected = items.filter((i) => !wanted || wanted.has(i.categoryId));

    await this.prisma.client.$transaction(
      selected.map((i) =>
        this.prisma.client.budget.upsert({
          where: { categoryId_month: { categoryId: i.categoryId, month: input.month } },
          create: { categoryId: i.categoryId, month: input.month, limitCents: i.suggestedCents },
          update: { limitCents: i.suggestedCents },
        }),
      ),
    );
    return { applied: selected.length, month: input.month };
  }
}

/** Intervalo UTC [início do mês, início do mês seguinte) para "yyyy-MM" em SP. */
function monthRange(month: string): { start: Date; end: Date } {
  const [year, monthNumber] = month.split('-').map(Number);
  const next = addMonths(year, monthNumber, 1);
  return {
    start: saoPauloWallClockToUtc(year, monthNumber, 1, '00:00:00'),
    end: saoPauloWallClockToUtc(next.year, next.month, 1, '00:00:00'),
  };
}
