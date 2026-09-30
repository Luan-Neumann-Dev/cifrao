import type { Prisma, PrismaClient } from '@cifrao/db';
import { costOfCents } from '@cifrao/shared';

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Valor de mercado da carteira (Fase 8), usado pelo patrimônio do dashboard e
 * do relatório.
 *
 * Importante para não contar dinheiro duas vezes: aportar **tira** o dinheiro da
 * conta (o saldo cai) e o que passa a valer é a posição. Então somar contas +
 * carteira é correto — o real está num lugar só de cada vez.
 */
export async function currentPortfolioValueCents(db: Db, userId: string): Promise<bigint> {
  const positions = await db.investment.findMany({
    where: { userId, archived: false },
    select: { quantity: true, currentPriceCents: true },
  });
  return positions.reduce(
    (acc, position) => acc + costOfCents(position.quantity, position.currentPriceCents),
    0n,
  );
}

/**
 * Valor da carteira ao fim de cada mês pedido, reconstruído do histórico:
 * quantidade acumulada até a data × cotação registrada em `PriceHistory` mais
 * recente até a data. É a "evolução patrimonial usando PriceHistory" da Fase 8.
 *
 * Sem cotação anterior à data, cai para o preço médio pago — é o valor mais
 * honesto que existe naquele instante (não dá para inventar cotação retroativa).
 */
export async function portfolioValueByMonth(
  db: Db,
  userId: string,
  monthEnds: { month: string; at: Date }[],
): Promise<Map<string, bigint>> {
  const result = new Map<string, bigint>();
  if (monthEnds.length === 0) return result;

  const last = monthEnds[monthEnds.length - 1].at;

  const [investments, trades, prices] = await Promise.all([
    db.investment.findMany({
      where: { userId },
      select: { id: true, avgPriceCents: true, currentPriceCents: true },
    }),
    // InvestmentTransaction e PriceHistory não têm dono próprio: filtram pela
    // posição, que tem.
    db.investmentTransaction.findMany({
      where: { date: { lte: last }, investment: { userId } },
      select: { investmentId: true, type: true, quantity: true, date: true },
      orderBy: { date: 'asc' },
    }),
    db.priceHistory.findMany({
      where: { date: { lte: last }, investment: { userId } },
      select: { investmentId: true, date: true, priceCents: true },
      orderBy: { date: 'asc' },
    }),
  ]);

  for (const { month, at } of monthEnds) {
    let total = 0n;

    for (const investment of investments) {
      let quantity = 0n;
      for (const trade of trades) {
        if (trade.investmentId !== investment.id || trade.date > at) continue;
        quantity += trade.type === 'BUY' ? trade.quantity : -trade.quantity;
      }
      if (quantity <= 0n) continue;

      let priceCents = investment.avgPriceCents;
      for (const price of prices) {
        if (price.investmentId !== investment.id || price.date > at) continue;
        priceCents = price.priceCents; // a lista vem ordenada: fica a mais recente
      }
      total += costOfCents(quantity, priceCents);
    }

    result.set(month, total);
  }

  return result;
}
