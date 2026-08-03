/**
 * Lógica pura de metas (regra 5.9) — a meta aponta para um saldo que JÁ EXISTE.
 * Ela não move dinheiro e não cria saldo paralelo: o progresso é sempre lido do
 * saldo vinculado (`currentCents`). Nenhum real é contado duas vezes.
 */

export type GoalPaceSource = 'history' | 'contribution' | 'none';

export interface GoalProgressInput {
  targetCents: bigint;
  /** Saldo lido da conta vinculada. Entrada, nunca efeito colateral. */
  currentCents: bigint;
  /** Ritmo histórico: variação média mensal do saldo vinculado (3 meses). */
  historyPaceCents: bigint;
  /** Aporte mensal declarado — usado só quando não há ritmo histórico positivo. */
  monthlyContributionCents?: bigint | null;
}

export interface GoalProgress {
  targetCents: bigint;
  currentCents: bigint;
  /** O que falta para o alvo (0 quando já alcançou). */
  remainingCents: bigint;
  percent: number;
  reached: boolean;
  paceCents: bigint;
  paceSource: GoalPaceSource;
  /** Meses no ritmo atual até bater o alvo. `null` = sem ritmo (nunca, hoje). */
  etaMonths: number | null;
}

/** Decisão do dono: ritmo = histórico de 3 meses; sem histórico, o aporte declarado. */
export function computeGoalProgress(input: GoalProgressInput): GoalProgress {
  const delta = input.targetCents - input.currentCents;
  const reached = delta <= 0n;
  const remainingCents = reached ? 0n : delta;
  const percent =
    input.targetCents > 0n ? Number((input.currentCents * 10000n) / input.targetCents) / 100 : 0;

  let paceCents = 0n;
  let paceSource: GoalPaceSource = 'none';
  const contribution = input.monthlyContributionCents ?? 0n;
  if (input.historyPaceCents > 0n) {
    paceCents = input.historyPaceCents;
    paceSource = 'history';
  } else if (contribution > 0n) {
    paceCents = contribution;
    paceSource = 'contribution';
  }

  let etaMonths: number | null = null;
  if (reached) etaMonths = 0;
  else if (paceCents > 0n) etaMonths = Number((remainingCents + paceCents - 1n) / paceCents);

  return {
    targetCents: input.targetCents,
    currentCents: input.currentCents,
    remainingCents,
    percent,
    reached,
    paceCents,
    paceSource,
    etaMonths,
  };
}

/** Meses cheios entre dois meses de calendário (pode ser negativo se já passou). */
export function monthsBetween(
  from: { year: number; month: number },
  to: { year: number; month: number },
): number {
  return to.year * 12 + to.month - (from.year * 12 + from.month);
}

/**
 * A meta bate o prazo no ritmo atual? `null` quando não há prazo definido;
 * `false` quando não há ritmo nenhum (nunca chega).
 */
export function goalOnTrack(etaMonths: number | null, monthsToDeadline: number | null): boolean | null {
  if (monthsToDeadline === null) return null;
  if (etaMonths === null) return false;
  return etaMonths <= monthsToDeadline;
}
