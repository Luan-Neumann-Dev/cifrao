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

  list(userId: string) {
    return this.prisma.client.account.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * `findFirst` com userId em vez de `findUnique` por id: um id que existe mas
   * é de outro usuário tem que responder 404, não devolver o registro.
   */
  async get(userId: string, id: string) {
    const account = await this.prisma.client.account.findFirst({ where: { id, userId } });
    if (!account) throw new NotFoundException('Conta não encontrada');
    return account;
  }

  create(userId: string, input: CreateAccountInput) {
    return this.prisma.client.account.create({
      data: {
        userId,
        name: input.name,
        type: input.type,
        balanceCents: BigInt(input.initialBalanceCents),
        color: input.color,
        institution: input.institution,
      },
    });
  }

  async update(userId: string, id: string, input: UpdateAccountInput) {
    await this.get(userId, id);
    return this.prisma.client.account.update({ where: { id }, data: input });
  }

  async remove(userId: string, id: string) {
    await this.get(userId, id);
    const linked = await this.prisma.client.transaction.count({
      where: { userId, OR: [{ accountId: id }, { fromAccountId: id }, { toAccountId: id }] },
    });
    if (linked > 0) {
      throw new BadRequestException('Conta possui lançamentos; arquive-a em vez de excluir.');
    }
    await this.prisma.client.account.delete({ where: { id } });
    return { ok: true };
  }

  /** Regra 5.8: cria um lançamento ADJUSTMENT da diferença, sem apagar histórico. */
  async adjustBalance(userId: string, id: string, input: AdjustBalanceInput) {
    return this.prisma.client.$transaction(async (tx) => {
      const account = await tx.account.findFirst({ where: { id, userId } });
      if (!account) throw new NotFoundException('Conta não encontrada');

      const delta = computeAdjustmentDeltaCents(input.realBalanceCents, account.balanceCents);
      if (delta === 0n) return { account, transaction: null };

      const category = await this.getOrCreateAdjustmentCategory(tx, userId);
      const transaction = await tx.transaction.create({
        data: {
          userId,
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
  async balanceEvolution(userId: string, id: string, months = 6) {
    const account = await this.get(userId, id);
    const txs = await this.prisma.client.transaction.findMany({
      where: {
        userId,
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

  /**
   * A categoria "Ajuste" do seed é universal (`userId` null). Procura a
   * universal ou uma própria do usuário; só cria (como própria) se não houver
   * nenhuma — banco sem seed rodado.
   */
  private async getOrCreateAdjustmentCategory(tx: Tx, userId: string) {
    const existing = await tx.category.findFirst({
      where: { name: 'Ajuste', OR: [{ userId }, { userId: null }] },
      orderBy: { userId: 'asc' }, // nulls last no Postgres: prefere a própria
    });
    if (existing) return existing;
    return tx.category.create({
      data: { userId, name: 'Ajuste', kind: 'BOTH', icon: 'wrench', color: '#6B6577' },
    });
  }
}
