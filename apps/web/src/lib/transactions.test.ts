import { describe, expect, it } from 'vitest';
import type { Transaction } from './api';
import { filteredTotals, groupByDay, signedCents, sourceLabel } from './transactions';

function tx(over: Partial<Transaction>): Transaction {
  return {
    id: Math.random().toString(36).slice(2),
    type: 'EXPENSE',
    amountCents: '1000',
    date: '2026-07-12T15:00:00.000Z',
    description: 'Compra',
    status: 'CLEARED',
    notes: null,
    isReimbursable: false,
    reimbursedAt: null,
    account: null,
    fromAccount: null,
    toAccount: null,
    category: null,
    tags: [],
    ...over,
  };
}

describe('efeito no bolso, com sinal', () => {
  it('transferência não move o total (regra 5.7)', () => {
    expect(signedCents(tx({ type: 'TRANSFER', amountCents: '50000' }))).toBe(0);
  });

  it('despesa é negativa e receita é positiva', () => {
    expect(signedCents(tx({ type: 'EXPENSE', amountCents: '4890' }))).toBe(-4890);
    expect(signedCents(tx({ type: 'INCOME', amountCents: '820000' }))).toBe(820000);
  });
});

describe('agrupamento por dia', () => {
  const hoje = new Date('2026-07-12T15:00:00.000Z');

  it('rotula hoje e ontem pelo nome, e o resto pela data', () => {
    const groups = groupByDay(
      [
        tx({ date: '2026-07-12T15:00:00.000Z' }),
        tx({ date: '2026-07-11T15:00:00.000Z' }),
        tx({ date: '2026-07-10T15:00:00.000Z' }),
      ],
      hoje,
    );
    expect(groups.map((g) => g.label)).toEqual([
      'Hoje · Dom, 12 jul',
      'Ontem · Sáb, 11 jul',
      'Sex, 10 jul',
    ]);
  });

  it('previstos saem num grupo próprio, no fim da lista', () => {
    const groups = groupByDay(
      [
        tx({ status: 'FORECAST', date: '2026-07-20T15:00:00.000Z' }),
        tx({ date: '2026-07-12T15:00:00.000Z' }),
      ],
      hoje,
    );
    expect(groups).toHaveLength(2);
    expect(groups[0].forecast).toBe(false);
    expect(groups[1].label).toBe('Próximos · previstos');
    expect(groups[1].forecast).toBe(true);
  });

  it('total do dia soma com sinal e ignora transferência', () => {
    const groups = groupByDay(
      [
        tx({ type: 'EXPENSE', amountCents: '4890' }),
        tx({ type: 'EXPENSE', amountCents: '2240' }),
        tx({ type: 'TRANSFER', amountCents: '50000' }),
      ],
      hoje,
    );
    expect(groups[0].totalCents).toBe(-7130);
  });

  it('lançamento de madrugada em UTC fica no dia anterior, em SP', () => {
    // 13/07 às 02:00 UTC = 12/07 às 23:00 em São Paulo.
    const groups = groupByDay([tx({ date: '2026-07-13T02:00:00.000Z' })], hoje);
    expect(groups[0].label).toBe('Hoje · Dom, 12 jul');
  });
});

describe('totais do rodapé', () => {
  it('transferência não entra em entradas nem em saídas (regra 5.7)', () => {
    const t = filteredTotals([
      tx({ type: 'INCOME', amountCents: '820000' }),
      tx({ type: 'EXPENSE', amountCents: '21430' }),
      tx({ type: 'TRANSFER', amountCents: '50000' }),
    ]);
    expect(t.incomeCents).toBe(820000);
    expect(t.expenseCents).toBe(21430);
    expect(t.netCents).toBe(820000 - 21430);
  });

  it('estorno de reembolso abate o gasto em vez de virar receita (regra 5.13)', () => {
    const t = filteredTotals([
      tx({ type: 'EXPENSE', amountCents: '10000' }),
      tx({ type: 'INCOME', amountCents: '10000', reimbursesTransactionId: 'x' }),
    ]);
    expect(t.incomeCents).toBe(0);
    expect(t.expenseCents).toBe(0);
  });

  it('previsto não conta como realizado', () => {
    const t = filteredTotals([tx({ type: 'EXPENSE', amountCents: '3990', status: 'FORECAST' })]);
    expect(t.expenseCents).toBe(0);
  });
});

describe('rótulo de origem', () => {
  it('transferência mostra as duas pontas', () => {
    const t = tx({
      type: 'TRANSFER',
      fromAccount: { id: '1', name: 'Nubank', color: null },
      toAccount: { id: '2', name: 'NuInvest', color: null },
    });
    expect(sourceLabel(t)).toBe('Nubank → NuInvest');
  });

  it('despesa no débito cita a forma e a conta', () => {
    const t = tx({ paymentMethod: 'DEBIT', account: { id: '1', name: 'Nubank', color: null } });
    expect(sourceLabel(t)).toBe('Débito · Nubank');
  });

  it('compra no crédito cita só o cartão — "Crédito · cartão" é redundante', () => {
    const t = tx({
      paymentMethod: 'CREDIT',
      creditCard: { id: '1', nickname: 'Roxinho', color: null },
    });
    expect(sourceLabel(t)).toBe('Roxinho');
  });
});
