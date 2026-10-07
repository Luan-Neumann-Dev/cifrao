import { describe, expect, it } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service';
import { MonthReviewService } from './month-review.service';

/**
 * Isolamento por usuário: a retrospectiva soma entradas, saídas, orçamento e
 * médias. Uma consulta sem dono aqui não quebra nada visível — só mistura o
 * dinheiro de todo mundo no número de cada um. Por isso o teste registra o
 * `where` de TODA consulta e exige o dono em cada uma.
 */
function spyPrisma() {
  const calls: { op: string; where: unknown }[] = [];
  const record =
    (op: string, result: unknown) =>
    async (args: { where?: unknown }) => {
      calls.push({ op, where: args.where });
      return result;
    };
  const prisma = {
    client: {
      transaction: {
        groupBy: record('transaction.groupBy', []),
        findMany: record('transaction.findMany', []),
        aggregate: record('transaction.aggregate', { _sum: { amountCents: null } }),
      },
      budget: { findMany: record('budget.findMany', []) },
      category: { findMany: record('category.findMany', []) },
    },
  } as unknown as PrismaService;
  return { prisma, calls };
}

describe('retrospectiva do mês — isolamento por usuário', () => {
  it('toda consulta carrega o dono que pediu', async () => {
    const { prisma, calls } = spyPrisma();
    const service = new MonthReviewService(prisma);

    const res = await service.build('u1', '2026-08');

    expect(res.empty).toBe(true);
    // Mês + janela de comparação: receita, gasto e estornos de cada um, mais
    // orçamento e categorias.
    expect(calls.length).toBeGreaterThanOrEqual(8);
    for (const call of calls) {
      expect(JSON.stringify(call.where), call.op).toContain('"userId":"u1"');
    }
  });

  it('categorias: as do usuário e as universais, nunca as de outro', async () => {
    const { prisma, calls } = spyPrisma();
    await new MonthReviewService(prisma).build('u1', '2026-08');

    const category = calls.find((c) => c.op === 'category.findMany');
    expect(category?.where).toEqual({ OR: [{ userId: 'u1' }, { userId: null }] });
  });
});
