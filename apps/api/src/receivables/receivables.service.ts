import { Injectable } from '@nestjs/common';
import type { Prisma } from '@cifrao/db';
import { PrismaService } from '../prisma/prisma.service';

const include = {
  account: { select: { id: true, name: true, color: true } },
  category: { select: { id: true, name: true, color: true, icon: true } },
  creditCard: { select: { id: true, nickname: true, color: true } },
  tags: { include: { tag: true } },
  reimbursements: {
    orderBy: { date: 'asc' },
    select: {
      id: true,
      amountCents: true,
      date: true,
      account: { select: { id: true, name: true, color: true } },
    },
  },
} satisfies Prisma.TransactionInclude;

/**
 * Regra 5.13 — reembolsáveis. Um lançamento marcado como reembolsável entra em
 * "A receber" e continua pendente até os estornos cobrirem o valor cheio. O
 * estorno (criado por `POST /transactions/:id/reimburse`) credita a conta e
 * abate o gasto da categoria — nunca conta como receita.
 */
@Injectable()
export class ReceivablesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    const [pendingRows, receivedRows] = await Promise.all([
      this.prisma.client.transaction.findMany({
        where: {
          userId,
          isReimbursable: true,
          reimbursedAt: null,
          type: 'EXPENSE',
          status: { not: 'FORECAST' },
        },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        include,
      }),
      this.prisma.client.transaction.findMany({
        where: { userId, isReimbursable: true, reimbursedAt: { not: null } },
        orderBy: { reimbursedAt: 'desc' },
        take: 30,
        include,
      }),
    ]);

    const withProgress = (rows: typeof pendingRows) =>
      rows.map((tx) => {
        const reimbursedCents = tx.reimbursements.reduce((acc, r) => acc + r.amountCents, 0n);
        const rest = tx.amountCents - reimbursedCents;
        return {
          ...tx,
          reimbursedCents,
          remainingCents: rest > 0n ? rest : 0n,
          partial: reimbursedCents > 0n && reimbursedCents < tx.amountCents,
        };
      });

    const pending = withProgress(pendingRows);
    const received = withProgress(receivedRows);

    return {
      pending,
      // O que ainda falta entrar (desconta reembolsos parciais já recebidos).
      pendingTotalCents: pending.reduce((acc, t) => acc + t.remainingCents, 0n),
      pendingCount: pending.length,
      /** Total bruto dos gastos pendentes, antes dos parciais. */
      pendingGrossCents: pending.reduce((acc, t) => acc + t.amountCents, 0n),
      received,
      receivedTotalCents: received.reduce((acc, t) => acc + t.reimbursedCents, 0n),
    };
  }
}
