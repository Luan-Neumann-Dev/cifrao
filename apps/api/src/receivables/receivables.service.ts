import { Injectable } from '@nestjs/common';
import type { Prisma } from '@cifrao/db';
import { PrismaService } from '../prisma/prisma.service';

const include = {
  account: { select: { id: true, name: true, color: true } },
  category: { select: { id: true, name: true, color: true, icon: true } },
  creditCard: { select: { id: true, nickname: true, color: true } },
  tags: { include: { tag: true } },
} satisfies Prisma.TransactionInclude;

/**
 * Regra 5.13 — reembolsáveis. Um lançamento marcado como reembolsável entra em
 * "A receber" com status pendente até ser marcado como recebido (`reimbursedAt`).
 * Marcar como recebido é um PATCH no próprio lançamento; aqui só se agrega.
 */
@Injectable()
export class ReceivablesService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const [pending, received] = await Promise.all([
      this.prisma.client.transaction.findMany({
        where: { isReimbursable: true, reimbursedAt: null, status: { not: 'FORECAST' } },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        include,
      }),
      this.prisma.client.transaction.findMany({
        where: { isReimbursable: true, reimbursedAt: { not: null } },
        orderBy: { reimbursedAt: 'desc' },
        take: 30,
        include,
      }),
    ]);

    const sum = (rows: { amountCents: bigint }[]) => rows.reduce((acc, r) => acc + r.amountCents, 0n);

    return {
      pending,
      pendingTotalCents: sum(pending),
      pendingCount: pending.length,
      received,
      receivedTotalCents: sum(received),
    };
  }
}
