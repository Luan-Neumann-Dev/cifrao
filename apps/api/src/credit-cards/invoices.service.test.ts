import { describe, expect, it } from 'vitest';
import { InvoicesService } from './invoices.service';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * Regra 5.6: pagar fatura é TRANSFERÊNCIA, não despesa. O teste usa um Prisma
 * falso e verifica que o pagamento (a) cria uma TRANSFER e nunca uma EXPENSE,
 * (b) debita a conta de origem e (c) atualiza paidCents/status da fatura.
 */
function fakePrismaForPay(opts: { totalCents: bigint; paidCents: bigint }) {
  const created: Record<string, unknown>[] = [];
  const accountUpdates: { data: { balanceCents: { increment: bigint } } }[] = [];
  const invoiceUpdates: { data: { paidCents: bigint; status: string } }[] = [];

  const tx = {
    invoice: {
      findUnique: async () => ({
        id: 'inv1',
        referenceMonth: '2025-08',
        paidCents: opts.paidCents,
        closingDate: new Date('2025-07-28T23:59:59Z'),
        creditCard: { nickname: 'Roxinho' },
      }),
      update: async (args: { data: { paidCents: bigint; status: string } }) => {
        invoiceUpdates.push(args);
        return { id: 'inv1', ...args.data };
      },
    },
    account: {
      findUnique: async () => ({ id: 'acc1', balanceCents: 500000n }),
      update: async (args: { data: { balanceCents: { increment: bigint } } }) => {
        accountUpdates.push(args);
        return { id: 'acc1' };
      },
    },
    transaction: {
      aggregate: async () => ({ _sum: { amountCents: opts.totalCents } }),
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

  return { prisma, created, accountUpdates, invoiceUpdates };
}

describe('regra 5.6 — pagamento de fatura é transferência, não despesa', () => {
  it('pagamento total: cria TRANSFER (não EXPENSE), debita a conta e marca PAID', async () => {
    const { prisma, created, accountUpdates, invoiceUpdates } = fakePrismaForPay({
      totalCents: 30000n,
      paidCents: 0n,
    });
    const service = new InvoicesService(prisma);

    const res = await service.pay('inv1', { accountId: 'acc1', amountCents: 30000 });

    expect(created).toHaveLength(1);
    // NUNCA vira despesa — é uma transferência com invoiceId
    expect(created[0].type).toBe('TRANSFER');
    expect(created[0].type).not.toBe('EXPENSE');
    expect(created[0].invoiceId).toBe('inv1');
    expect(created[0].fromAccountId).toBe('acc1');
    expect(created[0].amountCents).toBe(30000n);

    // Conta debitada em 30000 (increment negativo)
    expect(accountUpdates).toHaveLength(1);
    expect(accountUpdates[0].data.balanceCents.increment).toBe(-30000n);

    // Fatura quitada
    expect(invoiceUpdates[0].data.paidCents).toBe(30000n);
    expect(invoiceUpdates[0].data.status).toBe('PAID');
    expect(res.remainingCents).toBe(0n);
  });

  it('pagamento parcial: marca PARTIAL e rola o restante', async () => {
    const { prisma, created, invoiceUpdates } = fakePrismaForPay({ totalCents: 30000n, paidCents: 0n });
    const service = new InvoicesService(prisma);

    const res = await service.pay('inv1', { accountId: 'acc1', amountCents: 10000 });

    expect(created[0].type).toBe('TRANSFER');
    expect(invoiceUpdates[0].data.paidCents).toBe(10000n);
    expect(invoiceUpdates[0].data.status).toBe('PARTIAL');
    expect(res.remainingCents).toBe(20000n);
  });

  it('recusa pagamento acima do restante', async () => {
    const { prisma } = fakePrismaForPay({ totalCents: 30000n, paidCents: 25000n });
    const service = new InvoicesService(prisma);
    await expect(service.pay('inv1', { accountId: 'acc1', amountCents: 10000 })).rejects.toThrow();
  });

  it('recusa pagamento de fatura já quitada', async () => {
    const { prisma } = fakePrismaForPay({ totalCents: 30000n, paidCents: 30000n });
    const service = new InvoicesService(prisma);
    await expect(service.pay('inv1', { accountId: 'acc1', amountCents: 1000 })).rejects.toThrow();
  });
});
