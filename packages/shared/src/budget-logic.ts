import { type DateParts, daysInMonth } from './card-logic';

/**
 * Lógica pura de orçamento (regra 5.10) — limite mensal por categoria, gasto do
 * mês, restante e média diária permitida no que resta do mês. A sugestão de
 * limites usa a média dos últimos 3 meses.
 */

export interface BudgetStatusInput {
  limitCents: bigint;
  /** Gasto realizado do mês na categoria (só EXPENSE não-FORECAST). */
  spentCents: bigint;
  /** Dias restantes no mês, contando hoje. */
  daysRemaining: number;
}

export interface BudgetStatus {
  limitCents: bigint;
  spentCents: bigint;
  /** Pode ser negativo quando estourou. */
  remainingCents: bigint;
  percentUsed: number;
  /** Quanto dá para gastar por dia no que resta do mês. 0 se estourou. */
  dailyAllowanceCents: bigint;
  daysRemaining: number;
  over: boolean;
}

export function computeBudgetStatus(input: BudgetStatusInput): BudgetStatus {
  const remainingCents = input.limitCents - input.spentCents;
  const over = remainingCents < 0n;
  const percentUsed =
    input.limitCents > 0n ? Number((input.spentCents * 10000n) / input.limitCents) / 100 : 0;
  const daysRemaining = Math.max(0, Math.trunc(input.daysRemaining));
  const dailyAllowanceCents =
    !over && daysRemaining > 0 ? remainingCents / BigInt(daysRemaining) : 0n;

  return {
    limitCents: input.limitCents,
    spentCents: input.spentCents,
    remainingCents,
    percentUsed,
    dailyAllowanceCents,
    daysRemaining,
    over,
  };
}

/**
 * Dias restantes do mês (year, month) contando hoje: mês já passado → 0; mês
 * futuro → o mês inteiro; mês corrente → do dia de hoje até o último dia.
 */
export function daysRemainingInMonth(year: number, month: number, today: DateParts): number {
  const total = daysInMonth(year, month);
  if (today.year > year || (today.year === year && today.month > month)) return 0;
  if (today.year < year || (today.year === year && today.month < month)) return total;
  return total - today.day + 1;
}

/**
 * Regra 5.10: limite sugerido = média do gasto nos últimos `months` meses. O
 * divisor é fixo (a janela inteira), então mês sem gasto puxa a média para baixo.
 */
export function suggestLimitCents(monthlyTotals: bigint[], months = monthlyTotals.length): bigint {
  if (months <= 0) return 0n;
  const sum = monthlyTotals.reduce((acc, v) => acc + v, 0n);
  return sum / BigInt(months);
}
