import { describe, expect, it } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service';
import { CategorySuggestionService } from './category-suggestion.service';

interface Rule {
  id: string;
  pattern: string;
  categoryId: string;
  minCents?: bigint | null;
  maxCents?: bigint | null;
  active?: boolean;
  appliedCount?: number;
  /** Dono da regra; sem informar, é o usuário do teste. */
  userId?: string;
}

interface HistoryRow {
  description: string;
  categoryId: string;
  userId?: string;
}

const DONO = 'u1';

/** Filtra por dono como o banco faria com o `where: { userId }`. */
function fakePrisma(rules: Rule[], transactions: HistoryRow[]) {
  const doDono = <T extends { userId?: string }>(rows: T[], userId: string) =>
    rows.filter((r) => (r.userId ?? DONO) === userId);
  return {
    client: {
      categoryRule: {
        findMany: async ({ where }: { where: { userId: string } }) => doDono(rules, where.userId),
      },
      transaction: {
        findMany: async ({ where }: { where: { userId: string } }) =>
          doDono(transactions, where.userId),
      },
    },
  } as unknown as PrismaService;
}

describe('sugestão de categoria', () => {
  it('regra aprendida vence e vem com certeza total', async () => {
    const service = new CategorySuggestionService(
      fakePrisma(
        [{ id: 'r1', pattern: 'ifood', categoryId: 'delivery', active: true }],
        [{ description: 'iFood pedido', categoryId: 'alimentacao' }],
      ),
    );

    const s = await service.suggest(DONO, { description: 'IFOOD *4821' });

    expect(s?.source).toBe('rule');
    expect(s?.categoryId).toBe('delivery');
    expect(s?.ruleId).toBe('r1');
    expect(s?.confidence).toBe(1);
  });

  it('sem regra, aprende do histórico de descrições parecidas', async () => {
    const service = new CategorySuggestionService(
      fakePrisma(
        [],
        [
          { description: 'Mercado Extra', categoryId: 'mercado' },
          { description: 'Mercado Extra', categoryId: 'mercado' },
          { description: 'Posto Shell', categoryId: 'transporte' },
        ],
      ),
    );

    const s = await service.suggest(DONO, { description: 'Mercado Extra' });

    expect(s?.source).toBe('history');
    expect(s?.categoryId).toBe('mercado');
  });

  it('descrição sem nada parecido não inventa sugestão', async () => {
    const service = new CategorySuggestionService(
      fakePrisma([], [{ description: 'Posto Shell', categoryId: 'transporte' }]),
    );
    expect(await service.suggest(DONO, { description: 'Dentista Dra. Ana' })).toBeNull();
  });

  it('regra fora da faixa de valor não casa, e cai no histórico', async () => {
    const service = new CategorySuggestionService(
      fakePrisma(
        [
          {
            id: 'r1',
            pattern: 'uber',
            categoryId: 'transporte',
            minCents: 50000n,
            active: true,
          },
        ],
        [{ description: 'Uber viagem', categoryId: 'mobilidade' }],
      ),
    );

    const s = await service.suggest(DONO, { description: 'Uber viagem', amountCents: 2240 });

    expect(s?.source).toBe('history');
    expect(s?.categoryId).toBe('mobilidade');
  });

  it('regra desativada é ignorada', async () => {
    const service = new CategorySuggestionService(
      fakePrisma([{ id: 'r1', pattern: 'ifood', categoryId: 'delivery', active: false }], []),
    );
    expect(await service.suggest(DONO, { description: 'iFood' })).toBeNull();
  });

  it('regra e histórico de outro usuário não sugerem nada', async () => {
    const service = new CategorySuggestionService(
      fakePrisma(
        [{ id: 'r1', pattern: 'ifood', categoryId: 'delivery', active: true, userId: 'outro' }],
        [{ description: 'iFood pedido', categoryId: 'alimentacao', userId: 'outro' }],
      ),
    );
    expect(await service.suggest(DONO, { description: 'iFood pedido' })).toBeNull();
  });
});
