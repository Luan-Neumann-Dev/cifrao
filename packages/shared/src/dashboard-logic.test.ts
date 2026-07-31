import { describe, expect, it } from 'vitest';
import { computeAvailableEndOfMonthCents, pickTopInsight } from './dashboard-logic';

describe('regra 5.11 — disponível de verdade até o fim do mês', () => {
  it('saldo + receitas previstas − despesas previstas − comprometido do cartão', () => {
    const r = computeAvailableEndOfMonthCents({
      liquidTodayCents: 500000n,
      forecastIncomeCents: 300000n,
      forecastExpenseCents: 120000n,
      cardCommittedCents: 200000n,
    });
    expect(r).toBe(480000n); // 500000 + 300000 − 120000 − 200000
  });

  it('pode ficar negativo (alerta de estouro)', () => {
    const r = computeAvailableEndOfMonthCents({
      liquidTodayCents: 10000n,
      forecastIncomeCents: 0n,
      forecastExpenseCents: 5000n,
      cardCommittedCents: 30000n,
    });
    expect(r).toBe(-25000n);
  });

  it('sem previstos nem comprometido, é o próprio saldo', () => {
    expect(
      computeAvailableEndOfMonthCents({
        liquidTodayCents: 77000n,
        forecastIncomeCents: 0n,
        forecastExpenseCents: 0n,
        cardCommittedCents: 0n,
      }),
    ).toBe(77000n);
  });
});

describe('insight do mês — categoria que mais estourou vs. a média', () => {
  it('escolhe o maior delta positivo e ignora sem categoria', () => {
    const current = new Map<string | null, bigint>([
      ['mercado', 90000n],
      ['transporte', 30000n],
      [null, 999999n],
    ]);
    const avg = new Map<string | null, bigint>([
      ['mercado', 60000n], // +30000
      ['transporte', 40000n], // −10000 (economizou)
    ]);
    const top = pickTopInsight(current, avg);
    expect(top?.categoryId).toBe('mercado');
    expect(top?.deltaCents).toBe(30000n);
  });

  it('retorna null quando nada estourou', () => {
    const current = new Map<string | null, bigint>([['mercado', 10000n]]);
    const avg = new Map<string | null, bigint>([['mercado', 20000n]]);
    expect(pickTopInsight(current, avg)).toBeNull();
  });

  it('categoria sem média histórica conta como estouro total', () => {
    const current = new Map<string | null, bigint>([['novo', 15000n]]);
    const avg = new Map<string | null, bigint>();
    expect(pickTopInsight(current, avg)?.deltaCents).toBe(15000n);
  });
});
