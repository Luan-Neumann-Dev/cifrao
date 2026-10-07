import { describe, expect, it } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service';
import { PurchasesService } from './purchases.service';

/**
 * Regra 5.4: a compra parcelada é uma Purchase pai com N filhas, cada uma em uma
 * fatura diferente. O cronograma é o que a tela do cartão abre ao clicar em
 * "3/6" — precisa listar as seis, na ordem, com a fatura de cada uma.
 */
/** A compra falsa pertence sempre a este usuário. */
const DONO = 'u1';

function fakePrisma(purchase: unknown): PrismaService {
  return {
    client: {
      purchase: {
        // Igual ao banco: id de outro dono não é encontrado.
        findFirst: async ({ where }: { where: { userId: string } }) =>
          where.userId === DONO ? purchase : null,
      },
    },
  } as unknown as PrismaService;
}

function parcela(n: number, month: string, paidCents = 0n) {
  return {
    id: `tx${n}`,
    amountCents: 41658n,
    date: new Date(`2026-0${n}-09T12:00:00Z`),
    status: 'CLEARED',
    installmentNumber: n,
    invoiceId: `inv-${month}`,
    invoice: {
      id: `inv-${month}`,
      referenceMonth: month,
      dueDate: new Date(`${month}-05T12:00:00Z`),
      paidCents,
    },
  };
}

describe('cronograma da compra parcelada (regra 5.4)', () => {
  it('devolve uma parcela por fatura, na ordem, com o mês de referência', async () => {
    const service = new PurchasesService(
      fakePrisma({
        id: 'p1',
        description: 'Notebook Dell',
        totalCents: 249948n,
        installmentTotal: 6,
        purchaseDate: new Date('2026-01-09T12:00:00Z'),
        category: { id: 'c1', name: 'Eletrônicos', color: '#0EA5E9', icon: 'chip' },
        transactions: [
          parcela(1, '2026-02', 41658n),
          parcela(2, '2026-03'),
          parcela(3, '2026-04'),
          parcela(4, '2026-05'),
          parcela(5, '2026-06'),
          parcela(6, '2026-07'),
        ],
      }),
    );

    const res = await service.get(DONO, 'p1');

    expect(res.installmentTotal).toBe(6);
    expect(res.installments).toHaveLength(6);
    expect(res.installments.map((i) => i.installmentNumber)).toEqual([1, 2, 3, 4, 5, 6]);
    // Cada parcela em uma fatura distinta — o coração da regra 5.4.
    expect(new Set(res.installments.map((i) => i.invoiceId)).size).toBe(6);
    expect(res.installments[0].referenceMonth).toBe('2026-02');
    expect(res.installments[5].referenceMonth).toBe('2026-07');
  });

  it('marca a parcela cuja fatura já foi paga', async () => {
    const service = new PurchasesService(
      fakePrisma({
        id: 'p1',
        description: 'Notebook Dell',
        totalCents: 83316n,
        installmentTotal: 2,
        purchaseDate: new Date('2026-01-09T12:00:00Z'),
        category: null,
        transactions: [parcela(1, '2026-02', 41658n), parcela(2, '2026-03')],
      }),
    );

    const res = await service.get(DONO, 'p1');

    expect(res.installments[0].invoicePaid).toBe(true);
    expect(res.installments[1].invoicePaid).toBe(false);
  });

  it('compra inexistente vira 404, não resposta vazia', async () => {
    const service = new PurchasesService(fakePrisma(null));
    await expect(service.get(DONO, 'nao-existe')).rejects.toThrow('Compra não encontrada');
  });

  it('compra de outro usuário vira 404 — o cronograma não vaza', async () => {
    const service = new PurchasesService(
      fakePrisma({ id: 'p1', installmentTotal: 1, category: null, transactions: [parcela(1, '2026-02')] }),
    );
    await expect(service.get('intruso', 'p1')).rejects.toThrow('Compra não encontrada');
  });
});
