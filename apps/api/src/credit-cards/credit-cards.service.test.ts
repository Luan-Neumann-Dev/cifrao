import { describe, expect, it } from 'vitest';
import type { CreateCardPurchaseInput } from '@cifrao/shared';
import { CreditCardsService } from './credit-cards.service';
import type { PrismaService } from '../prisma/prisma.service';

/** Dono fixo dos testes: todo service agora recebe o userId. */
const USER = 'user-1';

/**
 * Testa a orquestração da compra parcelada (regra 5.4) com um Prisma falso em
 * memória — sem tocar no banco. A matemática de janelas/parcelas já é coberta
 * por packages/shared/card-logic.test.ts.
 */
function fakePrismaForPurchase(card: { closingDay: number; dueDay: number }) {
  const created: Record<string, unknown>[] = [];
  const purchases: Record<string, unknown>[] = [];
  const invoicesByRef = new Map<string, { id: string; referenceMonth: string }>();

  const tx = {
    creditCard: { findFirst: async () => ({ id: 'card1', ...card }) },
    category: { count: async () => 1 },
    tag: { count: async () => 0 },
    purchase: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const p = { id: 'pur1', ...data };
        purchases.push(p);
        return p;
      },
    },
    invoice: {
      upsert: async ({
        where,
        create,
      }: {
        where: { creditCardId_referenceMonth: { referenceMonth: string } };
        create: Record<string, unknown>;
      }) => {
        const ref = where.creditCardId_referenceMonth.referenceMonth;
        let inv = invoicesByRef.get(ref);
        if (!inv) {
          inv = { id: `inv-${ref}`, referenceMonth: ref, ...create } as { id: string; referenceMonth: string };
          invoicesByRef.set(ref, inv);
        }
        return inv;
      },
    },
    transaction: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `tx${created.length}`, ...data };
        created.push(row);
        return row;
      },
    },
  };

  const prisma = {
    client: { $transaction: async (cb: (t: typeof tx) => unknown) => cb(tx) },
  } as unknown as PrismaService;

  return { prisma, created, purchases };
}

const basePurchase = (over: Partial<CreateCardPurchaseInput>): CreateCardPurchaseInput => ({
  amountCents: 60000,
  date: new Date('2025-07-15T12:00:00Z'),
  description: 'Geladeira',
  installments: 1,
  status: 'CLEARED',
  isReimbursable: false,
  ...over,
});

describe('regra 5.4 — parcelamento gera 1 Purchase pai e N Transaction filhas', () => {
  it('6x cai em 6 faturas distintas, somando exatamente o total', async () => {
    const { prisma, created, purchases } = fakePrismaForPurchase({ closingDay: 28, dueDay: 5 });
    const service = new CreditCardsService(prisma);

    const res = await service.createPurchase(USER, 'card1', basePurchase({ installments: 6 }));

    expect(res.installments).toBe(6);
    expect(created).toHaveLength(6);

    // 6 faturas distintas e consecutivas (fecha 28, vence 5 -> referência = vencimento)
    const invoiceIds = created.map((r) => r.invoiceId);
    expect(new Set(invoiceIds).size).toBe(6);
    expect(res.invoiceIds).toEqual([
      'inv-2025-08',
      'inv-2025-09',
      'inv-2025-10',
      'inv-2025-11',
      'inv-2025-12',
      'inv-2026-01',
    ]);

    // Parcelas numeradas 1..6, todas EXPENSE, todas apontando para o mesmo Purchase pai
    expect(created.map((r) => r.installmentNumber)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(created.every((r) => r.installmentTotal === 6)).toBe(true);
    expect(created.every((r) => r.type === 'EXPENSE')).toBe(true);
    expect(created.every((r) => r.purchaseId === 'pur1')).toBe(true);
    expect(created.every((r) => r.creditCardId === 'card1')).toBe(true);
    // Compra de cartão NÃO movimenta conta (sem accountId)
    expect(created.every((r) => r.accountId === undefined)).toBe(true);

    // Soma das parcelas = total
    const sum = created.reduce((acc, r) => acc + (r.amountCents as bigint), 0n);
    expect(sum).toBe(60000n);

    // Purchase pai único com o total e o nº de parcelas
    expect(purchases).toHaveLength(1);
    expect(purchases[0].totalCents).toBe(60000n);
    expect(purchases[0].installmentTotal).toBe(6);
  });

  it('compra à vista (1x) não cria Purchase pai nem numeração de parcela', async () => {
    const { prisma, created, purchases } = fakePrismaForPurchase({ closingDay: 28, dueDay: 5 });
    const service = new CreditCardsService(prisma);

    await service.createPurchase(USER, 'card1', basePurchase({ amountCents: 5000, installments: 1 }));

    expect(created).toHaveLength(1);
    expect(purchases).toHaveLength(0);
    expect(created[0].installmentNumber).toBeUndefined();
    expect(created[0].purchaseId).toBeUndefined();
    expect(created[0].invoiceId).toBe('inv-2025-08');
    expect(created[0].amountCents).toBe(5000n);
  });
});
