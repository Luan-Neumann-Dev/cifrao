import { describe, expect, it } from 'vitest';
import type { TxLike } from './transaction-logic';
import {
  accountDeltaCents,
  computeAdjustmentDeltaCents,
  netCashflowCents,
  sumByCategory,
  sumExpenseCents,
  sumIncomeCents,
} from './transaction-logic';

const expense = (amount: number, accountId = 'A', extra: Partial<TxLike> = {}): TxLike => ({
  type: 'EXPENSE',
  amountCents: amount,
  accountId,
  ...extra,
});
const income = (amount: number, accountId = 'A', extra: Partial<TxLike> = {}): TxLike => ({
  type: 'INCOME',
  amountCents: amount,
  accountId,
  ...extra,
});
const transfer = (amount: number, from = 'A', to = 'B'): TxLike => ({
  type: 'TRANSFER',
  amountCents: amount,
  fromAccountId: from,
  toAccountId: to,
});
const adjustment = (delta: number, accountId = 'A'): TxLike => ({
  type: 'ADJUSTMENT',
  amountCents: delta,
  accountId,
});

describe('regra 5.7 — transferência não é receita nem despesa', () => {
  const txs: TxLike[] = [
    expense(1000),
    income(5000),
    transfer(9999, 'A', 'B'),
    adjustment(1234),
  ];

  it('soma de despesas ignora transferência, receita e ajuste', () => {
    expect(sumExpenseCents(txs)).toBe(1000n);
  });

  it('soma de receitas ignora transferência, despesa e ajuste', () => {
    expect(sumIncomeCents(txs)).toBe(5000n);
  });

  it('fluxo líquido não é afetado por transferências', () => {
    expect(netCashflowCents(txs)).toBe(4000n);
    // Adicionar qualquer transferência não muda o líquido:
    expect(netCashflowCents([...txs, transfer(123456)])).toBe(4000n);
  });

  it('agrupamento por categoria exclui transferência e ajuste', () => {
    const grouped = sumByCategory([
      expense(1000, 'A', { categoryId: 'mercado' }),
      income(5000, 'A', { categoryId: 'salario' }),
      transfer(9999),
      adjustment(1234),
    ]);
    expect(grouped.get('mercado')?.expenseCents).toBe(1000n);
    expect(grouped.get('salario')?.incomeCents).toBe(5000n);
    // Nenhuma entrada nula criada por transfer/adjustment:
    expect(grouped.has(null)).toBe(false);
    expect(grouped.size).toBe(2);
  });
});

describe('saldo mantido — accountDeltaCents', () => {
  it('despesa debita a conta', () => {
    expect(accountDeltaCents(expense(1000, 'A'), 'A')).toBe(-1000n);
  });
  it('receita credita a conta', () => {
    expect(accountDeltaCents(income(1000, 'A'), 'A')).toBe(1000n);
  });
  it('transferência debita a origem e credita o destino', () => {
    const t = transfer(1000, 'A', 'B');
    expect(accountDeltaCents(t, 'A')).toBe(-1000n);
    expect(accountDeltaCents(t, 'B')).toBe(1000n);
    expect(accountDeltaCents(t, 'C')).toBe(0n);
  });
  it('ajuste aplica o delta com sinal na conta', () => {
    expect(accountDeltaCents(adjustment(-500, 'A'), 'A')).toBe(-500n);
    expect(accountDeltaCents(adjustment(500, 'A'), 'A')).toBe(500n);
  });
});

describe('regra 5.8 — ajuste = saldo real − saldo atual', () => {
  it('real acima do atual gera delta positivo', () => {
    expect(computeAdjustmentDeltaCents(10000, 8000)).toBe(2000n);
  });
  it('real abaixo do atual gera delta negativo', () => {
    expect(computeAdjustmentDeltaCents(8000, 10000)).toBe(-2000n);
  });
  it('iguais geram delta zero', () => {
    expect(computeAdjustmentDeltaCents(5000n, 5000n)).toBe(0n);
  });
});

describe('FORECAST não conta como realizado', () => {
  it('despesa prevista é ignorada nas somas', () => {
    expect(sumExpenseCents([expense(1000, 'A', { status: 'FORECAST' }), expense(200)])).toBe(200n);
  });
});
