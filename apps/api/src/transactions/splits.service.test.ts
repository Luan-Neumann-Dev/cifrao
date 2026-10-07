import { describe, expect, it } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service';
import { SplitsService } from './splits.service';

/**
 * Divisão entre categorias. O que importa é a soma fechar: um centavo sobrando
 * aqui some do relatório por categoria sem ninguém perceber.
 */
/** O lançamento falso pertence sempre a este usuário. */
const DONO = 'u1';

function fakePrisma(transaction: { type: string; amountCents: bigint } | null) {
  const created: { data: unknown[] }[] = [];
  const deleted: unknown[] = [];
  const updates: { data: { categoryId: string } }[] = [];
  let splits: unknown[] = [];

  const tx = {
    transaction: {
      // Igual ao banco: id de outro dono não é encontrado.
      findFirst: async ({ where }: { where: { userId: string } }) =>
        transaction && where.userId === DONO ? { id: 't1', ...transaction } : null,
      update: async (args: { data: { categoryId: string } }) => {
        updates.push(args);
        return { id: 't1' };
      },
    },
    category: {
      count: async ({ where }: { where: { id: { in: string[] } } }) =>
        // "fantasma" é a única categoria que não existe neste banco falso.
        where.id.in.filter((id) => id !== 'fantasma').length,
    },
    transactionSplit: {
      deleteMany: async (args: unknown) => {
        deleted.push(args);
        splits = [];
        return { count: 0 };
      },
      createMany: async (args: { data: unknown[] }) => {
        created.push(args);
        splits = args.data;
        return { count: args.data.length };
      },
      findMany: async () => splits,
    },
  };

  const prisma = {
    client: {
      $transaction: async (cb: (t: typeof tx) => unknown) => cb(tx),
      transaction: { findFirst: tx.transaction.findFirst },
      transactionSplit: { findMany: tx.transactionSplit.findMany },
    },
  } as unknown as PrismaService;

  return { prisma, created, deleted, updates };
}

describe('divisão de lançamento entre categorias', () => {
  it('grava quando a soma bate com o valor', async () => {
    const { prisma, created, updates } = fakePrisma({ type: 'EXPENSE', amountCents: 10000n });
    const service = new SplitsService(prisma);

    await service.set(DONO, 't1', {
      splits: [
        { categoryId: 'mercado', amountCents: 7000 },
        { categoryId: 'higiene', amountCents: 3000 },
      ],
    });

    expect(created).toHaveLength(1);
    expect(created[0].data).toHaveLength(2);
    // A categoria única passa a ser a da maior parte.
    expect(updates[0].data.categoryId).toBe('mercado');
  });

  it('recusa quando falta um centavo', async () => {
    const { prisma } = fakePrisma({ type: 'EXPENSE', amountCents: 10000n });
    const service = new SplitsService(prisma);

    await expect(
      service.set(DONO, 't1', {
        splits: [
          { categoryId: 'mercado', amountCents: 7000 },
          { categoryId: 'higiene', amountCents: 2999 },
        ],
      }),
    ).rejects.toThrow(/soma das partes/);
  });

  it('recusa quando sobra um centavo', async () => {
    const { prisma } = fakePrisma({ type: 'EXPENSE', amountCents: 10000n });
    const service = new SplitsService(prisma);

    await expect(
      service.set(DONO, 't1', {
        splits: [
          { categoryId: 'mercado', amountCents: 7000 },
          { categoryId: 'higiene', amountCents: 3001 },
        ],
      }),
    ).rejects.toThrow(/soma das partes/);
  });

  it('lista vazia desfaz a divisão sem exigir soma', async () => {
    const { prisma, deleted, created } = fakePrisma({ type: 'EXPENSE', amountCents: 10000n });
    const service = new SplitsService(prisma);

    await service.set(DONO, 't1', { splits: [] });

    expect(deleted).toHaveLength(1);
    expect(created).toHaveLength(0);
  });

  it('recusa divisão com uma categoria só — isso não é divisão', async () => {
    const { prisma } = fakePrisma({ type: 'EXPENSE', amountCents: 10000n });
    const service = new SplitsService(prisma);
    await expect(
      service.set(DONO, 't1', { splits: [{ categoryId: 'mercado', amountCents: 10000 }] }),
    ).rejects.toThrow(/pelo menos duas/);
  });

  it('recusa categoria repetida — as duas partes deviam ser uma', async () => {
    const { prisma } = fakePrisma({ type: 'EXPENSE', amountCents: 10000n });
    const service = new SplitsService(prisma);
    await expect(
      service.set(DONO, 't1', {
        splits: [
          { categoryId: 'mercado', amountCents: 5000 },
          { categoryId: 'mercado', amountCents: 5000 },
        ],
      }),
    ).rejects.toThrow(/repetida/);
  });

  it('recusa categoria inexistente', async () => {
    const { prisma } = fakePrisma({ type: 'EXPENSE', amountCents: 10000n });
    const service = new SplitsService(prisma);
    await expect(
      service.set(DONO, 't1', {
        splits: [
          { categoryId: 'mercado', amountCents: 5000 },
          { categoryId: 'fantasma', amountCents: 5000 },
        ],
      }),
    ).rejects.toThrow(/não encontrada/);
  });

  it('transferência não se divide (regra 5.7)', async () => {
    const { prisma } = fakePrisma({ type: 'TRANSFER', amountCents: 10000n });
    const service = new SplitsService(prisma);
    await expect(
      service.set(DONO, 't1', {
        splits: [
          { categoryId: 'a', amountCents: 5000 },
          { categoryId: 'b', amountCents: 5000 },
        ],
      }),
    ).rejects.toThrow(/Transferência/);
  });

  it('lançamento inexistente vira 404', async () => {
    const { prisma } = fakePrisma(null);
    const service = new SplitsService(prisma);
    await expect(service.set(DONO, 't1', { splits: [] })).rejects.toThrow('Lançamento não encontrado');
  });

  it('lançamento de outro usuário vira 404 e nada é gravado', async () => {
    const { prisma, created, deleted, updates } = fakePrisma({ type: 'EXPENSE', amountCents: 10000n });
    const service = new SplitsService(prisma);

    await expect(service.get('intruso', 't1')).rejects.toThrow('Lançamento não encontrado');
    await expect(
      service.set('intruso', 't1', {
        splits: [
          { categoryId: 'mercado', amountCents: 5000 },
          { categoryId: 'higiene', amountCents: 5000 },
        ],
      }),
    ).rejects.toThrow('Lançamento não encontrado');
    // Nem o "desfazer divisão" (lista vazia) pode apagar a divisão alheia.
    await expect(service.set('intruso', 't1', { splits: [] })).rejects.toThrow(
      'Lançamento não encontrado',
    );
    expect(created).toHaveLength(0);
    expect(deleted).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });
});
