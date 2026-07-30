import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@cifrao/db';
import {
  type BulkActionInput,
  type CreateTransactionInput,
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
      return this.findByIdOrThrow(tx, id);
    });
  }

  async remove(id: string) {
    return this.prisma.client.$transaction(async (tx) => {
      const old = await tx.transaction.findUnique({ where: { id } });
      if (!old) throw new NotFoundException('Lançamento não encontrado');
      await this.applyBalance(tx, old, -1);
      await tx.transaction.delete({ where: { id } });
      return { ok: true };
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
      for (const row of rows) await this.applyBalance(tx, row, -1);
      await tx.transaction.deleteMany({ where: { id: { in: input.ids } } });
      return { count: rows.length };
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
