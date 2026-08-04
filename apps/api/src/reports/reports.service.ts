import { Injectable } from '@nestjs/common';
import { Prisma } from '@cifrao/db';
import {
  type Granularity,
  type ReportQuery,
  accumulateSeries,
  addMonths,
  biggestVariations,
  buildCategoryReport,
  computeVariation,
  daysInMonth,
  monthKeyInSaoPaulo,
  percentOf,
  pickGranularity,
  previousPeriod,
  saoPauloDateParts,
  saoPauloWallClockToUtc,
} from '@cifrao/shared';
import { netExpenseByCategory, netIncomeCents } from '../common/expense-aggregates';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Relatórios (Fase 7). O aceite é "os números batem exatamente com a soma dos
 * lançamentos filtrados", então tudo respeita as mesmas exclusões do resto do
 * app: transferência e ajuste ficam fora de receita/despesa (5.7) e estorno de
 * reembolso abate a despesa em vez de virar receita (5.13).
 *
 * Toda agregação é feita no Postgres (armadilha #5) — nada de varrer milhares de
 * linhas no Node.
 */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(query: ReportQuery) {
    const period = this.resolvePeriod(query);
    const previous = previousPeriod(period);
    const granularity = pickGranularity(period);
    const accountFilter = query.accountId ? { accountId: query.accountId } : {};

    const baseWhere: Prisma.TransactionWhereInput = {
      status: { not: 'FORECAST' },
      date: { gte: period.from, lte: period.to },
      ...accountFilter,
    };
    const previousWhere: Prisma.TransactionWhereInput = {
      status: { not: 'FORECAST' },
      date: { gte: previous.from, lte: previous.to },
      ...accountFilter,
    };

    const [
      expenses,
      previousExpenses,
      incomeCents,
      previousIncomeCents,
      categories,
      series,
      topTransactions,
      merchants,
      netWorth,
    ] = await Promise.all([
      netExpenseByCategory(this.prisma.client, baseWhere),
      netExpenseByCategory(this.prisma.client, previousWhere),
      netIncomeCents(this.prisma.client, baseWhere),
      netIncomeCents(this.prisma.client, previousWhere),
      this.prisma.client.category.findMany({
        select: { id: true, name: true, color: true, icon: true },
      }),
      this.series(period, granularity, query.accountId),
      this.topTransactions(baseWhere),
      this.topMerchants(period, query.accountId),
      this.netWorthSeries(period),
    ]);

    const catById = new Map(categories.map((c) => [c.id, c]));
    const rows = [...expenses.byCategory.entries()]
      .filter(([, total]) => total !== 0n)
      .map(([categoryId, totalCents]) => ({
        categoryId,
        totalCents,
        count: expenses.countByCategory.get(categoryId) ?? 0,
        previousCents: previousExpenses.byCategory.get(categoryId) ?? 0n,
      }));

    const categoryReport = buildCategoryReport(rows, expenses.totalCents).map((row) => {
      const category = row.categoryId ? catById.get(row.categoryId) : null;
      return {
        ...row,
        name: category?.name ?? 'Sem categoria',
        color: category?.color ?? null,
        icon: category?.icon ?? null,
      };
    });

    const netCents = incomeCents - expenses.totalCents;
    const previousNetCents = previousIncomeCents - previousExpenses.totalCents;

    return {
      period: {
        from: period.from,
        to: period.to,
        previousFrom: previous.from,
        previousTo: previous.to,
        granularity,
      },
      totals: {
        incomeCents,
        expenseCents: expenses.totalCents,
        netCents,
        refundedCents: expenses.refundedCents,
        transactionCount: expenses.count,
        income: computeVariation(incomeCents, previousIncomeCents),
        expense: computeVariation(expenses.totalCents, previousExpenses.totalCents),
        net: computeVariation(netCents, previousNetCents),
        /** Quanto sobrou de cada R$ 100 que entrou. */
        savingsRate: percentOf(netCents, incomeCents),
      },
      series,
      categories: categoryReport,
      biggestVariations: biggestVariations(categoryReport, 5),
      topTransactions,
      topMerchants: merchants,
      netWorth,
    };
  }

  // ─── Série: entradas × saídas × saldo acumulado ──────────────────────────────

  /**
   * Agrupa no banco por dia ou mês, já no fuso de São Paulo (regra 5.2). A coluna
   * é `timestamp without time zone` guardando UTC, daí o duplo `AT TIME ZONE`.
   * O estorno de reembolso abate o balde do gasto ORIGINAL, não o do dia em que
   * o dinheiro voltou — mesma regra do orçamento (5.13).
   */
  private async series(
    period: { from: Date; to: Date },
    granularity: Granularity,
    accountId?: string,
  ) {
    // `granularity` vem de um union fechado; nunca de entrada do usuário.
    const unit = granularity === 'day' ? 'day' : 'month';
    const account = accountId ?? null;

    const rows = await this.prisma.client.$queryRaw<
      { bucket: Date; income: bigint | null; expense: bigint | null; refunded: bigint | null }[]
    >`
      WITH movimento AS (
        SELECT
          date_trunc(${unit}, t."date" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo') AS bucket,
          SUM(CASE WHEN t."type" = 'INCOME' AND t."reimbursesTransactionId" IS NULL
                   THEN t."amountCents" ELSE 0 END) AS income,
          SUM(CASE WHEN t."type" = 'EXPENSE' THEN t."amountCents" ELSE 0 END) AS expense
        FROM "Transaction" t
        WHERE t."status" <> 'FORECAST'
          AND t."date" >= ${period.from} AND t."date" <= ${period.to}
          AND (${account}::text IS NULL OR t."accountId" = ${account})
        GROUP BY 1
      ),
      estornos AS (
        SELECT
          date_trunc(${unit}, o."date" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo') AS bucket,
          SUM(r."amountCents") AS refunded
        FROM "Transaction" r
        JOIN "Transaction" o ON o."id" = r."reimbursesTransactionId"
        WHERE o."status" <> 'FORECAST' AND o."type" = 'EXPENSE'
          AND o."date" >= ${period.from} AND o."date" <= ${period.to}
          AND (${account}::text IS NULL OR o."accountId" = ${account})
        GROUP BY 1
      )
      SELECT
        COALESCE(m.bucket, e.bucket) AS bucket,
        COALESCE(m.income, 0) AS income,
        COALESCE(m.expense, 0) AS expense,
        COALESCE(e.refunded, 0) AS refunded
      FROM movimento m
      FULL OUTER JOIN estornos e ON e.bucket = m.bucket
      ORDER BY 1 ASC
    `;

    return accumulateSeries(
      rows.map((row) => ({
        bucket: this.bucketKey(row.bucket, granularity),
        incomeCents: BigInt(row.income ?? 0),
        expenseCents: BigInt(row.expense ?? 0) - BigInt(row.refunded ?? 0),
      })),
    );
  }

  /** O `date_trunc` já devolve a data local; formata sem reconverter fuso. */
  private bucketKey(bucket: Date, granularity: Granularity): string {
    const iso = bucket.toISOString();
    return granularity === 'day' ? iso.slice(0, 10) : iso.slice(0, 7);
  }

  // ─── 20 maiores lançamentos ──────────────────────────────────────────────────

  private async topTransactions(where: Prisma.TransactionWhereInput) {
    return this.prisma.client.transaction.findMany({
      where: { ...where, type: 'EXPENSE' },
      orderBy: { amountCents: 'desc' },
      take: 20,
      select: {
        id: true,
        date: true,
        description: true,
        amountCents: true,
        type: true,
        category: { select: { id: true, name: true, color: true, icon: true } },
        account: { select: { id: true, name: true } },
        creditCard: { select: { id: true, nickname: true } },
      },
    });
  }

  // ─── 10 estabelecimentos mais frequentes ─────────────────────────────────────

  /**
   * Agrupa por descrição normalizada no próprio Postgres. A normalização é mais
   * grossa que a do `import-logic` (derruba todo dígito), porque aqui o objetivo
   * é juntar "IFOOD *PEDIDO 123" e "IFOOD *PEDIDO 987" no mesmo estabelecimento.
   */
  private async topMerchants(period: { from: Date; to: Date }, accountId?: string) {
    const account = accountId ?? null;
    const rows = await this.prisma.client.$queryRaw<
      { chave: string; exemplo: string; total: bigint; quantidade: bigint }[]
    >`
      SELECT
        btrim(regexp_replace(
          regexp_replace(
            translate(lower(t."description"),
                      'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn'),
            '[^a-z ]', ' ', 'g'),
          '\\s+', ' ', 'g')) AS chave,
        MIN(t."description") AS exemplo,
        SUM(t."amountCents") AS total,
        COUNT(*) AS quantidade
      FROM "Transaction" t
      WHERE t."status" <> 'FORECAST' AND t."type" = 'EXPENSE'
        AND t."date" >= ${period.from} AND t."date" <= ${period.to}
        AND (${account}::text IS NULL OR t."accountId" = ${account})
      GROUP BY 1
      HAVING btrim(regexp_replace(
          regexp_replace(
            translate(lower(t."description"),
                      'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn'),
            '[^a-z ]', ' ', 'g'),
          '\\s+', ' ', 'g')) <> ''
      ORDER BY quantidade DESC, total DESC
      LIMIT 10
    `;

    return rows.map((row) => ({
      key: row.chave,
      label: row.exemplo,
      count: Number(row.quantidade),
      totalCents: BigInt(row.total ?? 0),
    }));
  }

  // ─── Evolução do patrimônio líquido ──────────────────────────────────────────

  /**
   * Patrimônio ao fim de cada mês = saldo de todas as contas − dívida de cartão.
   *
   * A dívida de cartão naquele instante é histórica de verdade: compras de
   * cartão lançadas até a data menos pagamentos de fatura feitos até a data —
   * e não a foto de hoje. Investimentos entram como contas do tipo INVESTMENT
   * até a Fase 8 trazer as posições reais (decisão do dono).
   */
  private async netWorthSeries(period: { from: Date; to: Date }) {
    const today = saoPauloDateParts(new Date());
    const startKey = monthKeyInSaoPaulo(period.from);
    const [startYear, startMonth] = startKey.split('-').map(Number);

    // Meses do início do período até o mês corrente.
    const months: string[] = [];
    let cursor = { year: startYear, month: startMonth };
    while (
      cursor.year < today.year ||
      (cursor.year === today.year && cursor.month <= today.month)
    ) {
      months.push(`${cursor.year}-${String(cursor.month).padStart(2, '0')}`);
      cursor = addMonths(cursor.year, cursor.month, 1);
      if (months.length > 120) break; // trava de segurança
    }
    if (months.length === 0) return [];

    const windowStart = saoPauloWallClockToUtc(startYear, startMonth, 1, '00:00:00');

    const [accounts, investmentAccounts, cardDebtNow, deltas] = await Promise.all([
      this.prisma.client.account.aggregate({ _sum: { balanceCents: true } }),
      this.prisma.client.account.aggregate({
        where: { type: 'INVESTMENT' },
        _sum: { balanceCents: true },
      }),
      this.currentCardDebt(),
      this.monthlyDeltas(windowStart),
    ]);

    const accountsNow = accounts._sum.balanceCents ?? 0n;
    const investmentsNow = investmentAccounts._sum.balanceCents ?? 0n;

    // Caminha de trás para frente: o valor no fim do mês M é o de hoje menos
    // tudo que se moveu depois de M.
    const byMonth = new Map(deltas.map((d) => [d.month, d]));
    const points: {
      month: string;
      accountsCents: bigint;
      investmentsCents: bigint;
      cardDebtCents: bigint;
      netWorthCents: bigint;
    }[] = [];

    let accountsRunning = accountsNow;
    let investmentsRunning = investmentsNow;
    let cardDebtRunning = cardDebtNow;

    for (let i = months.length - 1; i >= 0; i--) {
      const month = months[i];
      points.unshift({
        month,
        accountsCents: accountsRunning,
        investmentsCents: investmentsRunning,
        cardDebtCents: cardDebtRunning,
        netWorthCents: accountsRunning - cardDebtRunning,
      });

      const delta = byMonth.get(month);
      accountsRunning -= delta?.accountDelta ?? 0n;
      investmentsRunning -= delta?.investmentDelta ?? 0n;
      cardDebtRunning -= delta?.cardDelta ?? 0n;
    }

    return points;
  }

  /** Compras de cartão lançadas menos pagamentos de fatura, até hoje. */
  private async currentCardDebt(): Promise<bigint> {
    const [purchases, payments] = await Promise.all([
      this.prisma.client.transaction.aggregate({
        where: { creditCardId: { not: null }, type: 'EXPENSE', status: { not: 'FORECAST' } },
        _sum: { amountCents: true },
      }),
      this.prisma.client.transaction.aggregate({
        where: { invoiceId: { not: null }, type: 'TRANSFER', status: { not: 'FORECAST' } },
        _sum: { amountCents: true },
      }),
    ]);
    return (purchases._sum.amountCents ?? 0n) - (payments._sum.amountCents ?? 0n);
  }

  /** Movimento de cada mês, agregado no banco, para reconstruir o histórico. */
  private async monthlyDeltas(from: Date) {
    const rows = await this.prisma.client.$queryRaw<
      { mes: string; conta: bigint | null; investimento: bigint | null; cartao: bigint | null }[]
    >`
      SELECT
        to_char(date_trunc('month', t."date" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo'),
                'YYYY-MM') AS mes,
        SUM(
          CASE
            WHEN t."accountId" IS NOT NULL AND t."type" IN ('INCOME', 'ADJUSTMENT') THEN t."amountCents"
            WHEN t."accountId" IS NOT NULL AND t."type" = 'EXPENSE' THEN -t."amountCents"
            ELSE 0
          END
          + CASE WHEN t."type" = 'TRANSFER' AND t."toAccountId" IS NOT NULL THEN t."amountCents" ELSE 0 END
          - CASE WHEN t."type" = 'TRANSFER' AND t."fromAccountId" IS NOT NULL THEN t."amountCents" ELSE 0 END
        ) AS conta,
        SUM(
          CASE
            WHEN a."type" = 'INVESTMENT' AND t."type" IN ('INCOME', 'ADJUSTMENT') THEN t."amountCents"
            WHEN a."type" = 'INVESTMENT' AND t."type" = 'EXPENSE' THEN -t."amountCents"
            ELSE 0
          END
          + CASE WHEN t."type" = 'TRANSFER' AND destino."type" = 'INVESTMENT' THEN t."amountCents" ELSE 0 END
          - CASE WHEN t."type" = 'TRANSFER' AND origem."type" = 'INVESTMENT' THEN t."amountCents" ELSE 0 END
        ) AS investimento,
        SUM(
          CASE WHEN t."creditCardId" IS NOT NULL AND t."type" = 'EXPENSE' THEN t."amountCents" ELSE 0 END
          - CASE WHEN t."invoiceId" IS NOT NULL AND t."type" = 'TRANSFER' THEN t."amountCents" ELSE 0 END
        ) AS cartao
      FROM "Transaction" t
      LEFT JOIN "Account" a ON a."id" = t."accountId"
      LEFT JOIN "Account" origem ON origem."id" = t."fromAccountId"
      LEFT JOIN "Account" destino ON destino."id" = t."toAccountId"
      WHERE t."status" <> 'FORECAST' AND t."date" >= ${from}
      GROUP BY 1
      ORDER BY 1 ASC
    `;

    return rows.map((row) => ({
      month: row.mes,
      accountDelta: BigInt(row.conta ?? 0),
      investmentDelta: BigInt(row.investimento ?? 0),
      cardDelta: BigInt(row.cartao ?? 0),
    }));
  }

  // ─── Período ─────────────────────────────────────────────────────────────────

  /**
   * Sem datas, o relatório é do mês corrente. As datas informadas são dias de
   * calendário de São Paulo: `from` começa 00:00 e `to` inclui o dia inteiro
   * até 23:59:59 (regra 5.2).
   */
  private resolvePeriod(query: ReportQuery): { from: Date; to: Date } {
    const today = saoPauloDateParts(new Date());
    const lastDayOfMonth = daysInMonth(today.year, today.month);

    const from = query.from
      ? this.dayBoundary(query.from, '00:00:00')
      : saoPauloWallClockToUtc(today.year, today.month, 1, '00:00:00');
    const to = query.to
      ? this.dayBoundary(query.to, '23:59:59')
      : saoPauloWallClockToUtc(today.year, today.month, lastDayOfMonth, '23:59:59');

    return { from, to };
  }

  private dayBoundary(day: string, time: string): Date {
    const [year, month, date] = day.slice(0, 10).split('-').map(Number);
    return saoPauloWallClockToUtc(year, month, date, time);
  }
}
