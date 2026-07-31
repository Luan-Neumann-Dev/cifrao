/**
 * Lógica pura do dashboard — independente do Prisma. Cobre a parte testável da
 * regra 5.11 ("o dashboard usa os previstos para calcular o disponível de
 * verdade até o fim do mês") e a escolha do insight do mês.
 */

export interface AvailableEndOfMonthInput {
  /** Saldo em caixa hoje (contas líquidas, não-investimento). */
  liquidTodayCents: bigint;
  /** Receitas previstas (FORECAST) até o fim do mês. */
  forecastIncomeCents: bigint;
  /** Despesas previstas (FORECAST) até o fim do mês. */
  forecastExpenseCents: bigint;
  /** Todo o comprometido do cartão (faturas abertas + parcelas futuras). */
  cardCommittedCents: bigint;
}

/**
 * Regra 5.11 (decisão do dono): disponível até o fim do mês =
 * saldo hoje + receitas previstas − despesas previstas − comprometido do cartão.
 * Pode ficar negativo (alerta de estouro).
 */
export function computeAvailableEndOfMonthCents(i: AvailableEndOfMonthInput): bigint {
  return i.liquidTodayCents + i.forecastIncomeCents - i.forecastExpenseCents - i.cardCommittedCents;
}

export interface CategoryDelta {
  categoryId: string;
  currentCents: bigint;
  avgCents: bigint;
  deltaCents: bigint;
}

/**
 * Insight do mês: a categoria que mais estourou em relação à sua média (delta
 * positivo). Ignora lançamentos sem categoria. Retorna null se nada estourou.
 */
export function pickTopInsight(
  currentByCategory: Map<string | null, bigint>,
  avgByCategory: Map<string | null, bigint>,
): CategoryDelta | null {
  let top: CategoryDelta | null = null;
  for (const [categoryId, currentCents] of currentByCategory) {
    if (categoryId === null) continue;
    const avgCents = avgByCategory.get(categoryId) ?? 0n;
    const deltaCents = currentCents - avgCents;
    if (deltaCents <= 0n) continue;
    if (!top || deltaCents > top.deltaCents) {
      top = { categoryId, currentCents, avgCents, deltaCents };
    }
  }
  return top;
}
