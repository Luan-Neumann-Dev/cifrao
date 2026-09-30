import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@cifrao/db';
import {
  type CreateRecurringRuleInput,
  type DateParts,
  type RecurrenceSpec,
  type UpdateRecurringRuleInput,
  addMonths,
  clampDay,
  dateKeyFromParts,
  nextOccurrences,
  occurrencesUntil,
  saoPauloDateParts,
  saoPauloWallClockToUtc,
} from '@cifrao/shared';
import { PrismaService } from '../prisma/prisma.service';

/** Horizonte rolante da geração de previstos (regra 5.11 + aceite da Fase 5). */
export const FORECAST_HORIZON_MONTHS = 12;

/** Hora de parede (SP) usada nos previstos: meio-dia evita virada de fuso. */
const FORECAST_TIME = '12:00:00';

const ruleInclude = {
  account: { select: { id: true, name: true, color: true } },
  fromAccount: { select: { id: true, name: true, color: true } },
  toAccount: { select: { id: true, name: true, color: true } },
  category: { select: { id: true, name: true, color: true, icon: true } },
} satisfies Prisma.RecurringRuleInclude;

type RuleRow = {
  id: string;
  description: string;
  type: string;
  amountCents: bigint;
  frequency: string;
  dayOfMonth: number | null;
  startDate: Date;
  endDate: Date | null;
  active: boolean;
  notes: string | null;
  accountId: string | null;
  fromAccountId: string | null;
  toAccountId: string | null;
  categoryId: string | null;
};

@Injectable()
export class RecurringRulesService {
  private readonly logger = new Logger(RecurringRulesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    const rules = await this.prisma.client.recurringRule.findMany({
      where: { userId },
      orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
      include: ruleInclude,
    });
    const today = saoPauloDateParts(new Date());
    return rules.map((rule) => ({
      ...rule,
      // Prévia para a UI: as 3 próximas datas no calendário de São Paulo.
      nextDates: nextOccurrences(this.specOf(rule), today, 3).map(dateKeyFromParts),
    }));
  }

  async get(userId: string, id: string) {
    const rule = await this.prisma.client.recurringRule.findFirst({
      where: { id, userId },
      include: ruleInclude,
    });
    if (!rule) throw new NotFoundException('Recorrência não encontrada');
    return rule;
  }

  async create(userId: string, input: CreateRecurringRuleInput) {
    const data: Prisma.RecurringRuleUncheckedCreateInput = {
      userId,
      description: input.description,
      type: input.type,
      amountCents: BigInt(input.amountCents),
      frequency: input.frequency,
      dayOfMonth: input.dayOfMonth ?? null,
      startDate: input.startDate,
      endDate: input.endDate ?? null,
      active: input.active,
      notes: input.notes,
      accountId: input.type === 'TRANSFER' ? null : input.accountId,
      fromAccountId: input.type === 'TRANSFER' ? input.fromAccountId : null,
      toAccountId: input.type === 'TRANSFER' ? input.toAccountId : null,
      categoryId: input.type === 'TRANSFER' ? null : (input.categoryId ?? null),
    };
    await this.ensureAccounts(userId, data);
    if (data.categoryId) await this.ensureCategory(userId, data.categoryId);
    const rule = await this.prisma.client.recurringRule.create({ data });
    const generated = await this.generateForRule(rule.id);
    return { ...(await this.get(userId, rule.id)), generated };
  }

  async update(userId: string, id: string, input: UpdateRecurringRuleInput) {
    await this.get(userId, id);
    if (input.categoryId) await this.ensureCategory(userId, input.categoryId);
    const data: Prisma.RecurringRuleUncheckedUpdateInput = {};
    if (input.description !== undefined) data.description = input.description;
    if (input.amountCents !== undefined) data.amountCents = BigInt(input.amountCents);
    if (input.frequency !== undefined) data.frequency = input.frequency;
    if (input.startDate !== undefined) data.startDate = input.startDate;
    if (input.endDate !== undefined) data.endDate = input.endDate;
    if (input.dayOfMonth !== undefined) data.dayOfMonth = input.dayOfMonth;
    if (input.categoryId !== undefined) data.categoryId = input.categoryId;
    if (input.notes !== undefined) data.notes = input.notes;
    if (input.active !== undefined) data.active = input.active;

    await this.prisma.client.recurringRule.update({ where: { id }, data });
    // Editar a regra reescreve os previstos futuros — o que já foi efetivado fica.
    const generated = await this.generateForRule(id);
    return { ...(await this.get(userId, id)), generated };
  }

  /**
   * Apagar a regra remove os previstos futuros ainda não confirmados. O que já
   * virou lançamento efetivado permanece (o campo vira null por SetNull).
   */
  async remove(userId: string, id: string) {
    await this.get(userId, id);
    const { count } = await this.prisma.client.transaction.deleteMany({
      where: { userId, recurringRuleId: id, status: 'FORECAST' },
    });
    await this.prisma.client.recurringRule.delete({ where: { id } });
    return { ok: true, forecastsRemoved: count };
  }

  /**
   * Só para o usuário que pediu. O caminho HTTP nunca pode disparar geração na
   * regra de outra pessoa — `generateAll` (cron) roda para todos de propósito.
   */
  async generateAllForUser(userId: string, now = new Date()) {
    const rules = await this.prisma.client.recurringRule.findMany({
      where: { userId, active: true },
    });
    let created = 0;
    for (const rule of rules) {
      created += await this.generateForRule(rule.id, now);
    }
    return { rules: rules.length, created };
  }

