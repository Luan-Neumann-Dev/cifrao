import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@cifrao/db';
import {
  type AllocationTargetsInput,
  type CreateInvestmentInput,
  type InvestmentClass,
  type InvestmentTradeInput,
  type UpdateInvestmentInput,
  type UpdatePriceInput,
  addMonths,
  allocationByClass,
  applyContribution,
  applyRedemption,
  costOfCents,
  monthKeyInSaoPaulo,
  positionMetrics,
  saoPauloDateParts,
  saoPauloWallClockToUtc,
  toQuantity,
} from '@cifrao/shared';
import { portfolioValueByMonth } from '../common/portfolio';
import { PrismaService } from '../prisma/prisma.service';

/** Quantos meses de evolução patrimonial a tela mostra. */
const EVOLUTION_MONTHS = 12;

@Injectable()
export class InvestmentsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Leitura ────────────────────────────────────────────────────────────────

  async list(includeArchived = false) {
    const investments = await this.prisma.client.investment.findMany({
      where: includeArchived ? {} : { archived: false },
      orderBy: [{ class: 'asc' }, { ticker: 'asc' }],
    });

    return investments.map((investment) => ({
      ...investment,
      ...positionMetrics(
        { quantity: investment.quantity, investedCents: investment.investedCents },
        investment.currentPriceCents,
      ),
    }));
  }

  async get(id: string) {
    const investment = await this.prisma.client.investment.findUnique({
      where: { id },
      include: {
        transactions: {
          orderBy: { date: 'desc' },
          include: { account: { select: { id: true, name: true, color: true } } },
        },
        prices: { orderBy: { date: 'desc' }, take: 90 },
      },
    });
    if (!investment) throw new NotFoundException('Investimento não encontrado');

    return {
      ...investment,
      ...positionMetrics(
        { quantity: investment.quantity, investedCents: investment.investedCents },
        investment.currentPriceCents,
      ),
    };
  }

  /** Painel da carteira: totais, alocação por classe e evolução patrimonial. */
  async overview() {
    const [investments, targets] = await Promise.all([
      this.prisma.client.investment.findMany({ where: { archived: false } }),
      this.prisma.client.allocationTarget.findMany(),
    ]);

    const positions = investments.map((investment) => ({
      id: investment.id,
      ticker: investment.ticker,
      name: investment.name,
      class: investment.class,
      quantity: investment.quantity,
      avgPriceCents: investment.avgPriceCents,
      currentPriceCents: investment.currentPriceCents,
      priceUpdatedAt: investment.priceUpdatedAt,
      realizedGainCents: investment.realizedGainCents,
      ...positionMetrics(
        { quantity: investment.quantity, investedCents: investment.investedCents },
        investment.currentPriceCents,
      ),
    }));

    const marketValueCents = positions.reduce((acc, p) => acc + p.marketValueCents, 0n);
    const investedCents = positions.reduce((acc, p) => acc + p.investedCents, 0n);
    const realizedGainCents = positions.reduce((acc, p) => acc + p.realizedGainCents, 0n);
    const gainCents = marketValueCents - investedCents;

    const targetMap = new Map<InvestmentClass, number>(
      targets.map((target) => [target.class, target.targetPercent]),
    );

    return {
      totals: {
        marketValueCents,
        investedCents,
        gainCents,
        gainPercent: investedCents === 0n ? null : Number((gainCents * 10000n) / investedCents) / 100,
        realizedGainCents,
        positionCount: positions.length,
      },
      positions: positions.sort((a, b) =>
        b.marketValueCents > a.marketValueCents ? 1 : b.marketValueCents < a.marketValueCents ? -1 : 0,
      ),
      allocation: allocationByClass(
        positions.map((p) => ({ class: p.class, marketValueCents: p.marketValueCents })),
        targetMap,
      ),
      evolution: await this.evolution(),
    };
  }

  /** Valor da carteira ao fim de cada um dos últimos 12 meses. */
  async evolution() {
    const today = saoPauloDateParts(new Date());
    const monthEnds: { month: string; at: Date }[] = [];

    for (let i = EVOLUTION_MONTHS - 1; i >= 0; i--) {
      const ref = addMonths(today.year, today.month, -i);
      const next = addMonths(ref.year, ref.month, 1);
      const monthEnd = new Date(
        saoPauloWallClockToUtc(next.year, next.month, 1, '00:00:00').getTime() - 1,
      );
      monthEnds.push({
        month: `${ref.year}-${String(ref.month).padStart(2, '0')}`,
        at: i === 0 ? new Date() : monthEnd,
      });
    }

    const byMonth = await portfolioValueByMonth(this.prisma.client, monthEnds);
    return monthEnds.map(({ month }) => ({ month, marketValueCents: byMonth.get(month) ?? 0n }));
  }

  // ─── Escrita ────────────────────────────────────────────────────────────────

  async create(input: CreateInvestmentInput) {
    const existing = await this.prisma.client.investment.findUnique({
      where: { ticker: input.ticker },
    });
    if (existing) throw new BadRequestException(`Já existe uma posição para ${input.ticker}.`);

    const price = input.currentPriceCents === undefined ? 0n : BigInt(input.currentPriceCents);
    return this.prisma.client.investment.create({
      data: {
        ticker: input.ticker,
        name: input.name,
        class: input.class,
        currentPriceCents: price,
        priceUpdatedAt: price > 0n ? new Date() : null,
        notes: input.notes,
      },
    });
  }

  async update(id: string, input: UpdateInvestmentInput) {
    await this.get(id);
    return this.prisma.client.investment.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.class !== undefined ? { class: input.class } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.archived !== undefined ? { archived: input.archived } : {}),
      },
    });
  }

  /** Excluir a posição desfaz os lançamentos de aporte/resgate e devolve o saldo. */
  async remove(id: string) {
    return this.prisma.client.$transaction(async (tx) => {
      const investment = await tx.investment.findUnique({
        where: { id },
        include: { transactions: true },
      });
      if (!investment) throw new NotFoundException('Investimento não encontrado');

      for (const trade of investment.transactions) {
        if (trade.transactionId) await this.revertCashMovement(tx, trade.transactionId);
      }
      await tx.investment.delete({ where: { id } });
      return { ok: true };
    });
  }

  /**
   * Aporte. Com conta informada, o dinheiro **sai da conta** e vira um
   * `Transaction` do tipo TRANSFER — comprar ativo não é despesa (regra 5.7), e
   * é isso que impede o mesmo real de ser contado na conta e na carteira.
   */
  async contribute(id: string, input: InvestmentTradeInput) {
    return this.trade(id, input, 'BUY');
  }

  /** Resgate: o dinheiro volta para a conta (quando informada). */
  async redeem(id: string, input: InvestmentTradeInput) {
    return this.trade(id, input, 'SELL');
  }

  private async trade(id: string, input: InvestmentTradeInput, type: 'BUY' | 'SELL') {
    const quantity = this.parseQuantity(input.quantity);

    return this.prisma.client.$transaction(async (tx) => {
      const investment = await tx.investment.findUnique({ where: { id } });
      if (!investment) throw new NotFoundException('Investimento não encontrado');

      const position = {
        quantity: investment.quantity,
        investedCents: investment.investedCents,
      };
      const trade = { quantity, priceCents: BigInt(input.priceCents), feesCents: BigInt(input.feesCents) };

      let result;
      try {
        result = type === 'BUY' ? applyContribution(position, trade) : applyRedemption(position, trade);
      } catch (err) {
        throw new BadRequestException((err as Error).message);
      }

      let transactionId: string | null = null;
      if (input.accountId) {
        transactionId = await this.createCashMovement(tx, {
          accountId: input.accountId,
          amountCents: result.totalCents,
          date: input.date,
          type,
          ticker: investment.ticker,
        });
      }

      const move = await tx.investmentTransaction.create({
        data: {
          investmentId: id,
          type,
          quantity,
          priceCents: BigInt(input.priceCents),
          feesCents: BigInt(input.feesCents),
          totalCents: result.totalCents,
          date: input.date,
          accountId: input.accountId ?? null,
          transactionId,
          avgPriceAfterCents: result.avgPriceCents,
          realizedGainCents: result.realizedGainCents,
          notes: input.notes,
        },
      });

      const updated = await tx.investment.update({
        where: { id },
        data: {
          quantity: result.quantity,
          investedCents: result.investedCents,
          avgPriceCents: result.avgPriceCents,
          realizedGainCents: investment.realizedGainCents + result.realizedGainCents,
          // Sem cotação ainda, o preço da operação serve de referência.
          currentPriceCents:
            investment.currentPriceCents === 0n
              ? BigInt(input.priceCents)
              : investment.currentPriceCents,
        },
      });

      return { investment: updated, trade: move };
    });
  }

  /** Desfaz um aporte/resgate: reverte o saldo e volta a posição ao estado anterior. */
  async removeTrade(id: string, tradeId: string) {
    return this.prisma.client.$transaction(async (tx) => {
      const trade = await tx.investmentTransaction.findFirst({
        where: { id: tradeId, investmentId: id },
      });
      if (!trade) throw new NotFoundException('Operação não encontrada');

      const investment = await tx.investment.findUnique({ where: { id } });
      if (!investment) throw new NotFoundException('Investimento não encontrado');

      if (trade.transactionId) await this.revertCashMovement(tx, trade.transactionId);
      await tx.investmentTransaction.delete({ where: { id: tradeId } });

      // Recalcula a posição do zero a partir das operações que sobraram: é mais
      // confiável que tentar "subtrair" a operação removida do estado atual.
      const remaining = await tx.investmentTransaction.findMany({
        where: { investmentId: id },
        orderBy: { date: 'asc' },
      });

      let position = { quantity: 0n, investedCents: 0n };
      let avgPriceCents = 0n;
      let realizedGainCents = 0n;
      for (const move of remaining) {
        const step =
          move.type === 'BUY'
            ? applyContribution(position, {
                quantity: move.quantity,
                priceCents: move.priceCents,
                feesCents: move.feesCents,
              })
            : applyRedemption(position, {
                quantity: move.quantity,
                priceCents: move.priceCents,
                feesCents: move.feesCents,
              });
        position = { quantity: step.quantity, investedCents: step.investedCents };
        avgPriceCents = step.avgPriceCents;
        realizedGainCents += step.realizedGainCents;
      }

      return tx.investment.update({
        where: { id },
        data: { ...position, avgPriceCents, realizedGainCents },
      });
    });
  }

  /** Cotação manual: atualiza a posição e grava o ponto no histórico. */
  async updatePrice(id: string, input: UpdatePriceInput) {
    await this.get(id);
    const date = input.date ?? new Date();
    const priceCents = BigInt(input.priceCents);

    const [investment] = await this.prisma.client.$transaction([
      this.prisma.client.investment.update({
        where: { id },
        data: { currentPriceCents: priceCents, priceUpdatedAt: date, source: 'MANUAL' },
      }),
      this.prisma.client.priceHistory.upsert({
        where: { investmentId_date: { investmentId: id, date } },
        create: { investmentId: id, date, priceCents },
        update: { priceCents },
      }),
    ]);

    return investment;
  }

  async setTargets(input: AllocationTargetsInput) {
    const total = input.targets.reduce((acc, target) => acc + target.targetPercent, 0);
    if (total > 100) {
      throw new BadRequestException(`A soma dos alvos é ${total}% — não pode passar de 100%.`);
    }

    await this.prisma.client.$transaction([
      this.prisma.client.allocationTarget.deleteMany({}),
      this.prisma.client.allocationTarget.createMany({
        data: input.targets.filter((target) => target.targetPercent > 0),
      }),
    ]);
    return this.prisma.client.allocationTarget.findMany();
  }

  // ─── Apoio ──────────────────────────────────────────────────────────────────

  private parseQuantity(raw: string): bigint {
    let quantity: bigint;
    try {
      quantity = toQuantity(raw);
    } catch {
      throw new BadRequestException(`Quantidade inválida: ${raw}`);
    }
    if (quantity <= 0n) throw new BadRequestException('A quantidade deve ser positiva.');
    return quantity;
  }

  /**
   * Movimento de caixa do aporte/resgate. É TRANSFER porque o dinheiro só muda
   * de lugar: sai da conta e vira posição (ou volta). Nunca receita/despesa.
   */
  private async createCashMovement(
    tx: Prisma.TransactionClient,
    input: { accountId: string; amountCents: bigint; date: Date; type: 'BUY' | 'SELL'; ticker: string },
  ): Promise<string> {
    const account = await tx.account.findUnique({ where: { id: input.accountId } });
    if (!account) throw new NotFoundException('Conta não encontrada');
    if (input.amountCents <= 0n) {
      throw new BadRequestException('O valor da operação precisa ser positivo.');
    }

    const buying = input.type === 'BUY';
    const created = await tx.transaction.create({
      data: {
        type: 'TRANSFER',
        amountCents: input.amountCents,
        date: input.date,
        description: `${buying ? 'Aporte' : 'Resgate'} · ${input.ticker}`,
        status: 'CLEARED',
        // Compra: sai da conta. Venda: entra na conta.
        fromAccountId: buying ? input.accountId : null,
        toAccountId: buying ? null : input.accountId,
      },
    });

    await tx.account.update({
      where: { id: input.accountId },
      data: { balanceCents: { increment: buying ? -input.amountCents : input.amountCents } },
    });

    return created.id;
  }

  /** Reverte o lançamento de caixa de uma operação desfeita. */
  private async revertCashMovement(tx: Prisma.TransactionClient, transactionId: string) {
    const movement = await tx.transaction.findUnique({ where: { id: transactionId } });
    if (!movement) return;

    const accountId = movement.fromAccountId ?? movement.toAccountId;
    if (accountId) {
      const delta = movement.fromAccountId ? movement.amountCents : -movement.amountCents;
      await tx.account.update({
        where: { id: accountId },
        data: { balanceCents: { increment: delta } },
      });
    }
    await tx.transaction.delete({ where: { id: transactionId } });
  }

  /** Chave "yyyy-MM" do mês de uma data — usado pelas telas de evolução. */
  monthKey(date: Date): string {
    return monthKeyInSaoPaulo(date);
  }

  /** Valor de mercado de uma posição — exposto para reuso em relatórios. */
  marketValue(quantity: bigint, priceCents: bigint): bigint {
    return costOfCents(quantity, priceCents);
  }
}
