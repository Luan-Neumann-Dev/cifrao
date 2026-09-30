import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@cifrao/db';
import type { CreateCategoryInput, UpdateCategoryInput } from '@cifrao/shared';
import { PrismaService } from '../prisma/prisma.service';

type PrismaTx = Prisma.TransactionClient;

/**
 * Categoria com `userId` NULL é **universal**: vem do seed e é compartilhada por
 * todos os usuários. Decisão do dono — não duplicar as 48 padrão por usuário.
 *
 * Consequência: universal é **somente-leitura**. Editar ou apagar mexeria na
 * categoria de todo mundo, e como `Budget` e `CategoryRule` têm
 * `onDelete: Cascade`, apagar uma derrubaria orçamento e regra de outros
 * usuários. Mesclar tem direção: a própria PARA uma universal é permitido; o
 * contrário, não.
 */
const UNIVERSAL_READONLY =
  'Categoria universal é somente-leitura. Crie uma categoria sua para personalizar.';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /** O que o usuário vê: as dele mais as universais. */
  private visible(userId: string): Prisma.CategoryWhereInput {
    return { OR: [{ userId }, { userId: null }] };
  }

  list(userId: string) {
    return this.prisma.client.category.findMany({
      where: this.visible(userId),
      orderBy: [{ name: 'asc' }],
    });
  }

  /**
   * Categorias com quanto cada uma é usada — é o que a tela de gestão precisa
   * para dizer "essa dá para apagar" ou "essa só dá para mesclar". Contagem por
   * `groupBy` no banco (armadilha #5), nunca contando linha no Node.
   *
   * A contagem é sempre **do usuário que pediu**, mesmo numa categoria
   * universal: dizer quantos lançamentos existem nela no total vazaria o quanto
   * os outros usuários a usam.
   */
  async usage(userId: string) {
    const [categories, transactions, budgets, rules, recurring] = await Promise.all([
      this.prisma.client.category.findMany({
        where: this.visible(userId),
        orderBy: [{ name: 'asc' }],
      }),
      this.prisma.client.transaction.groupBy({
        by: ['categoryId'],
        where: { userId, categoryId: { not: null } },
        _count: { _all: true },
      }),
      this.prisma.client.budget.groupBy({
        by: ['categoryId'],
        where: { userId },
        _count: { _all: true },
      }),
      this.prisma.client.categoryRule.groupBy({
        by: ['categoryId'],
        where: { userId },
        _count: { _all: true },
      }),
      this.prisma.client.recurringRule.groupBy({
        by: ['categoryId'],
        where: { userId, categoryId: { not: null } },
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
      const universal = category.userId === null;
      return {
        ...category,
        universal,
        transactionCount,
        budgetCount: bd.get(category.id) ?? 0,
        ruleCount: rl.get(category.id) ?? 0,
        recurringCount: rc.get(category.id) ?? 0,
        childCount: children,
        /** Universal nunca é apagável; a própria, só sem uso e sem filha. */
        deletable: !universal && transactionCount === 0 && children === 0,
      };
    });
  }

  async create(userId: string, input: CreateCategoryInput) {
    // Subcategoria pode pendurar numa universal, mas nunca numa de outro usuário.
    if (input.parentId) await this.ensureVisible(userId, input.parentId);
    return this.prisma.client.category.create({ data: { ...input, userId } });
  }

  async update(userId: string, id: string, input: UpdateCategoryInput) {
    await this.ensureOwned(userId, id);
    if (input.parentId) await this.ensureVisible(userId, input.parentId);
    return this.prisma.client.category.update({ where: { id }, data: input });
  }

  async remove(userId: string, id: string) {
    await this.ensureOwned(userId, id);
    const [txCount, childCount] = await Promise.all([
      this.prisma.client.transaction.count({ where: { userId, categoryId: id } }),
      this.prisma.client.category.count({ where: { userId, parentId: id } }),
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
   * A origem tem que ser **do usuário**: apagar uma universal atingiria todos.
   * O destino pode ser universal — mesclar a minha "Mercado" para dentro da
   * "Supermercado" padrão é justamente o caso útil.
   *
   * Os dois pontos delicados são as chaves únicas, que não perdoam:
   * - `Budget(userId, categoryId, month)`: se as duas tinham orçamento no mesmo
   *   mês, os limites **somam** (R$ 300 + R$ 200 = R$ 500);
   * - `CategoryRule(userId, pattern, categoryId)`: regra de padrão repetido vira
   *   uma só, somando `appliedCount` para não perder o histórico de uso.
   *
   * Roda inteiro numa transação: ou a categoria some com tudo migrado, ou nada
   * muda. Meio caminho aqui deixaria lançamento órfão.
   */
  async merge(userId: string, sourceId: string, targetId: string) {
    if (sourceId === targetId) {
      throw new BadRequestException('Escolha duas categorias diferentes.');
    }
    const [source, target] = await Promise.all([
      this.prisma.client.category.findFirst({ where: { id: sourceId, ...this.visible(userId) } }),
      this.prisma.client.category.findFirst({ where: { id: targetId, ...this.visible(userId) } }),
    ]);
    if (!source) throw new NotFoundException('Categoria de origem não encontrada');
    if (!target) throw new NotFoundException('Categoria de destino não encontrada');
    if (source.userId === null) {
      throw new BadRequestException(
        'Categoria universal não pode ser mesclada — ela é compartilhada por todos.',
      );
    }
    // Mesclar numa descendente deixaria a árvore com ciclo (pai virando filho).
    if (await this.isDescendant(userId, targetId, sourceId)) {
      throw new BadRequestException('Não dá para mesclar em uma subcategoria da própria origem.');
    }

    return this.prisma.client.$transaction(async (tx) => {
      const [transactions, splits, purchases, rules, importRows, suggestions, children] =
        await Promise.all([
          tx.transaction.updateMany({
            where: { userId, categoryId: sourceId },
            data: { categoryId: targetId },
          }),
          // TransactionSplit não tem dono próprio: o filtro vai pela relação.
          tx.transactionSplit.updateMany({
            where: { categoryId: sourceId, transaction: { userId } },
            data: { categoryId: targetId },
          }),
          tx.purchase.updateMany({
            where: { userId, categoryId: sourceId },
            data: { categoryId: targetId },
          }),
          tx.recurringRule.updateMany({
            where: { userId, categoryId: sourceId },
            data: { categoryId: targetId },
          }),
          // ImportRow também é filho: dono vem do ImportBatch.
          tx.importRow.updateMany({
            where: { categoryId: sourceId, batch: { userId } },
            data: { categoryId: targetId },
          }),
          tx.importRow.updateMany({
            where: { suggestedCategoryId: sourceId, batch: { userId } },
            data: { suggestedCategoryId: targetId },
          }),
          // Subcategoria da origem passa a pendurar no destino, não some.
          tx.category.updateMany({
            where: { userId, parentId: sourceId },
            data: { parentId: targetId },
          }),
        ]);

      const budgets = await this.mergeBudgets(tx, userId, sourceId, targetId);
      const categoryRules = await this.mergeCategoryRules(tx, userId, sourceId, targetId);

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

  /** `Budget(userId, categoryId, month)` é único: onde os dois têm limite, soma. */
  private async mergeBudgets(
    tx: PrismaTx,
    userId: string,
    sourceId: string,
    targetId: string,
  ) {
    const [fromSource, fromTarget] = await Promise.all([
      tx.budget.findMany({ where: { userId, categoryId: sourceId } }),
      tx.budget.findMany({ where: { userId, categoryId: targetId } }),
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

  /** `CategoryRule(userId, pattern, categoryId)` é único: padrão repetido vira uma regra. */
  private async mergeCategoryRules(
    tx: PrismaTx,
    userId: string,
    sourceId: string,
    targetId: string,
  ) {
    const [fromSource, fromTarget] = await Promise.all([
      tx.categoryRule.findMany({ where: { userId, categoryId: sourceId } }),
      tx.categoryRule.findMany({ where: { userId, categoryId: targetId } }),
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
  private async isDescendant(
    userId: string,
    candidateId: string,
    ancestorId: string,
  ): Promise<boolean> {
    let current = candidateId;
    // Trava contra árvore corrompida: nenhuma hierarquia real tem 50 níveis.
    for (let depth = 0; depth < 50; depth += 1) {
      const node = await this.prisma.client.category.findFirst({
        where: { id: current, ...this.visible(userId) },
        select: { parentId: true },
      });
      if (!node?.parentId) return false;
      if (node.parentId === ancestorId) return true;
      current = node.parentId;
    }
    return false;
  }

  /** Visível = própria ou universal. Usa para pai/destino, onde ler basta. */
  private async ensureVisible(userId: string, id: string) {
    const found = await this.prisma.client.category.findFirst({
      where: { id, ...this.visible(userId) },
    });
    if (!found) throw new NotFoundException('Categoria não encontrada');
    return found;
  }

  /** Própria e só própria. Usa antes de qualquer escrita. */
  private async ensureOwned(userId: string, id: string) {
    const found = await this.ensureVisible(userId, id);
    if (found.userId === null) throw new BadRequestException(UNIVERSAL_READONLY);
    return found;
  }
}
