import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PurchasesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Compra parcelada com o cronograma inteiro (regra 5.4). A tela do cartão usa
   * isto para abrir a parcela "3/6" e mostrar em que fatura cai cada uma das
   * seis — inclusive as que ainda não venceram.
   */
  async get(id: string) {
    const purchase = await this.prisma.client.purchase.findUnique({
      where: { id },
      include: {
        category: { select: { id: true, name: true, color: true, icon: true } },
        transactions: {
          orderBy: { installmentNumber: 'asc' },
          select: {
            id: true,
            amountCents: true,
            date: true,
            status: true,
            installmentNumber: true,
            invoiceId: true,
            invoice: {
              select: { id: true, referenceMonth: true, dueDate: true, paidCents: true },
            },
          },
        },
      },
    });
    if (!purchase) throw new NotFoundException('Compra não encontrada');

    const { transactions, ...rest } = purchase;
    return {
      ...rest,
      installments: transactions.map((t) => ({
        transactionId: t.id,
        installmentNumber: t.installmentNumber,
        amountCents: t.amountCents,
        date: t.date,
        status: t.status,
        invoiceId: t.invoiceId,
        referenceMonth: t.invoice?.referenceMonth ?? null,
        dueDate: t.invoice?.dueDate ?? null,
        /** A fatura já foi paga? Serve para a UI apagar a parcela quitada. */
        invoicePaid: t.invoice ? t.invoice.paidCents > 0n : false,
      })),
    };
  }
}
