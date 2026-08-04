import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { CategoriesService } from './categories.service';

/**
 * Mesclagem de categorias (Fase 9). O que precisa estar provado aqui é a decisão
 * do dono — **tudo migra e os limites de orçamento somam** — e as duas chaves
 * únicas que essa migração pode violar: `Budget(categoryId, month)` e
 * `CategoryRule(pattern, categoryId)`.
 */

interface Fixture {
  categories: Record<string, { id: string; name: string; parentId: string | null }>;
  budgets: { id: string; categoryId: string; month: string; limitCents: bigint }[];
  rules: { id: string; categoryId: string; pattern: string; appliedCount: number }[];
}

function makePrisma(fixture: Fixture) {
  const updateMany = () => vi.fn(async () => ({ count: 1 }));

  const tx = {
    transaction: { updateMany: updateMany() },
    transactionSplit: { updateMany: updateMany() },
    purchase: { updateMany: updateMany() },
    recurringRule: { updateMany: updateMany() },
    importRow: { updateMany: updateMany() },
    category: {
      updateMany: updateMany(),
      delete: vi.fn(async () => ({})),
    },
    budget: {
      findMany: vi.fn(async (args: { where: { categoryId: string } }) =>
        fixture.budgets.filter((b) => b.categoryId === args.where.categoryId),
      ),
      update: vi.fn(async () => ({})),
      delete: vi.fn(async () => ({})),
    },
    categoryRule: {
      findMany: vi.fn(async (args: { where: { categoryId: string } }) =>
        fixture.rules.filter((r) => r.categoryId === args.where.categoryId),
      ),
      update: vi.fn(async () => ({})),
      delete: vi.fn(async () => ({})),
    },
  };

  const client = {
    category: {
      findUnique: vi.fn(async (args: { where: { id: string } }) => fixture.categories[args.where.id] ?? null),
    },
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };

  return { service: new CategoriesService({ client } as unknown as PrismaService), client, tx };
}

const base: Fixture = {
  categories: {
    origem: { id: 'origem', name: 'Supermercado', parentId: null },
    destino: { id: 'destino', name: 'Mercado', parentId: null },
  },
  budgets: [],
  rules: [],
};

describe('mesclar categorias', () => {
  it('migra lançamentos, divisões, compras, recorrências e linhas de importação', async () => {
    const { service, tx } = makePrisma(base);
    const result = await service.merge('origem', 'destino');

    for (const tabela of ['transaction', 'transactionSplit', 'purchase', 'recurringRule'] as const) {
      expect(tx[tabela].updateMany).toHaveBeenCalledWith({
        where: { categoryId: 'origem' },
        data: { categoryId: 'destino' },
      });
    }
    // A linha em revisão migra tanto a categoria escolhida quanto a sugerida.
    expect(tx.importRow.updateMany).toHaveBeenCalledTimes(2);
    expect(result.merged).toEqual({ from: 'Supermercado', into: 'Mercado' });
  });

  it('apaga a categoria de origem no fim', async () => {
    const { service, tx } = makePrisma(base);
    await service.merge('origem', 'destino');
    expect(tx.category.delete).toHaveBeenCalledWith({ where: { id: 'origem' } });
  });

  it('repende a subcategoria da origem no destino em vez de deixá-la órfã', async () => {
    const { service, tx } = makePrisma(base);
    await service.merge('origem', 'destino');
    expect(tx.category.updateMany).toHaveBeenCalledWith({
      where: { parentId: 'origem' },
      data: { parentId: 'destino' },
    });
  });

  it('roda tudo numa transação — ou migra inteiro, ou nada', async () => {
    const { service, client } = makePrisma(base);
    await service.merge('origem', 'destino');
    expect(client.$transaction).toHaveBeenCalledTimes(1);
  });

  describe('orçamento (a decisão do dono)', () => {
    it('SOMA os limites quando as duas tinham orçamento no mesmo mês', async () => {
      const { service, tx } = makePrisma({
        ...base,
        budgets: [
          { id: 'b-origem', categoryId: 'origem', month: '2026-08', limitCents: 20_000n },
          { id: 'b-destino', categoryId: 'destino', month: '2026-08', limitCents: 30_000n },
        ],
      });

      const result = await service.merge('origem', 'destino');

      expect(tx.budget.update).toHaveBeenCalledWith({
        where: { id: 'b-destino' },
        data: { limitCents: 50_000n },
      });
      expect(tx.budget.delete).toHaveBeenCalledWith({ where: { id: 'b-origem' } });
      expect(result.budgetsSomados).toEqual([{ month: '2026-08', limitCents: 50_000n }]);
    });

    it('só muda de dono o orçamento de mês em que o destino não tinha limite', async () => {
      const { service, tx } = makePrisma({
        ...base,
        budgets: [{ id: 'b-origem', categoryId: 'origem', month: '2026-07', limitCents: 20_000n }],
      });

      const result = await service.merge('origem', 'destino');

      expect(tx.budget.update).toHaveBeenCalledWith({
        where: { id: 'b-origem' },
        data: { categoryId: 'destino' },
      });
      expect(tx.budget.delete).not.toHaveBeenCalled();
      expect(result.moved.budgets).toBe(1);
      expect(result.budgetsSomados).toEqual([]);
    });
  });

  describe('regra de categoria', () => {
    it('unifica padrão repetido somando quantas vezes já foi aplicado', async () => {
      const { service, tx } = makePrisma({
        ...base,
        rules: [
          { id: 'r-origem', categoryId: 'origem', pattern: 'PAO DE ACUCAR', appliedCount: 4 },
          { id: 'r-destino', categoryId: 'destino', pattern: 'PAO DE ACUCAR', appliedCount: 7 },
        ],
      });

      const result = await service.merge('origem', 'destino');

      expect(tx.categoryRule.update).toHaveBeenCalledWith({
        where: { id: 'r-destino' },
        data: { appliedCount: 11 },
      });
      expect(tx.categoryRule.delete).toHaveBeenCalledWith({ where: { id: 'r-origem' } });
      expect(result.regrasUnificadas).toBe(1);
    });

    it('padrão que só a origem tinha apenas troca de categoria', async () => {
      const { service, tx } = makePrisma({
        ...base,
        rules: [{ id: 'r-origem', categoryId: 'origem', pattern: 'ZAFFARI', appliedCount: 2 }],
      });

      const result = await service.merge('origem', 'destino');

      expect(tx.categoryRule.update).toHaveBeenCalledWith({
        where: { id: 'r-origem' },
        data: { categoryId: 'destino' },
      });
      expect(result.moved.categoryRules).toBe(1);
    });
  });

  describe('recusas', () => {
    it('não mescla uma categoria nela mesma', async () => {
      const { service } = makePrisma(base);
      await expect(service.merge('origem', 'origem')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('reclama de categoria inexistente em vez de apagar a errada', async () => {
      const { service } = makePrisma(base);
      await expect(service.merge('origem', 'fantasma')).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.merge('fantasma', 'destino')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('não mescla numa subcategoria da própria origem (viraria ciclo)', async () => {
      const { service } = makePrisma({
        ...base,
        categories: {
          origem: { id: 'origem', name: 'Casa', parentId: null },
          destino: { id: 'destino', name: 'Casa > Luz', parentId: 'origem' },
        },
      });
      await expect(service.merge('origem', 'destino')).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
