import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@cifrao/db';
import type { CreateCategoryInput, UpdateCategoryInput } from '@cifrao/shared';
import { PrismaService } from '../prisma/prisma.service';

type PrismaTx = Prisma.TransactionClient;

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.client.category.findMany({ orderBy: [{ name: 'asc' }] });
  }

  /**
   * Categorias com quanto cada uma é usada — é o que a tela de gestão precisa
   * para dizer "essa dá para apagar" ou "essa só dá para mesclar". Contagem por
   * `groupBy` no banco (armadilha #5), nunca contando linha no Node.
   */
  async usage() {
    const [categories, transactions, budgets, rules, recurring] = await Promise.all([
      this.prisma.client.category.findMany({ orderBy: [{ name: 'asc' }] }),
      this.prisma.client.transaction.groupBy({
        by: ['categoryId'],
        where: { categoryId: { not: null } },
        _count: { _all: true },
      }),
      this.prisma.client.budget.groupBy({ by: ['categoryId'], _count: { _all: true } }),
      this.prisma.client.categoryRule.groupBy({ by: ['categoryId'], _count: { _all: true } }),
      this.prisma.client.recurringRule.groupBy({
        by: ['categoryId'],
        where: { categoryId: { not: null } },
        _count: { _all: true },
      }),
    ]);

    const count = (rows: { categoryId: string | null; _count: { _all: number } }[]) =>
      new Map(rows.map((r) => [r.categoryId, r._count._all]));
    const tx = count(transactions);
    const bd = count(budgets);
    const rl = count(rules);
    const rc = count(recurring);
    const childCount = new Map<string, number>();
    for (const category of categories) {
      if (category.parentId) {
        childCount.set(category.parentId, (childCount.get(category.parentId) ?? 0) + 1);
      }
    }

    return categories.map((category) => {
      const transactionCount = tx.get(category.id) ?? 0;
      const children = childCount.get(category.id) ?? 0;
      return {
        ...category,
        transactionCount,
        budgetCount: bd.get(category.id) ?? 0,
        ruleCount: rl.get(category.id) ?? 0,
        recurringCount: rc.get(category.id) ?? 0,
        childCount: children,
        /** Sem uso e sem filha: dá para apagar direto, sem mesclar. */
        deletable: transactionCount === 0 && children === 0,
      };
    });
  }

  create(input: CreateCategoryInput) {
    return this.prisma.client.category.create({ data: input });
  }

  async update(id: string, input: UpdateCategoryInput) {
    await this.ensureExists(id);
    return this.prisma.client.category.update({ where: { id }, data: input });
  }

  async remove(id: string) {
    await this.ensureExists(id);
    const [txCount, childCount] = await Promise.all([
      this.prisma.client.transaction.count({ where: { categoryId: id } }),
      this.prisma.client.category.count({ where: { parentId: id } }),
    ]);
    if (txCount > 0 || childCount > 0) {
      throw new BadRequestException('Categoria em uso (lançamentos ou subcategorias).');
    }
    await this.prisma.client.category.delete({ where: { id } });
    return { ok: true };
  }

  /**
   * Mescla `sourceId` em `targetId` (Fase 9). Decisão do dono: **tudo migra** —
   * lançamentos, divisões, compras, recorrências, regras de importação, linhas
   * em revisão e subcategorias — e a origem é apagada no fim.
   *
   * Os dois pontos delicados são as chaves únicas, que não perdoam:
   * - `Budget(categoryId, month)`: se as duas tinham orçamento no mesmo mês, os
   *   limites **somam** (R$ 300 + R$ 200 = R$ 500), em vez de estourar unique;
   * - `CategoryRule(pattern, categoryId)`: regra de padrão repetido vira uma só,
   *   somando `appliedCount` para não perder o histórico de uso.
   *
   * Roda inteiro numa transação: ou a categoria some com tudo migrado, ou nada
   * muda. Meio caminho aqui deixaria lançamento órfão.
   */
  async merge(sourceId: string, targetId: string) {
    if (sourceId === targetId) {
      throw new BadRequestException('Escolha duas categorias diferentes.');
    }
    const [source, target] = await Promise.all([
      this.prisma.client.category.findUnique({ where: { id: sourceId } }),
      this.prisma.client.category.findUnique({ where: { id: targetId } }),
    ]);
    if (!source) throw new NotFoundException('Categoria de origem não encontrada');
    if (!target) throw new NotFoundException('Categoria de destino não encontrada');
    // Mesclar numa descendente deixaria a árvore com ciclo (pai virando filho).
    if (await this.isDescendant(targetId, sourceId)) {
      throw new BadRequestException('Não dá para mesclar em uma subcategoria da própria origem.');
    }

    return this.prisma.client.$transaction(async (tx) => {
      const [transactions, splits, purchases, rules, importRows, suggestions, children] =
        await Promise.all([
          tx.transaction.updateMany({ where: { categoryId: sourceId }, data: { categoryId: targetId } }),
          tx.transactionSplit.updateMany({ where: { categoryId: sourceId }, data: { categoryId: targetId } }),
          tx.purchase.updateMany({ where: { categoryId: sourceId }, data: { categoryId: targetId } }),
          tx.recurringRule.updateMany({ where: { categoryId: sourceId }, data: { categoryId: targetId } }),
          tx.importRow.updateMany({ where: { categoryId: sourceId }, data: { categoryId: targetId } }),
          tx.importRow.updateMany({
            where: { suggestedCategoryId: sourceId },
            data: { suggestedCategoryId: targetId },
          }),
          // Subcategoria da origem passa a pendurar no destino, não some.
          tx.category.updateMany({ where: { parentId: sourceId }, data: { parentId: targetId } }),
        ]);

      const budgets = await this.mergeBudgets(tx, sourceId, targetId);
      const categoryRules = await this.mergeCategoryRules(tx, sourceId, targetId);

      await tx.category.delete({ where: { id: sourceId } });

      return {
        merged: { from: source.name, into: target.name },
        moved: {
          transactions: transactions.count,
          splits: splits.count,
          purchases: purchases.count,
          recurringRules: rules.count,
          importRows: importRows.count + suggestions.count,
          children: children.count,
          budgets: budgets.moved,
          categoryRules: categoryRules.moved,
        },
        /** Meses em que os dois tinham limite e os valores foram somados. */
        budgetsSomados: budgets.summed,
        /** Regras de padrão repetido que viraram uma só. */
        regrasUnificadas: categoryRules.merged,
      };
    });
  }

  /** `Budget(categoryId, month)` é único: onde os dois têm limite, soma. */
  private async mergeBudgets(tx: PrismaTx, sourceId: string, targetId: string) {
    const [fromSource, fromTarget] = await Promise.all([
      tx.budget.findMany({ where: { categoryId: sourceId } }),
      tx.budget.findMany({ where: { categoryId: targetId } }),
    ]);
    const targetByMonth = new Map(fromTarget.map((b) => [b.month, b]));

    let moved = 0;
    const summed: { month: string; limitCents: bigint }[] = [];
    for (const budget of fromSource) {
      const existing = targetByMonth.get(budget.month);
      if (existing) {
        const limitCents = existing.limitCents + budget.limitCents;
        await tx.budget.update({ where: { id: existing.id }, data: { limitCents } });
        await tx.budget.delete({ where: { id: budget.id } });
        summed.push({ month: budget.month, limitCents });
      } else {
        await tx.budget.update({ where: { id: budget.id }, data: { categoryId: targetId } });
        moved += 1;
      }
    }
    return { moved, summed };
  }

  /** `CategoryRule(pattern, categoryId)` é único: padrão repetido vira uma regra. */
  private async mergeCategoryRules(tx: PrismaTx, sourceId: string, targetId: string) {
    const [fromSource, fromTarget] = await Promise.all([
      tx.categoryRule.findMany({ where: { categoryId: sourceId } }),
      tx.categoryRule.findMany({ where: { categoryId: targetId } }),
    ]);
    const targetByPattern = new Map(fromTarget.map((r) => [r.pattern, r]));

    let moved = 0;
    let merged = 0;
    for (const rule of fromSource) {
      const existing = targetByPattern.get(rule.pattern);
      if (existing) {
        await tx.categoryRule.update({
          where: { id: existing.id },
          data: { appliedCount: existing.appliedCount + rule.appliedCount },
        });
        await tx.categoryRule.delete({ where: { id: rule.id } });
        merged += 1;
      } else {
        await tx.categoryRule.update({ where: { id: rule.id }, data: { categoryId: targetId } });
        moved += 1;
      }
    }
    return { moved, merged };
  }

  /** O destino está abaixo da origem na árvore? Se sim, mesclar criaria ciclo. */
  private async isDescendant(candidateId: string, ancestorId: string): Promise<boolean> {
    let current = candidateId;
    // Trava contra árvore corrompida: nenhuma hierarquia real tem 50 níveis.
    for (let depth = 0; depth < 50; depth += 1) {
      const node = await this.prisma.client.category.findUnique({
        where: { id: current },
        select: { parentId: true },
      });
      if (!node?.parentId) return false;
      if (node.parentId === ancestorId) return true;
      current = node.parentId;
    }
    return false;
  }

  private async ensureExists(id: string) {
    const found = await this.prisma.client.category.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Categoria não encontrada');
  }
}
