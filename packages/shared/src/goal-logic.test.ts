import { describe, expect, it } from 'vitest';
import { computeGoalProgress, goalOnTrack, monthsBetween } from './goal-logic';

describe('metas (regra 5.9)', () => {
  it('lê o progresso do saldo vinculado, sem criar saldo novo', () => {
    const saldoVinculado = 250_000n; // saldo que JÁ existe na conta
    const p = computeGoalProgress({
      targetCents: 1_000_000n,
      currentCents: saldoVinculado,
      historyPaceCents: 100_000n,
    });
    // O progresso é exatamente o saldo lido: a meta não soma nada por fora.
    expect(p.currentCents).toBe(saldoVinculado);
    expect(p.percent).toBe(25);
    expect(p.remainingCents).toBe(750_000n);
    expect(p.reached).toBe(false);
  });

  it('ETA no ritmo histórico (arredonda para cima)', () => {
    const p = computeGoalProgress({
      targetCents: 1_000_000n,
      currentCents: 250_000n,
      historyPaceCents: 100_000n,
    });
    expect(p.paceSource).toBe('history');
    expect(p.etaMonths).toBe(8); // 750.000 / 100.000 = 7,5 → 8 meses
  });

  it('sem histórico positivo, cai para o aporte declarado', () => {
    const p = computeGoalProgress({
      targetCents: 600_000n,
      currentCents: 0n,
      historyPaceCents: -50_000n, // conta encolheu nos últimos 3 meses
      monthlyContributionCents: 200_000n,
    });
    expect(p.paceSource).toBe('contribution');
    expect(p.paceCents).toBe(200_000n);
    expect(p.etaMonths).toBe(3);
  });

  it('sem ritmo nenhum não inventa ETA', () => {
    const p = computeGoalProgress({
      targetCents: 600_000n,
      currentCents: 100_000n,
      historyPaceCents: 0n,
      monthlyContributionCents: null,
    });
    expect(p.paceSource).toBe('none');
    expect(p.etaMonths).toBeNull();
  });

  it('meta alcançada: restante 0, ETA 0 e percentual acima de 100 preservado', () => {
    const p = computeGoalProgress({
      targetCents: 500_000n,
      currentCents: 600_000n,
      historyPaceCents: 10_000n,
    });
    expect(p.reached).toBe(true);
    expect(p.remainingCents).toBe(0n);
    expect(p.etaMonths).toBe(0);
    expect(p.percent).toBe(120);
  });

  it('alvo zero não divide por zero', () => {
    const p = computeGoalProgress({ targetCents: 0n, currentCents: 100n, historyPaceCents: 0n });
    expect(p.percent).toBe(0);
    expect(p.reached).toBe(true);
  });

  it('prazo: no ritmo atual bate ou não bate', () => {
    expect(monthsBetween({ year: 2026, month: 8 }, { year: 2027, month: 2 })).toBe(6);
    expect(goalOnTrack(4, 6)).toBe(true);
    expect(goalOnTrack(8, 6)).toBe(false);
    expect(goalOnTrack(null, 6)).toBe(false); // sem ritmo, nunca chega
    expect(goalOnTrack(4, null)).toBeNull(); // sem prazo, não se aplica
  });
});
