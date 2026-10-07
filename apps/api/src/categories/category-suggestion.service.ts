import { Injectable } from '@nestjs/common';
import {
  type SuggestCategoryQuery,
  descriptionSimilarity,
  matchCategoryRule,
  normalizeDescription,
} from '@cifrao/shared';
import { PrismaService } from '../prisma/prisma.service';

/** Abaixo disso duas descrições são coisas diferentes, não variações. */
const SIMILARITY_FLOOR = 0.6;
/** Quantos lançamentos recentes olhar no fallback por histórico. */
const HISTORY_WINDOW = 400;

export interface CategorySuggestion {
  categoryId: string;
  /** De onde veio: regra aprendida (5.12) ou o próprio histórico. */
  source: 'rule' | 'history';
  /** Regra que casou, quando a origem foi uma regra. */
  ruleId?: string;
  /** 0–1. Regra é certeza; histórico é o quanto as descrições se parecem. */
  confidence: number;
}

@Injectable()
export class CategorySuggestionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Sugere a categoria do que está sendo digitado. Primeiro tenta as regras
   * aprendidas na importação (regra 5.12) — elas são escolha explícita do
   * usuário. Sem regra, olha o histórico: se "iFood *4821" já foi categorizado
   * cinco vezes como Delivery, a sexta provavelmente também é.
   */
  async suggest(query: SuggestCategoryQuery): Promise<CategorySuggestion | null> {
    const amountCents = BigInt(query.amountCents ?? 0);

    const rules = await this.prisma.client.categoryRule.findMany({
      where: { active: true },
      select: {
        id: true,
        pattern: true,
        minCents: true,
        maxCents: true,
        categoryId: true,
        active: true,
        appliedCount: true,
      },
    });
    const match = matchCategoryRule(rules, { description: query.description, amountCents });
    if (match) {
      return {
        categoryId: match.categoryId,
        source: 'rule',
        ruleId: match.ruleId,
        confidence: 1,
      };
    }

    return this.fromHistory(query.description);
  }

  /** Categoria mais usada entre lançamentos de descrição parecida. */
  private async fromHistory(description: string): Promise<CategorySuggestion | null> {
    if (!normalizeDescription(description)) return null;

    const recent = await this.prisma.client.transaction.findMany({
      where: { categoryId: { not: null }, type: { in: ['EXPENSE', 'INCOME'] } },
      orderBy: { date: 'desc' },
      take: HISTORY_WINDOW,
      select: { description: true, categoryId: true },
    });

    // Soma a semelhança por categoria: cinco acertos medianos valem mais que um
    // acerto isolado, e um acerto exato pesa mais que cinco quase-acertos.
    const score = new Map<string, { total: number; best: number }>();
    for (const tx of recent) {
      if (!tx.categoryId) continue;
      const similarity = descriptionSimilarity(description, tx.description);
      if (similarity < SIMILARITY_FLOOR) continue;
      const current = score.get(tx.categoryId) ?? { total: 0, best: 0 };
      score.set(tx.categoryId, {
        total: current.total + similarity,
        best: Math.max(current.best, similarity),
      });
    }
    if (score.size === 0) return null;

    const [categoryId, winner] = [...score.entries()].sort((a, b) => b[1].total - a[1].total)[0];
    return { categoryId, source: 'history', confidence: winner.best };
  }
}
