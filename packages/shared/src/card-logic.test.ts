import { describe, expect, it } from 'vitest';
import {
  classifyInvoicesForAvailability,
  clampDay,
  deriveInvoiceStatus,
  installmentDateParts,
  installmentWindows,
  invoiceWindowForPurchase,
  resolveClosingMonth,
  splitInstallments,
} from './card-logic';

describe('regra 5.3 — roteamento de compra para a fatura (corte inclusivo)', () => {
  // Cartão fecha dia 28, vence dia 5. Decisão: compra NO dia 28 entra na atual.
  const closingDay = 28;
  const dueDay = 5;

  it('compra antes do fechamento cai na fatura que fecha neste mês', () => {
    const w = invoiceWindowForPurchase({ year: 2025, month: 7, day: 27 }, closingDay, dueDay);
    expect(w.closing).toEqual({ year: 2025, month: 7, day: 28 });
    // vence dia 5 (<= 28) => mês seguinte; referenceMonth é o do vencimento
    expect(w.due).toEqual({ year: 2025, month: 8, day: 5 });
    expect(w.referenceMonth).toBe('2025-08');
  });

  it('compra EXATAMENTE no dia do fechamento ainda cai na fatura atual', () => {
    const w = invoiceWindowForPurchase({ year: 2025, month: 7, day: 28 }, closingDay, dueDay);
    expect(w.closing).toEqual({ year: 2025, month: 7, day: 28 });
    expect(w.referenceMonth).toBe('2025-08');
  });

  it('compra depois do fechamento cai na próxima fatura', () => {
    const w = invoiceWindowForPurchase({ year: 2025, month: 7, day: 29 }, closingDay, dueDay);
    expect(w.closing).toEqual({ year: 2025, month: 8, day: 28 });
    expect(w.referenceMonth).toBe('2025-09');
  });

  it('exemplo do CLAUDE.md: "fatura de agosto (fecha 28/07)"', () => {
    const w = invoiceWindowForPurchase({ year: 2025, month: 7, day: 15 }, 28, 5);
    expect(w.closing.month).toBe(7);
    expect(w.referenceMonth).toBe('2025-08');
  });

  it('vencimento no mesmo mês quando dueDay > closingDay', () => {
    const w = invoiceWindowForPurchase({ year: 2025, month: 3, day: 5 }, 10, 20);
    expect(w.closing).toEqual({ year: 2025, month: 3, day: 10 });
    expect(w.due).toEqual({ year: 2025, month: 3, day: 20 });
    expect(w.referenceMonth).toBe('2025-03');
  });

  it('fixa o dia de fechamento ao último dia do mês (31 em fevereiro)', () => {
    expect(clampDay(2025, 2, 31)).toBe(28);
    const closed = resolveClosingMonth({ year: 2025, month: 2, day: 28 }, 31);
    // dia 28 <= fechamento fixado (28) => fecha em fevereiro
    expect(closed).toEqual({ year: 2025, month: 2 });
  });
});

describe('regra 5.4 — parcelamento gera N faturas distintas e consecutivas', () => {
  it('6x cai em 6 faturas de meses consecutivos distintos', () => {
    const windows = installmentWindows({ year: 2025, month: 7, day: 15 }, 28, 5, 6);
    const refs = windows.map((w) => w.referenceMonth);
    expect(refs).toEqual(['2025-08', '2025-09', '2025-10', '2025-11', '2025-12', '2026-01']);
    expect(new Set(refs).size).toBe(6);
  });

  it('parcela i fica no seu próprio mês de competência', () => {
    const p = { year: 2025, month: 11, day: 20 };
    expect(installmentDateParts(p, 0)).toEqual({ year: 2025, month: 11, day: 20 });
    expect(installmentDateParts(p, 1)).toEqual({ year: 2025, month: 12, day: 20 });
    expect(installmentDateParts(p, 2)).toEqual({ year: 2026, month: 1, day: 20 });
  });

  it('divide o total exatamente, distribuindo o resto nas primeiras parcelas', () => {
    const parts = splitInstallments(10000n, 3);
    expect(parts).toEqual([3334n, 3333n, 3333n]);
    expect(parts.reduce((a, b) => a + b, 0n)).toBe(10000n);
  });

  it('divisão exata quando não há resto', () => {
    const parts = splitInstallments(12000n, 4);
    expect(parts).toEqual([3000n, 3000n, 3000n, 3000n]);
    expect(parts.reduce((a, b) => a + b, 0n)).toBe(12000n);
  });
});

describe('regra 5.5 — disponível de verdade', () => {
  const now = new Date('2025-08-15T12:00:00Z');
  const limit = 500000n;

  const openInvoice = { closingDate: new Date('2025-08-28T23:59:59Z'), totalCents: 30000n, paidCents: 0n };
  const closedUnpaid = { closingDate: new Date('2025-07-28T23:59:59Z'), totalCents: 50000n, paidCents: 20000n };
  const futureInstallment = { closingDate: new Date('2025-09-28T23:59:59Z'), totalCents: 15000n, paidCents: 0n };

  it('separa aberta, fechada não quitada e parcelas futuras', () => {
    const b = classifyInvoicesForAvailability([openInvoice, closedUnpaid, futureInstallment], limit, now);
    expect(b.openInvoiceCents).toBe(30000n);
    expect(b.closedUnpaidCents).toBe(30000n); // 50000 − 20000 pago
    expect(b.futureCommittedCents).toBe(15000n);
    expect(b.committedCents).toBe(75000n);
    expect(b.availableCents).toBe(425000n); // 500000 − 75000
  });

  it('sem faturas, disponível = limite', () => {
    expect(classifyInvoicesForAvailability([], limit, now).availableCents).toBe(500000n);
  });

  it('permite estouro (disponível negativo)', () => {
    const big = { closingDate: new Date('2025-08-28T23:59:59Z'), totalCents: 600000n, paidCents: 0n };
    expect(classifyInvoicesForAvailability([big], limit, now).availableCents).toBe(-100000n);
  });
});

describe('status derivado da fatura', () => {
  const closing = new Date('2025-08-28T23:59:59Z');
  it('OPEN antes do fechamento sem pagamento', () => {
    expect(deriveInvoiceStatus({ totalCents: 1000n, paidCents: 0n, closingDate: closing, now: new Date('2025-08-10T12:00:00Z') })).toBe('OPEN');
  });
  it('CLOSED depois do fechamento sem pagamento', () => {
    expect(deriveInvoiceStatus({ totalCents: 1000n, paidCents: 0n, closingDate: closing, now: new Date('2025-09-01T12:00:00Z') })).toBe('CLOSED');
  });
  it('PARTIAL com pagamento parcial', () => {
    expect(deriveInvoiceStatus({ totalCents: 1000n, paidCents: 400n, closingDate: closing, now: new Date('2025-09-01T12:00:00Z') })).toBe('PARTIAL');
  });
  it('PAID quando o pago cobre o total', () => {
    expect(deriveInvoiceStatus({ totalCents: 1000n, paidCents: 1000n, closingDate: closing, now: new Date('2025-09-01T12:00:00Z') })).toBe('PAID');
  });
});
