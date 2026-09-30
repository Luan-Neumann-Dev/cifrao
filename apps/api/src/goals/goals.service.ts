import { Injectable, NotFoundException } from '@nestjs/common';
import {
  type CreateGoalInput,
  type UpdateGoalInput,
  addMonths,
  computeGoalProgress,
  goalOnTrack,
  monthsBetween,
  saoPauloDateParts,
  saoPauloWallClockToUtc,
} from '@cifrao/shared';
import { PrismaService } from '../prisma/prisma.service';

/** Janela do "ritmo atual" (decisão do dono): 3 meses completos anteriores. */
const PACE_MONTHS = 3;

@Injectable()
export class GoalsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Regra 5.9 — a meta aponta para um saldo que já existe. Este serviço só LÊ
   * `Account.balanceCents`: nunca cria lançamento, nunca soma saldo paralelo.
   * Nenhum real é contado duas vezes.
   */
  async list(userId: string, includeArchived = false) {
    const goals = await this.prisma.client.goal.findMany({
      where: includeArchived ? { userId } : { userId, archived: false },
      orderBy: { createdAt: 'asc' },
      include: {
        linkedAccount: { select: { id: true, name: true, type: true, color: true, balanceCents: true } },
      },
    });
    if (goals.length === 0) return [];

    const accountIds = [...new Set(goals.map((g) => g.linkedAccountId))];
    const paceByAccount = await this.monthlyPaceByAccount(userId, accountIds);
    const today = saoPauloDateParts(new Date());

    return goals.map((goal) => {
      const progress = computeGoalProgress({
        targetCents: goal.targetCents,
        // Progresso = saldo vinculado, lido como está.
        currentCents: goal.linkedAccount.balanceCents,
        historyPaceCents: paceByAccount.get(goal.linkedAccountId) ?? 0n,
        monthlyContributionCents: goal.monthlyContributionCents,
      });
      const deadlineParts = goal.deadline ? saoPauloDateParts(goal.deadline) : null;
      const monthsToDeadline = deadlineParts
        ? monthsBetween({ year: today.year, month: today.month }, deadlineParts)
        : null;
      const eta =
        progress.etaMonths === null ? null : addMonths(today.year, today.month, progress.etaMonths);

      return {
        id: goal.id,
        name: goal.name,
        deadline: goal.deadline,
        archived: goal.archived,
        monthlyContributionCents: goal.monthlyContributionCents,
        linkedAccount: goal.linkedAccount,
        ...progress,
        monthsToDeadline,
        onTrack: goalOnTrack(progress.etaMonths, monthsToDeadline),
        /** Mês estimado (yyyy-MM) de conclusão no ritmo atual. */
        etaMonth: eta ? `${eta.year}-${String(eta.month).padStart(2, '0')}` : null,
      };
    });
  }

  async get(userId: string, id: string) {
    const goal = await this.prisma.client.goal.findFirst({
      where: { id, userId },
      include: { linkedAccount: true },
    });
    if (!goal) throw new NotFoundException('Meta não encontrada');
    return goal;
  }

  async create(userId: string, input: CreateGoalInput) {
    await this.ensureAccount(userId, input.linkedAccountId);
    return this.prisma.client.goal.create({
      data: {
        userId,
        name: input.name,
        targetCents: BigInt(input.targetCents),
        deadline: input.deadline ?? null,
        linkedAccountId: input.linkedAccountId,
        monthlyContributionCents:
          input.monthlyContributionCents === null || input.monthlyContributionCents === undefined
            ? null
            : BigInt(input.monthlyContributionCents),
      },
    });
  }

  async update(userId: string, id: string, input: UpdateGoalInput) {
    await this.get(userId, id);
    if (input.linkedAccountId) await this.ensureAccount(userId, input.linkedAccountId);
    return this.prisma.client.goal.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.targetCents !== undefined ? { targetCents: BigInt(input.targetCents) } : {}),
        ...(input.deadline !== undefined ? { deadline: input.deadline } : {}),
        ...(input.linkedAccountId !== undefined ? { linkedAccountId: input.linkedAccountId } : {}),
        ...(input.archived !== undefined ? { archived: input.archived } : {}),
        ...(input.monthlyContributionCents !== undefined
          ? {
              monthlyContributionCents:
                input.monthlyContributionCents === null
                  ? null
                  : BigInt(input.monthlyContributionCents),
            }
          : {}),
      },
    });
  }

  /** Excluir a meta não mexe em saldo nenhum — ela nunca foi dona do dinheiro. */
  async remove(userId: string, id: string) {
    await this.get(userId, id);
    await this.prisma.client.goal.delete({ where: { id } });
    return { ok: true };
  }

  /**
   * Ritmo histórico: variação média mensal do saldo de cada conta nos últimos 3
   * meses completos. Agregado no banco (armadilha #5) com o sinal de cada tipo:
   * receitas e ajustes entram, despesas saem, transferências movem os dois lados.
   */
  private async monthlyPaceByAccount(
    userId: string,
    accountIds: string[],
  ): Promise<Map<string, bigint>> {
    const today = saoPauloDateParts(new Date());
    const monthStart = saoPauloWallClockToUtc(today.year, today.month, 1, '00:00:00');
    const windowStartMonth = addMonths(today.year, today.month, -PACE_MONTHS);
    const windowStart = saoPauloWallClockToUtc(
      windowStartMonth.year,
      windowStartMonth.month,
      1,
      '00:00:00',
    );
    const range = { gte: windowStart, lt: monthStart };
    const realized = { status: { not: 'FORECAST' as const } };

    const [direct, transfersOut, transfersIn] = await Promise.all([
      this.prisma.client.transaction.groupBy({
        by: ['accountId', 'type'],
        where: { userId, accountId: { in: accountIds }, date: range, ...realized },
        _sum: { amountCents: true },
      }),
      this.prisma.client.transaction.groupBy({
        by: ['fromAccountId'],
        where: { userId, fromAccountId: { in: accountIds }, type: 'TRANSFER', date: range, ...realized },
        _sum: { amountCents: true },
      }),
      this.prisma.client.transaction.groupBy({
        by: ['toAccountId'],
        where: { userId, toAccountId: { in: accountIds }, type: 'TRANSFER', date: range, ...realized },
        _sum: { amountCents: true },
      }),
    ]);

    const delta = new Map<string, bigint>();
    const add = (id: string | null, value: bigint) => {
      if (!id) return;
      delta.set(id, (delta.get(id) ?? 0n) + value);
    };

    for (const row of direct) {
      const sum = row._sum.amountCents ?? 0n;
      if (row.type === 'INCOME' || row.type === 'ADJUSTMENT') add(row.accountId, sum);
      else if (row.type === 'EXPENSE') add(row.accountId, -sum);
    }
    for (const row of transfersOut) add(row.fromAccountId, -(row._sum.amountCents ?? 0n));
    for (const row of transfersIn) add(row.toAccountId, row._sum.amountCents ?? 0n);

    const pace = new Map<string, bigint>();
    for (const id of accountIds) {
      pace.set(id, (delta.get(id) ?? 0n) / BigInt(PACE_MONTHS));
    }
    return pace;
  }

  private async ensureAccount(userId: string, id: string) {
    const account = await this.prisma.client.account.findFirst({ where: { id, userId } });
    if (!account) throw new NotFoundException('Conta vinculada não existe');
    return account;
  }
}
