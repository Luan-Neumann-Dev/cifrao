import { describe, expect, it } from 'vitest';
import { computeBudgetStatus, daysRemainingInMonth, suggestLimitCents } from './budget-logic';

describe('orçamento (regra 5.10)', () => {
  it('calcula restante, percentual e média diária no que resta do mês', () => {
    const s = computeBudgetStatus({ limitCents: 90_000n, spentCents: 30_000n, daysRemaining: 20 });
    expect(s.remainingCents).toBe(60_000n);
    expect(s.percentUsed).toBeCloseTo(33.33, 2);
    expect(s.dailyAllowanceCents).toBe(3_000n); // R$ 600 / 20 dias = R$ 30/dia
    expect(s.over).toBe(false);
  });

  it('estouro deixa restante negativo e zera a média diária', () => {
    const s = computeBudgetStatus({ limitCents: 50_000n, spentCents: 65_000n, daysRemaining: 10 });
    expect(s.remainingCents).toBe(-15_000n);
    expect(s.over).toBe(true);
    expect(s.dailyAllowanceCents).toBe(0n);
    expect(s.percentUsed).toBe(130);
  });

  it('sem dias restantes não sugere gasto diário', () => {
    const s = computeBudgetStatus({ limitCents: 50_000n, spentCents: 10_000n, daysRemaining: 0 });
    expect(s.dailyAllowanceCents).toBe(0n);
    expect(s.remainingCents).toBe(40_000n);
  });

  it('limite zero não divide por zero', () => {
    const s = computeBudgetStatus({ limitCents: 0n, spentCents: 1_000n, daysRemaining: 5 });
    expect(s.percentUsed).toBe(0);
    expect(s.over).toBe(true);
  });

  it('dias restantes: mês corrente, passado e futuro', () => {
    const hoje = { year: 2026, month: 8, day: 3 };
    expect(daysRemainingInMonth(2026, 8, hoje)).toBe(29); // 31 - 3 + 1
    expect(daysRemainingInMonth(2026, 7, hoje)).toBe(0); // mês já passou
    expect(daysRemainingInMonth(2026, 9, hoje)).toBe(30); // mês futuro inteiro
    expect(daysRemainingInMonth(2026, 2, { year: 2026, month: 2, day: 1 })).toBe(28);
  });

  it('sugestão = média dos últimos 3 meses, com divisor fixo', () => {
    expect(suggestLimitCents([30_000n, 60_000n, 90_000n])).toBe(60_000n);
    // Mês sem gasto entra na conta e puxa a média para baixo.
    expect(suggestLimitCents([90_000n, 0n, 0n])).toBe(30_000n);
    expect(suggestLimitCents([], 3)).toBe(0n);
    expect(suggestLimitCents([10_000n], 3)).toBe(3_333n);
  });
});
