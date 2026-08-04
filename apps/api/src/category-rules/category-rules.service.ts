import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  type CreateCategoryRuleInput,
  type UpdateCategoryRuleInput,
  matchCategoryRule,
  normalizeDescription,
} from '@cifrao/shared';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Regra 5.12 — regras aprendidas de categorização. O padrão é guardado já
 * normalizado, do mesmo jeito que o motor compara; assim "IFD*IFOOD" e
 * "ifd ifood" nunca viram duas regras diferentes.
 */
@Injectable()
export class CategoryRulesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.client.categoryRule.findMany({
      orderBy: [{ active: 'desc' }, { appliedCount: 'desc' }, { createdAt: 'desc' }],
      include: { category: { select: { id: true, name: true, color: true, icon: true } } },
    });
  }

  async create(input: CreateCategoryRuleInput) {
    const pattern = normalizeDescription(input.pattern);
    if (!pattern) throw new BadRequestException('Padrão vazio depois de normalizado.');
    await this.ensureCategory(input.categoryId);

    return this.prisma.client.categoryRule.upsert({
      where: { pattern_categoryId: { pattern, categoryId: input.categoryId } },
      create: {
        pattern,
        categoryId: input.categoryId,
        minCents: input.minCents == null ? null : BigInt(input.minCents),
        maxCents: input.maxCents == null ? null : BigInt(input.maxCents),
      },
      update: {
        active: true,
        minCents: input.minCents == null ? null : BigInt(input.minCents),
        maxCents: input.maxCents == null ? null : BigInt(input.maxCents),
      },
      include: { category: { select: { id: true, name: true, color: true, icon: true } } },
    });
  }

  async update(id: string, input: UpdateCategoryRuleInput) {
    await this.get(id);
    if (input.categoryId) await this.ensureCategory(input.categoryId);

    return this.prisma.client.categoryRule.update({
      where: { id },
      data: {
        ...(input.pattern !== undefined ? { pattern: normalizeDescription(input.pattern) } : {}),
        ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
        ...(input.minCents !== undefined
          ? { minCents: input.minCents == null ? null : BigInt(input.minCents) }
          : {}),
        ...(input.maxCents !== undefined
          ? { maxCents: input.maxCents == null ? null : BigInt(input.maxCents) }
          : {}),
      },
      include: { category: { select: { id: true, name: true, color: true, icon: true } } },
    });
  }

  async remove(id: string) {
    await this.get(id);
    await this.prisma.client.categoryRule.delete({ where: { id } });
    return { ok: true };
  }

  /** Testa as regras contra uma descrição — o "por que veio assim" da UI. */
  async test(description: string, amountCents: number) {
    const rules = await this.prisma.client.categoryRule.findMany({ where: { active: true } });
    const match = matchCategoryRule(rules, {
      description,
      amountCents: BigInt(Math.round(amountCents || 0)),
    });
    if (!match) return { matched: null };

    const category = await this.prisma.client.category.findUnique({
      where: { id: match.categoryId },
      select: { id: true, name: true, color: true, icon: true },
    });
    return { matched: { ruleId: match.ruleId, category } };
  }

  private async get(id: string) {
    const rule = await this.prisma.client.categoryRule.findUnique({ where: { id } });
    if (!rule) throw new NotFoundException('Regra não encontrada');
    return rule;
  }

  private async ensureCategory(id: string) {
    const category = await this.prisma.client.category.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Categoria não encontrada');
  }
}
