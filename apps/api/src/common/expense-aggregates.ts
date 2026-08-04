import type { Prisma, PrismaClient } from '@cifrao/db';

type Db = PrismaClient | Prisma.TransactionClient;

export interface NetExpense {
  /** Gasto líquido por categoria (despesa bruta − estornos de reembolso). */
  byCategory: Map<string | null, bigint>;
  /**
   * Quantos lançamentos de despesa por categoria. O estorno abate o VALOR, mas
   * não apaga o fato de a despesa ter acontecido — por isso não reduz a contagem.
   */
  countByCategory: Map<string | null, number>;
  totalCents: bigint;
  count: number;
  /** Total dos estornos abatidos, para exibir no detalhe. */
  refundedCents: bigint;
}

/**
 * Regra 5.13 — gasto por categoria **líquido de reembolso**.
 *
 * O estorno é atribuído ao mês e à categoria do GASTO ORIGINAL, não à data em
 * que o dinheiro voltou: um almoço de julho reembolsado em agosto deixa de pesar
 * no orçamento de julho, que é o que interessa para saber quanto você gastou de
 * fato. Por isso o filtro dos estornos é feito pela relação `reimburses`.
 *
 * `where` deve conter o recorte do gasto (período e status), sem `type`.
 */
export async function netExpenseByCategory(
  db: Db,
  where: Prisma.TransactionWhereInput,
): Promise<NetExpense> {
  const expenseWhere: Prisma.TransactionWhereInput = { ...where, type: 'EXPENSE' };

  const [expenseRows, refunds] = await Promise.all([
    db.transaction.groupBy({
      by: ['categoryId'],
      where: expenseWhere,
      _sum: { amountCents: true },
      _count: { _all: true },
    }),
    // Estornos cujo gasto de origem cai no recorte pedido.
    db.transaction.findMany({
      where: { reimbursesTransactionId: { not: null }, reimburses: { is: expenseWhere } },
      select: { amountCents: true, reimburses: { select: { categoryId: true } } },
    }),
  ]);

  const byCategory = new Map<string | null, bigint>();
  const countByCategory = new Map<string | null, number>();
  let totalCents = 0n;
  let count = 0;
  for (const row of expenseRows) {
    const value = row._sum.amountCents ?? 0n;
    byCategory.set(row.categoryId, value);
    countByCategory.set(row.categoryId, row._count._all);
    totalCents += value;
    count += row._count._all;
  }

  let refundedCents = 0n;
  for (const refund of refunds) {
    const key = refund.reimburses?.categoryId ?? null;
    byCategory.set(key, (byCategory.get(key) ?? 0n) - refund.amountCents);
    totalCents -= refund.amountCents;
    refundedCents += refund.amountCents;
  }

  return { byCategory, countByCategory, totalCents, count, refundedCents };
}

/**
 * Receita do recorte, **excluindo estornos de reembolso** (devolução não é
 * ganho). Espelha `sumIncomeCents` do pacote shared.
 */
export async function netIncomeCents(
  db: Db,
  where: Prisma.TransactionWhereInput,
): Promise<bigint> {
  const agg = await db.transaction.aggregate({
    where: { ...where, type: 'INCOME', reimbursesTransactionId: null },
    _sum: { amountCents: true },
  });
  return agg._sum.amountCents ?? 0n;
}
