import { describe, expect, it } from 'vitest';
import {
  type TxLike,
  accountDeltaCents,
  isReimbursementRefund,
  netCashflowCents,
  sumByCategory,
  sumExpenseCents,
  sumIncomeCents,
} from './transaction-logic';

/**
 * Regra 5.13 — o estorno de um reembolsável credita a conta, mas não é receita:
 * ele abate o gasto da categoria. Sem isso, um mês com muitos reembolsos
 * mostraria receita e despesa infladas e o orçamento seria penalizado por
 * dinheiro que voltou.
 */
const almoco: TxLike = {
  type: 'EXPENSE',
  amountCents: 12000n,
  accountId: 'acc-1',
  categoryId: 'alimentacao',
};
const estorno: TxLike = {
  type: 'INCOME',
  amountCents: 12000n,
  accountId: 'acc-1',
  categoryId: 'alimentacao',
  reimbursesTransactionId: 'tx-almoco',
};
const salario: TxLike = {
  type: 'INCOME',
  amountCents: 500000n,
  accountId: 'acc-1',
  categoryId: 'salario',
};

describe('reembolso (regra 5.13)', () => {
  it('identifica o estorno pelo vínculo com o gasto original', () => {
    expect(isReimbursementRefund(estorno)).toBe(true);
    expect(isReimbursementRefund(salario)).toBe(false);
    expect(isReimbursementRefund(almoco)).toBe(false);
  });

  it('estorno credita a conta como qualquer entrada de dinheiro', () => {
    // O dinheiro voltou de verdade: o saldo tem que subir.
    expect(accountDeltaCents(estorno, 'acc-1')).toBe(12000n);
    expect(accountDeltaCents(almoco, 'acc-1')).toBe(-12000n);
    // Gasto + estorno cheio = efeito zero no saldo.
    expect(accountDeltaCents(almoco, 'acc-1') + accountDeltaCents(estorno, 'acc-1')).toBe(0n);
  });

  it('estorno NÃO conta como receita', () => {
    expect(sumIncomeCents([salario, estorno])).toBe(500000n);
  });

  it('estorno abate a despesa em vez de somar entrada', () => {
    expect(sumExpenseCents([almoco])).toBe(12000n);
    expect(sumExpenseCents([almoco, estorno])).toBe(0n);
  });

  it('reembolso parcial abate só o que voltou', () => {
    const parcial: TxLike = { ...estorno, amountCents: 10000n };
    expect(sumExpenseCents([almoco, parcial])).toBe(2000n);
    expect(sumIncomeCents([almoco, parcial])).toBe(0n);
  });

  it('fluxo líquido do mês não é inflado pelo reembolso', () => {
    // Sem o tratamento, isto daria receita 512.000 e despesa 12.000.
    expect(netCashflowCents([salario, almoco, estorno])).toBe(500000n);
    expect(sumIncomeCents([salario, almoco, estorno])).toBe(500000n);
    expect(sumExpenseCents([salario, almoco, estorno])).toBe(0n);
  });

  it('por categoria: o gasto reembolsado deixa de pesar no orçamento', () => {
    const porCategoria = sumByCategory([salario, almoco, estorno]);
    expect(porCategoria.get('alimentacao')).toEqual({ expenseCents: 0n, incomeCents: 0n });
    expect(porCategoria.get('salario')).toEqual({ expenseCents: 0n, incomeCents: 500000n });
  });

  it('estorno de gasto sem categoria abate a bucket "sem categoria"', () => {
    const semCat: TxLike = { type: 'EXPENSE', amountCents: 5000n, accountId: 'acc-1' };
    const estornoSemCat: TxLike = {
      type: 'INCOME',
      amountCents: 5000n,
      accountId: 'acc-1',
      reimbursesTransactionId: 'tx-x',
    };
    const grouped = sumByCategory([semCat, estornoSemCat]);
    expect(grouped.get(null)).toEqual({ expenseCents: 0n, incomeCents: 0n });
  });

  it('previsto continua fora das somas mesmo sendo estorno', () => {
    expect(sumExpenseCents([{ ...estorno, status: 'FORECAST' }])).toBe(0n);
  });
});
