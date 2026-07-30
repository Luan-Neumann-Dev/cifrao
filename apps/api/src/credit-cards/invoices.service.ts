import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { type PayInvoiceInput, deriveInvoiceStatus } from '@cifrao/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Detalhe da fatura: cartão, lançamentos (compras) e total/restante/status. */
  async get(id: string) {
    const invoice = await this.prisma.client.invoice.findUnique({
      where: { id },
      include: {
        creditCard: { select: { id: true, nickname: true, color: true, limitCents: true } },
      },
    });
    if (!invoice) throw new NotFoundException('Fatura não encontrada');

    const transactions = await this.prisma.client.transaction.findMany({
      where: { invoiceId: id },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      include: {
        category: { select: { id: true, name: true, color: true, icon: true } },
        fromAccount: { select: { id: true, name: true, color: true } },
        tags: { include: { tag: true } },
      },
    });

    // Total = despesas (compras) da fatura; pagamentos (TRANSFER) não somam.
    let totalCents = 0n;
    for (const t of transactions) {
      if (t.type === 'EXPENSE' && t.status !== 'FORECAST') totalCents += t.amountCents;
      if (t.type === 'INCOME' && t.status !== 'FORECAST') totalCents -= t.amountCents; // estornos
    }

    return {
      ...invoice,
      totalCents,
      remainingCents: totalCents - invoice.paidCents,
      status: deriveInvoiceStatus({
        totalCents,
        paidCents: invoice.paidCents,
        closingDate: invoice.closingDate,
      }),
      transactions,
    };
  }

  /**
   * Regra 5.6: pagar fatura move dinheiro da conta para o cartão. É uma
   * TRANSFER (fromAccountId + invoiceId), NUNCA uma despesa — os gastos já foram
   * contados quando lançados. Suporta pagamento total e parcial (PARTIAL).
   */
  async pay(id: string, input: PayInvoiceInput) {
    return this.prisma.client.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({
        where: { id },
        include: { creditCard: { select: { nickname: true } } },
      });
      if (!invoice) throw new NotFoundException('Fatura não encontrada');

      const account = await tx.account.findUnique({ where: { id: input.accountId } });
      if (!account) throw new NotFoundException('Conta de pagamento não encontrada');

      const agg = await tx.transaction.aggregate({
        where: { invoiceId: id, type: 'EXPENSE', status: { not: 'FORECAST' } },
        _sum: { amountCents: true },
      });
      const totalCents = agg._sum.amountCents ?? 0n;
      const remaining = totalCents - invoice.paidCents;
      if (remaining <= 0n) throw new BadRequestException('Fatura já está quitada.');

      const amount = BigInt(input.amountCents);
      if (amount > remaining) {
        throw new BadRequestException('Valor acima do restante da fatura.');
      }

      const payment = await tx.transaction.create({
        data: {
          type: 'TRANSFER',
          amountCents: amount,
          date: input.date ?? new Date(),
          description: `Pagamento fatura ${invoice.referenceMonth} · ${invoice.creditCard.nickname}`,
          status: 'CLEARED',
          fromAccountId: input.accountId,
          invoiceId: id,
        },
      });

      // Debita a conta de origem (a TRANSFER não conta como despesa em relatório).
      await tx.account.update({
        where: { id: input.accountId },
        data: { balanceCents: { increment: -amount } },
      });

      const newPaid = invoice.paidCents + amount;
      const status = newPaid >= totalCents ? 'PAID' : 'PARTIAL';
      const updated = await tx.invoice.update({
        where: { id },
        data: { paidCents: newPaid, status },
      });

      return {
        invoice: updated,
        payment,
        totalCents,
        remainingCents: totalCents - newPaid,
      };
    });
  }
}
