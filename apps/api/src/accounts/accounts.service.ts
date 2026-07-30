import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@cifrao/db';
import {
  type AdjustBalanceInput,
  type CreateAccountInput,
  type UpdateAccountInput,
  accountDeltaCents,
  computeAdjustmentDeltaCents,
  monthKeyInSaoPaulo,
  recentMonthKeys,
} from '@cifrao/shared';
import { PrismaService } from '../prisma/prisma.service';

type Tx = Prisma.TransactionClient | PrismaClient;

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.client.account.findMany({ orderBy: { createdAt: 'asc' } });
  }

  async get(id: string) {
    const account = await this.prisma.client.account.findUnique({ where: { id } });
    if (!account) throw new NotFoundException('Conta não encontrada');
    return account;
  }

  create(input: CreateAccountInput) {
    return this.prisma.client.account.create({
      data: {
        name: input.name,
        type: input.type,
        balanceCents: BigInt(input.initialBalanceCents),
        color: input.color,
        institution: input.institution,
      },
    });
  }

  async update(id: string, input: UpdateAccountInput) {
    await this.get(id);
    return this.prisma.client.account.update({ where: { id }, data: input });
  }

  async remove(id: string) {
    await this.get(id);
    const linked = await this.prisma.client.transaction.count({
      where: { OR: [{ accountId: id }, { fromAccountId: id }, { toAccountId: id }] },
    });
    if (linked > 0) {
      throw new BadRequestException('Conta possui lançamentos; arquive-a em vez de excluir.');
    }
    await this.prisma.client.account.delete({ where: { id } });
    return { ok: true };
  }

  /** Regra 5.8: cria um lançamento ADJUSTMENT da diferença, sem apagar histórico. */
  async adjustBalance(id: string, input: AdjustBalanceInput) {
    return this.prisma.client.$transaction(async (tx) => {
      const account = await tx.account.findUnique({ where: { id } });
      if (!account) throw new NotFoundException('Conta não encontrada');

      const delta = computeAdjustmentDeltaCents(input.realBalanceCents, account.balanceCents);
      if (delta === 0n) return { account, transaction: null };

      const category = await this.getOrCreateAdjustmentCategory(tx);
      const transaction = await tx.transaction.create({
        data: {
          type: 'ADJUSTMENT',
          amountCents: delta,
          date: input.date ?? new Date(),
          description: input.description ?? 'Ajuste de saldo',
          status: 'CLEARED',
          accountId: id,
          categoryId: category.id,
        },
      });
      const updated = await tx.account.update({
        where: { id },
        data: { balanceCents: { increment: delta } },
      });
      return { account: updated, transaction };
    });
  }

  /** Saldo ao fim de cada um dos últimos `months` meses (fuso de São Paulo). */
  async balanceEvolution(id: string, months = 6) {
    const account = await this.get(id);
    const txs = await this.prisma.client.transaction.findMany({
      where: {
        OR: [{ accountId: id }, { fromAccountId: id }, { toAccountId: id }],
        status: { not: 'FORECAST' },
      },
      select: {
        type: true,
        amountCents: true,
        date: true,
        accountId: true,
        fromAccountId: true,
        toAccountId: true,
      },
    });

    const deltaByMonth = new Map<string, bigint>();
    for (const t of txs) {
      const key = monthKeyInSaoPaulo(t.date);
      deltaByMonth.set(key, (deltaByMonth.get(key) ?? 0n) + accountDeltaCents(t, id));
    }

    const keys = recentMonthKeys(months); // mais antigo -> mais recente
    const endBalances: Record<string, bigint> = {};
    let running = account.balanceCents;
    for (let i = keys.length - 1; i >= 0; i--) {
      const key = keys[i];
      endBalances[key] = running;
      running -= deltaByMonth.get(key) ?? 0n;
    }
    return keys.map((month) => ({ month, balanceCents: endBalances[month] }));
  }

  private async getOrCreateAdjustmentCategory(tx: Tx) {
    const existing = await tx.category.findFirst({ where: { name: 'Ajuste' } });
    if (existing) return existing;
    return tx.category.create({
      data: { name: 'Ajuste', kind: 'BOTH', icon: 'wrench', color: '#6B6577' },
    });
  }
}