  /** Roda para todas as regras ativas de TODOS os usuários (cron diário). */
  async generateAll(now = new Date()) {
    const rules = await this.prisma.client.recurringRule.findMany({ where: { active: true } });
    let created = 0;
    for (const rule of rules) {
      created += await this.generateForRule(rule.id, now);
    }
    this.logger.log(`Previstos gerados: ${created} (${rules.length} regras ativas)`);
    return { rules: rules.length, created };
  }

  /**
   * Regra 5.11 — (re)gera os previstos de UMA regra dentro do horizonte rolante
   * de 12 meses. Só mexe do dia de hoje para frente: previstos passados e
   * lançamentos já efetivados (confirmados pelo usuário) nunca são tocados.
   */
  async generateForRule(ruleId: string, now = new Date()): Promise<number> {
    const rule = await this.prisma.client.recurringRule.findUnique({ where: { id: ruleId } });
    if (!rule) throw new NotFoundException('Recorrência não encontrada');
    // O dono sai da própria regra: o cron roda para todos, sem JWT na mão.
    const userId = rule.userId;

    const today = saoPauloDateParts(now);
    const startOfToday = saoPauloWallClockToUtc(today.year, today.month, today.day, '00:00:00');

    // Limpa só o que será reescrito: previstos de hoje em diante desta regra.
    await this.prisma.client.transaction.deleteMany({
      where: { userId, recurringRuleId: ruleId, status: 'FORECAST', date: { gte: startOfToday } },
    });

    if (!rule.active) {
      await this.prisma.client.recurringRule.update({
        where: { id: ruleId },
        data: { lastGeneratedAt: now },
      });
      return 0;
    }

    // Datas já confirmadas (previsto que virou efetivado) não são recriadas.
    const confirmed = await this.prisma.client.transaction.findMany({
      where: {
        userId,
        recurringRuleId: ruleId,
        status: { not: 'FORECAST' },
        date: { gte: startOfToday },
      },
      select: { date: true },
    });
    const takenDays = new Set(confirmed.map((t) => dateKeyFromParts(saoPauloDateParts(t.date))));

    const horizonMonth = addMonths(today.year, today.month, FORECAST_HORIZON_MONTHS);
    const horizon: DateParts = {
      year: horizonMonth.year,
      month: horizonMonth.month,
      day: clampDay(horizonMonth.year, horizonMonth.month, today.day),
    };

    const occurrences = occurrencesUntil(this.specOf(rule), horizon).filter(
      (p) => dateKeyFromParts(p) >= dateKeyFromParts(today) && !takenDays.has(dateKeyFromParts(p)),
    );

    if (occurrences.length > 0) {
      await this.prisma.client.transaction.createMany({
        data: occurrences.map((p) => ({
          userId,
          type: rule.type,
          amountCents: rule.amountCents,
          date: saoPauloWallClockToUtc(p.year, p.month, p.day, FORECAST_TIME),
          description: rule.description,
          status: 'FORECAST' as const,
          notes: rule.notes,
          accountId: rule.accountId,
          fromAccountId: rule.fromAccountId,
          toAccountId: rule.toAccountId,
          categoryId: rule.categoryId,
          recurringRuleId: rule.id,
        })),
      });
    }

    await this.prisma.client.recurringRule.update({
      where: { id: ruleId },
      data: { lastGeneratedAt: now },
    });
    return occurrences.length;
  }

  /** Previstos gerados por regras, do dia de hoje em diante. */
  async forecasts(userId: string, ruleId?: string) {
    const now = new Date();
    const today = saoPauloDateParts(now);
    const startOfToday = saoPauloWallClockToUtc(today.year, today.month, today.day, '00:00:00');
    return this.prisma.client.transaction.findMany({
      where: {
        userId,
        status: 'FORECAST',
        date: { gte: startOfToday },
        ...(ruleId ? { recurringRuleId: ruleId } : { recurringRuleId: { not: null } }),
      },
      orderBy: { date: 'asc' },
      take: 200,
      include: {
        account: { select: { id: true, name: true, color: true } },
        fromAccount: { select: { id: true, name: true, color: true } },
        toAccount: { select: { id: true, name: true, color: true } },
        category: { select: { id: true, name: true, color: true, icon: true } },
      },
    });
  }

  private specOf(rule: RuleRow): RecurrenceSpec {
    return {
      frequency: rule.frequency as RecurrenceSpec['frequency'],
      start: saoPauloDateParts(rule.startDate),
      end: rule.endDate ? saoPauloDateParts(rule.endDate) : null,
      dayOfMonth: rule.dayOfMonth,
    };
  }

  private async ensureAccounts(userId: string, data: Prisma.RecurringRuleUncheckedCreateInput) {
    const ids = [data.accountId, data.fromAccountId, data.toAccountId].filter(
      (v): v is string => typeof v === 'string',
    );
    if (ids.length === 0) return;
    const found = await this.prisma.client.account.count({ where: { userId, id: { in: ids } } });
    if (found !== new Set(ids).size) throw new NotFoundException('Conta informada não existe');
  }

  private async ensureCategory(userId: string, categoryId: string) {
    const found = await this.prisma.client.category.count({
      where: { id: categoryId, OR: [{ userId }, { userId: null }] },
    });
    if (found === 0) throw new NotFoundException('Categoria informada não existe');
  }

  /** Caminho HTTP: confere o dono antes de deixar (re)gerar. */
  async generateForRuleAsUser(userId: string, ruleId: string, now = new Date()) {
    await this.get(userId, ruleId);
    return this.generateForRule(ruleId, now);
  }
}
