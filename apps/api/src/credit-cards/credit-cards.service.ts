import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Invoice, Prisma, PrismaClient } from '@cifrao/db';
import {
  type CreateCardPurchaseInput,
  type CreateCreditCardInput,
  type InvoiceWindow,
  type UpdateCreditCardInput,
  addMonths,
  classifyInvoicesForAvailability,
  deriveInvoiceStatus,
  installmentDateParts,
  installmentWindows,
  monthKeyInSaoPaulo,
  saoPauloDateParts,
  saoPauloWallClockToUtc,
  splitInstallments,
} from '@cifrao/shared';
import { PrismaService } from '../prisma/prisma.service';

type Tx = Prisma.TransactionClient | PrismaClient;

@Injectable()
export class CreditCardsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Lista os cartões com o resumo de disponível de verdade (regra 5.5) de cada. */
  async list(userId: string) {
    const cards = await this.prisma.client.creditCard.findMany({
      where: { userId, archived: false },
      orderBy: { createdAt: 'asc' },
    });
    if (cards.length === 0) return [];

    const invoices = await this.prisma.client.invoice.findMany({
      where: { userId, creditCardId: { in: cards.map((c) => c.id) } },
    });
    const totals = await this.invoiceTotals(
      this.prisma.client,
      userId,
      invoices.map((i) => i.id),
    );
    const now = new Date();

    return cards.map((card) => {
      const cardInvoices = invoices.filter((i) => i.creditCardId === card.id);
      const breakdown = classifyInvoicesForAvailability(
        cardInvoices.map((i) => ({
          closingDate: i.closingDate,
          totalCents: totals.get(i.id) ?? 0n,
          paidCents: i.paidCents,
        })),
        card.limitCents,
        now,
      );
      return { ...card, availability: breakdown };
    });
  }

  async get(userId: string, id: string) {
    const card = await this.prisma.client.creditCard.findFirst({ where: { id, userId } });
    if (!card) throw new NotFoundException('Cartão não encontrado');

    const invoices = await this.prisma.client.invoice.findMany({
      where: { userId, creditCardId: id },
      orderBy: { referenceMonth: 'desc' },
    });
    const totals = await this.invoiceTotals(
      this.prisma.client,
      userId,
      invoices.map((i) => i.id),
    );
    const now = new Date();

    const invoicesWithTotals = invoices.map((i) => {
      const totalCents = totals.get(i.id) ?? 0n;
      return {
        ...i,
        totalCents,
        remainingCents: totalCents - i.paidCents,
        status: deriveInvoiceStatus({
          totalCents,
          paidCents: i.paidCents,
          closingDate: i.closingDate,
          now,
        }),
      };
    });

    const availability = classifyInvoicesForAvailability(
      invoices.map((i) => ({
        closingDate: i.closingDate,
        totalCents: totals.get(i.id) ?? 0n,
        paidCents: i.paidCents,
      })),
      card.limitCents,
      now,
    );

    return { ...card, availability, invoices: invoicesWithTotals };
  }

  async create(userId: string, input: CreateCreditCardInput) {
    // Conta de pagamento padrão tem que ser do próprio usuário.
    if (input.defaultPaymentAccountId) {
      await this.ensureAccount(userId, input.defaultPaymentAccountId);
    }
    return this.prisma.client.creditCard.create({
      data: {
        userId,
        nickname: input.nickname,
        brand: input.brand,
        last4: input.last4,
        limitCents: BigInt(input.limitCents),
        closingDay: input.closingDay,
        dueDay: input.dueDay,
        color: input.color,
        defaultPaymentAccountId: input.defaultPaymentAccountId ?? undefined,
      },
    });
  }

  async update(userId: string, id: string, input: UpdateCreditCardInput) {
    await this.ensureExists(userId, id);
    if (input.defaultPaymentAccountId) {
      await this.ensureAccount(userId, input.defaultPaymentAccountId);
    }
    const data: Prisma.CreditCardUncheckedUpdateInput = {};
    if (input.nickname !== undefined) data.nickname = input.nickname;
    if (input.brand !== undefined) data.brand = input.brand;
    if (input.last4 !== undefined) data.last4 = input.last4;
    if (input.limitCents !== undefined) data.limitCents = BigInt(input.limitCents);
    if (input.closingDay !== undefined) data.closingDay = input.closingDay;
    if (input.dueDay !== undefined) data.dueDay = input.dueDay;
    if (input.color !== undefined) data.color = input.color;
    if (input.defaultPaymentAccountId !== undefined)
      data.defaultPaymentAccountId = input.defaultPaymentAccountId;
    if (input.archived !== undefined) data.archived = input.archived;
    return this.prisma.client.creditCard.update({ where: { id }, data });
  }

  async remove(userId: string, id: string) {
    await this.ensureExists(userId, id);
    const linked = await this.prisma.client.transaction.count({
      where: { userId, creditCardId: id },
    });
    if (linked > 0) {
      throw new BadRequestException('Cartão possui lançamentos; arquive-o em vez de excluir.');
    }
    await this.prisma.client.creditCard.delete({ where: { id } });
    return { ok: true };
  }

  /**
   * Regra 5.4: uma compra parcelada gera 1 Purchase pai e N Transaction filhas,
   * cada uma roteada para a fatura do mês correspondente (regra 5.3).
   */
  async createPurchase(userId: string, cardId: string, input: CreateCardPurchaseInput) {
    return this.prisma.client.$transaction(async (tx) => {
      const card = await tx.creditCard.findFirst({ where: { id: cardId, userId } });
      if (!card) throw new NotFoundException('Cartão não encontrado');
      if (input.categoryId) {
        const cat = await tx.category.count({
          where: { id: input.categoryId, OR: [{ userId }, { userId: null }] },
        });
        if (cat === 0) throw new NotFoundException('Categoria informada não existe');
      }
      if (input.tagIds?.length) {
        const unique = [...new Set(input.tagIds)];
        const tags = await tx.tag.count({ where: { userId, id: { in: unique } } });
        if (tags !== unique.length) throw new NotFoundException('Tag informada não existe');
      }

      const purchaseParts = saoPauloDateParts(input.date);
      const windows = installmentWindows(purchaseParts, card.closingDay, card.dueDay, input.installments);
      const amounts = splitInstallments(BigInt(input.amountCents), input.installments);
      const parcelado = input.installments > 1;

      let purchaseId: string | undefined;
      if (parcelado) {
        const purchase = await tx.purchase.create({
          data: {
            userId,
            creditCardId: cardId,
            description: input.description,
            totalCents: BigInt(input.amountCents),
            installmentTotal: input.installments,
            purchaseDate: input.date,
            categoryId: input.categoryId ?? undefined,
          },
        });
        purchaseId = purchase.id;
      }

      const invoiceIds: string[] = [];
      for (let i = 0; i < input.installments; i++) {
        const invoice = await this.getOrCreateInvoice(tx, userId, cardId, windows[i]);
        invoiceIds.push(invoice.id);

        const dp = installmentDateParts(purchaseParts, i);
        const date = i === 0 ? input.date : saoPauloWallClockToUtc(dp.year, dp.month, dp.day);
        const description = parcelado
          ? `${input.description} (${i + 1}/${input.installments})`
          : input.description;

        await tx.transaction.create({
          data: {
            userId,
            type: 'EXPENSE',
            amountCents: amounts[i],
            date,
            description,
            status: input.status,
            notes: i === 0 ? input.notes : undefined,
            isReimbursable: input.isReimbursable,
            creditCardId: cardId,
            invoiceId: invoice.id,
            purchaseId,
            installmentNumber: parcelado ? i + 1 : undefined,
            installmentTotal: parcelado ? input.installments : undefined,
            categoryId: input.categoryId ?? undefined,
            tags:
              i === 0 && input.tagIds?.length
                ? { create: input.tagIds.map((tagId) => ({ tagId })) }
                : undefined,
          },
        });
      }

      return { installments: input.installments, purchaseId, invoiceIds };
    });
  }

  /** Dados do gráfico de comprometimento nos próximos 12 meses (regra da Fase 3). */
  async commitment(userId: string, cardId: string) {
    await this.ensureExists(userId, cardId);
    const [refY, refM] = monthKeyInSaoPaulo(new Date()).split('-').map(Number);
    const keys: string[] = [];
    for (let i = 0; i < 12; i++) {
      const { year, month } = addMonths(refY, refM, i);
      keys.push(`${year}-${String(month).padStart(2, '0')}`);
    }

    const invoices = await this.prisma.client.invoice.findMany({
      where: { userId, creditCardId: cardId, referenceMonth: { in: keys } },
    });
    const totals = await this.invoiceTotals(
      this.prisma.client,
      userId,
      invoices.map((i) => i.id),
    );
    const byMonth = new Map<string, { totalCents: bigint; paidCents: bigint }>();
    for (const inv of invoices) {
      byMonth.set(inv.referenceMonth, {
        totalCents: totals.get(inv.id) ?? 0n,
        paidCents: inv.paidCents,
      });
    }

    return keys.map((month) => {
      const entry = byMonth.get(month) ?? { totalCents: 0n, paidCents: 0n };
      return {
        month,
        totalCents: entry.totalCents,
        remainingCents: entry.totalCents - entry.paidCents,
      };
    });
  }

  // ── Internos ────────────────────────────────────────────────────────────────

  private async getOrCreateInvoice(
    tx: Tx,
    userId: string,
    cardId: string,
    w: InvoiceWindow,
  ): Promise<Invoice> {
    const closingDate = saoPauloWallClockToUtc(w.closing.year, w.closing.month, w.closing.day, '23:59:59');
    const dueDate = saoPauloWallClockToUtc(w.due.year, w.due.month, w.due.day);
    return tx.invoice.upsert({
      where: { creditCardId_referenceMonth: { creditCardId: cardId, referenceMonth: w.referenceMonth } },
      create: { userId, creditCardId: cardId, referenceMonth: w.referenceMonth, closingDate, dueDate },
      update: {},
    });
  }

  private async invoiceTotals(
    client: Tx,
    userId: string,
    ids: string[],
  ): Promise<Map<string, bigint>> {
    if (ids.length === 0) return new Map();
    const grouped = await client.transaction.groupBy({
      by: ['invoiceId'],
      where: { userId, invoiceId: { in: ids }, type: 'EXPENSE', status: { not: 'FORECAST' } },
      _sum: { amountCents: true },
    });
    const map = new Map<string, bigint>();
    for (const g of grouped) {
      if (g.invoiceId) map.set(g.invoiceId, g._sum.amountCents ?? 0n);
    }
    return map;
  }

  private async ensureExists(userId: string, id: string) {
    const found = await this.prisma.client.creditCard.findFirst({ where: { id, userId } });
    if (!found) throw new NotFoundException('Cartão não encontrado');
  }

  private async ensureAccount(userId: string, accountId: string) {
    const found = await this.prisma.client.account.count({ where: { id: accountId, userId } });
    if (found === 0) throw new NotFoundException('Conta de pagamento não encontrada');
  }
}
