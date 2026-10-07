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
}

function fakePrisma(rules: Rule[], transactions: { description: string; categoryId: string }[]) {
  return {
    client: {
      categoryRule: { findMany: async () => rules },
      transaction: { findMany: async () => transactions },
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

    const s = await service.suggest({ description: 'IFOOD *4821' });

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

    const s = await service.suggest({ description: 'Mercado Extra' });

    expect(s?.source).toBe('history');
    expect(s?.categoryId).toBe('mercado');
  });

  it('descrição sem nada parecido não inventa sugestão', async () => {
    const service = new CategorySuggestionService(
      fakePrisma([], [{ description: 'Posto Shell', categoryId: 'transporte' }]),
    );
    expect(await service.suggest({ description: 'Dentista Dra. Ana' })).toBeNull();
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

    const s = await service.suggest({ description: 'Uber viagem', amountCents: 2240 });

    expect(s?.source).toBe('history');
    expect(s?.categoryId).toBe('mobilidade');
  });

  it('regra desativada é ignorada', async () => {
    const service = new CategorySuggestionService(
      fakePrisma([{ id: 'r1', pattern: 'ifood', categoryId: 'delivery', active: false }], []),
    );
    expect(await service.suggest({ description: 'iFood' })).toBeNull();
  });
});
