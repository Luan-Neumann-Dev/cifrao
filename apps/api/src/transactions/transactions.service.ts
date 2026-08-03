import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@cifrao/db';
import {
  type BulkActionInput,
  type CreateTransactionInput,
  type ReimburseInput,
  type TransactionFilter,
  type UpdateTransactionInput,
  accountDeltaCents,
} from '@cifrao/shared';
import { PrismaService } from '../prisma/prisma.service';

const txInclude = {
  account: { select: { id: true, name: true, color: true } },
  fromAccount: { select: { id: true, name: true, color: true } },
  toAccount: { select: { id: true, name: true, color: true } },
  category: { select: { id: true, name: true, color: true, icon: true } },
  tags: { include: { tag: true } },
} satisfies Prisma.TransactionInclude;

type TxClient = Prisma.TransactionClient;
type TxRow = {
  type: string;
  amountCents: bigint;
  status: string;
  accountId: string | null;
  fromAccountId: string | null;
  toAccountId: string | null;
};

@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(filter: TransactionFilter) {
    const where: Prisma.TransactionWhereInput = {};
    if (filter.type) where.type = filter.type;
    if (filter.status) where.status = filter.status;
    if (filter.categoryId) where.categoryId = filter.categoryId;
    if (filter.tagId) where.tags = { some: { tagId: filter.tagId } };
    if (filter.accountId) {
      where.OR = [
        { accountId: filter.accountId },
        { fromAccountId: filter.accountId },
        { toAccountId: filter.accountId },
      ];
    }
    if (filter.from || filter.to) {
      where.date = { ...(filter.from ? { gte: filter.from } : {}), ...(filter.to ? { lte: filter.to } : {}) };
    }
    if (filter.search) {
      where.description = { contains: filter.search, mode: 'insensitive' };
    }

    const [items, total] = await Promise.all([
      this.prisma.client.transaction.findMany({
        where,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        skip: (filter.page - 1) * filter.pageSize,
        take: filter.pageSize,
        include: txInclude,
      }),
      this.prisma.client.transaction.count({ where }),
    ]);
    return { items, total, page: filter.page, pageSize: filter.pageSize };
  }

  get(id: string) {
    return this.findByIdOrThrow(this.prisma.client, id);
  }

  async create(input: CreateTransactionInput) {
    return this.prisma.client.$transaction(async (tx) => {
      await this.ensureAccounts(tx, input);
      let data: Prisma.TransactionUncheckedCreateInput;
      if (input.type === 'TRANSFER') {
        data = {
          type: 'TRANSFER',
          amountCents: BigInt(input.amountCents),
          date: input.date,
          description: input.description,
          status: input.status,
          notes: input.notes,
          fromAccountId: input.fromAccountId,
          toAccountId: input.toAccountId,
        };
      } else {
        data = {
          type: input.type,
          amountCents: BigInt(input.amountCents),
          date: input.date,
          description: input.description,
          status: input.status,
          notes: input.notes,
          isReimbursable: input.isReimbursable,
          accountId: input.accountId,
          categoryId: input.categoryId ?? undefined,
          tags: input.tagIds?.length ? { create: input.tagIds.map((tagId) => ({ tagId })) } : undefined,
        };
      }
      const created = await tx.transaction.create({ data });
      await this.applyBalance(tx, created, 1);
      return this.findByIdOrThrow(tx, created.id);
    });
  }

  async update(id: string, input: UpdateTransactionInput) {
    return this.prisma.client.$transaction(async (tx) => {
      const old = await tx.transaction.findUnique({ where: { id } });
      if (!old) throw new NotFoundException('Lançamento não encontrado');
      await this.applyBalance(tx, old, -1);

      const data: Prisma.TransactionUncheckedUpdateInput = {};
      if (input.amountCents !== undefined) data.amountCents = BigInt(input.amountCents);
      if (input.date !== undefined) data.date = input.date;
      if (input.description !== undefined) data.description = input.description;
      if (input.status !== undefined) data.status = input.status;
      if (input.notes !== undefined) data.notes = input.notes;
      if (input.categoryId !== undefined) data.categoryId = input.categoryId;
      if (input.isReimbursable !== undefined) data.isReimbursable = input.isReimbursable;
      if (input.reimbursedAt !== undefined) data.reimbursedAt = input.reimbursedAt;
      if (input.tagIds) {
        data.tags = { deleteMany: {}, create: input.tagIds.map((tagId) => ({ tagId })) };
      }

      const updated = await tx.transaction.update({ where: { id }, data });
      await this.applyBalance(tx, updated, 1);
      // Mexer no valor de um estorno muda o quanto do gasto foi reembolsado.
      if (old.reimbursesTransactionId) {
        await this.syncReimbursedAt(tx, old.reimbursesTransactionId);
      }
      return this.findByIdOrThrow(tx, id);
    });
  }

  async remove(id: string) {
    return this.prisma.client.$transaction(async (tx) => {
      const old = await tx.transaction.findUnique({ where: { id } });
      if (!old) throw new NotFoundException('Lançamento não encontrado');
      await this.deleteWithRefunds(tx, old);
      return { ok: true };
    });
  }

  /**
   * Regra 5.13 — registra o recebimento de um reembolsável criando um estorno
   * vinculado ao gasto original. O estorno credita a conta escolhida, herda a
   * categoria do gasto (para abatê-lo nos relatórios) e nunca conta como
   * receita. Sem `amountCents`, estorna o que falta — suporta reembolso parcial.
   */
  async reimburse(id: string, input: ReimburseInput) {
    return this.prisma.client.$transaction(async (tx) => {
      const original = await tx.transaction.findUnique({
        where: { id },
        include: { reimbursements: { select: { amountCents: true } } },
      });
      if (!original) throw new NotFoundException('Lançamento não encontrado');
      if (original.type !== 'EXPENSE') {
        throw new BadRequestException('Só uma despesa pode ser reembolsada.');
      }
      if (!original.isReimbursable) {
        throw new BadRequestException('Lançamento não está marcado como reembolsável.');
      }
      if (original.status === 'FORECAST') {
        throw new BadRequestException('Efetive o lançamento previsto antes de registrar o reembolso.');
      }

      const already = original.reimbursements.reduce((acc, r) => acc + r.amountCents, 0n);
      const remaining = original.amountCents - already;
      if (remaining <= 0n) throw new BadRequestException('Este gasto já foi totalmente reembolsado.');

      const amount = input.amountCents === undefined ? remaining : BigInt(input.amountCents);
      if (amount > remaining) {
        throw new BadRequestException('Valor acima do que falta reembolsar.');
      }

      const account = await tx.account.findUnique({ where: { id: input.accountId } });
      if (!account) throw new NotFoundException('Conta de recebimento não encontrada');

      const date = input.date ?? new Date();
      const refund = await tx.transaction.create({
        data: {
          type: 'INCOME',
          amountCents: amount,
          date,
          description: `Reembolso · ${original.description}`,
          status: 'CLEARED',
          accountId: input.accountId,
          categoryId: original.categoryId,
          reimbursesTransactionId: original.id,
        },
      });
      await this.applyBalance(tx, refund, 1);

      const reimbursedCents = already + amount;
      const settled = reimbursedCents >= original.amountCents;
      await tx.transaction.update({
        where: { id },
        data: { reimbursedAt: settled ? date : null },
      });

      return {
        refund,
        original: await this.findByIdOrThrow(tx, id),
        reimbursedCents,
        remainingCents: original.amountCents - reimbursedCents,
        settled,
      };
    });
  }

  /** Desfaz o recebimento: apaga os estornos do gasto e devolve o saldo. */
  async undoReimburse(id: string) {
    return this.prisma.client.$transaction(async (tx) => {
      const original = await tx.transaction.findUnique({
        where: { id },
        include: { reimbursements: true },
      });
      if (!original) throw new NotFoundException('Lançamento não encontrado');

      for (const refund of original.reimbursements) {
        await this.applyBalance(tx, refund, -1);
      }
      await tx.transaction.deleteMany({ where: { reimbursesTransactionId: id } });
      await tx.transaction.update({ where: { id }, data: { reimbursedAt: null } });
      return { ok: true, removed: original.reimbursements.length };
    });
  }

  async bulk(input: BulkActionInput) {
    return this.prisma.client.$transaction(async (tx) => {
      if (input.action === 'categorize') {
        const r = await tx.transaction.updateMany({
          where: { id: { in: input.ids } },
          data: { categoryId: input.categoryId },
        });
        return { count: r.count };
      }
      if (input.action === 'addTag') {
        await tx.transactionTag.createMany({
          data: input.ids.map((transactionId) => ({ transactionId, tagId: input.tagId })),
          skipDuplicates: true,
        });
        return { count: input.ids.length };
      }
      if (input.action === 'setStatus') {
        const rows = await tx.transaction.findMany({ where: { id: { in: input.ids } } });
        for (const row of rows) {
          if (row.status === input.status) continue;
          await this.applyBalance(tx, row, -1);
          await tx.transaction.update({ where: { id: row.id }, data: { status: input.status } });
          await this.applyBalance(tx, { ...row, status: input.status }, 1);
        }
        return { count: rows.length };
      }
      // delete
      const rows = await tx.transaction.findMany({ where: { id: { in: input.ids } } });
      for (const row of rows) await this.deleteWithRefunds(tx, row);
      return { count: rows.length };
    });
  }

  /**
   * Exclui um lançamento revertendo o saldo. Se ele tinha estornos de reembolso
   * (5.13), eles saem junto — com o saldo revertido também, nunca por cascade do
   * banco. Se ele É um estorno, o gasto de origem volta a ficar pendente.
   */
  private async deleteWithRefunds(tx: TxClient, row: Prisma.TransactionGetPayload<object>) {
    const refunds = await tx.transaction.findMany({ where: { reimbursesTransactionId: row.id } });
    for (const refund of refunds) {
      await this.applyBalance(tx, refund, -1);
    }
    if (refunds.length > 0) {
      await tx.transaction.deleteMany({ where: { reimbursesTransactionId: row.id } });
    }
    await this.applyBalance(tx, row, -1);
    await tx.transaction.delete({ where: { id: row.id } });
    if (row.reimbursesTransactionId) {
      await this.syncReimbursedAt(tx, row.reimbursesTransactionId);
    }
  }

  /** Recalcula `reimbursedAt` do gasto a partir da soma dos estornos vivos. */
  private async syncReimbursedAt(tx: TxClient, originalId: string) {
    const original = await tx.transaction.findUnique({
      where: { id: originalId },
      include: { reimbursements: { orderBy: { date: 'desc' }, select: { amountCents: true, date: true } } },
    });
    if (!original) return;
    const total = original.reimbursements.reduce((acc, r) => acc + r.amountCents, 0n);
    const settled = total >= original.amountCents && original.reimbursements.length > 0;
    await tx.transaction.update({
      where: { id: originalId },
      data: { reimbursedAt: settled ? original.reimbursements[0].date : null },
    });
  }

  /** Aplica (sign=+1) ou reverte (sign=-1) o efeito do lançamento nos saldos. */
  private async applyBalance(tx: TxClient, row: TxRow, sign: 1 | -1) {
    if (row.status === 'FORECAST') return; // previsto não move saldo real
    const accounts = new Set<string>();
    if (row.accountId) accounts.add(row.accountId);
    if (row.fromAccountId) accounts.add(row.fromAccountId);
    if (row.toAccountId) accounts.add(row.toAccountId);
    for (const accountId of accounts) {
      const delta = accountDeltaCents(row as never, accountId) * BigInt(sign);
      if (delta !== 0n) {
        await tx.account.update({ where: { id: accountId }, data: { balanceCents: { increment: delta } } });
      }
    }
  }

  private async ensureAccounts(tx: TxClient, input: CreateTransactionInput) {
    const ids =
      input.type === 'TRANSFER' ? [input.fromAccountId, input.toAccountId] : [input.accountId];
    const found = await tx.account.count({ where: { id: { in: ids } } });
    if (found !== new Set(ids).size) {
      throw new NotFoundException('Conta informada não existe');
    }
  }

  private async findByIdOrThrow(tx: TxClient | PrismaService['client'], id: string) {
    const found = await tx.transaction.findUnique({ where: { id }, include: txInclude });
    if (!found) throw new NotFoundException('Lançamento não encontrado');
    return found;
  }
}
