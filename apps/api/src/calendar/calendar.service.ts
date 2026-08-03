import { Injectable } from '@nestjs/common';
import type { Prisma } from '@cifrao/db';
import {
  type MonthQuery,
  accountDeltaCents,
  addMonths,
  dateKeyFromParts,
  daysInMonth,
  monthKeyInSaoPaulo,
  saoPauloDateParts,
  saoPauloWallClockToUtc,
} from '@cifrao/shared';
import { PrismaService } from '../prisma/prisma.service';

interface CalendarEvent {
  kind: 'forecast' | 'pending' | 'invoice-due';
  id: string;
  label: string;
  /** Efeito no saldo do dia, com sinal (negativo = sai dinheiro). */
  deltaCents: bigint;
  amountCents: bigint;
  type?: string;
  categoryName?: string | null;
}

/** Lançamento reduzido ao necessário para calcular efeito em saldo. */
type DeltaRow = {
  type: string;
  amountCents: bigint;
  accountId: string | null;
  fromAccountId: string | null;
  toAccountId: string | null;
};

@Injectable()
export class CalendarService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Calendário de contas com saldo projetado dia a dia (Fase 5).
   *
   * Base: o saldo atual das contas líquidas (não-investimento). Como o saldo é
   * mantido a cada mutação, ele já embute todo lançamento não-previsto. Daí:
   *  - do dia de hoje em diante somam-se os previstos (FORECAST) e o restante das
   *    faturas no vencimento (decisão do dono: a fatura sai do saldo no
   *    vencimento, como evento de fatura — nunca como despesa, regra 5.6);
   *  - nos dias passados o saldo é reconstruído para trás com os realizados.
   */
  async month(query: MonthQuery) {
    const month = query.month ?? monthKeyInSaoPaulo(new Date());
    const [year, monthNumber] = month.split('-').map(Number);
    const next = addMonths(year, monthNumber, 1);
    const start = saoPauloWallClockToUtc(year, monthNumber, 1, '00:00:00');
    const end = saoPauloWallClockToUtc(next.year, next.month, 1, '00:00:00');

    const now = new Date();
    const today = saoPauloDateParts(now);
    const todayKey = dateKeyFromParts(today);
    const startOfToday = saoPauloWallClockToUtc(today.year, today.month, today.day, '00:00:00');

    const [accounts, transactions, invoices, invoiceTotals] = await Promise.all([
      this.prisma.client.account.findMany({
        where: { archived: false, type: { not: 'INVESTMENT' } },
        select: { id: true, balanceCents: true },
      }),
      this.prisma.client.transaction.findMany({
        where: { date: { gte: start, lt: end } },
        select: {
          id: true,
          type: true,
          amountCents: true,
          date: true,
          description: true,
          status: true,
          accountId: true,
          fromAccountId: true,
          toAccountId: true,
          category: { select: { name: true } },
        },
        orderBy: { date: 'asc' },
      }),
      this.prisma.client.invoice.findMany({
        where: { dueDate: { gte: start, lt: end } },
        include: { creditCard: { select: { nickname: true } } },
      }),
      this.prisma.client.transaction.groupBy({
        by: ['invoiceId'],
        where: { invoiceId: { not: null }, type: 'EXPENSE', status: { not: 'FORECAST' } },
        _sum: { amountCents: true },
      }),
    ]);

    const liquidIds = new Set(accounts.map((a) => a.id));
    const balanceTodayCents = accounts.reduce((acc, a) => acc + a.balanceCents, 0n);

    const dayKeys: string[] = [];
    for (let d = 1; d <= daysInMonth(year, monthNumber); d++) {
      dayKeys.push(dateKeyFromParts({ year, month: monthNumber, day: d }));
    }
    const firstKey = dayKeys[0];
    const lastKey = dayKeys[dayKeys.length - 1];

    const realizedByDay = new Map<string, bigint>();
    const projectedByDay = new Map<string, bigint>();
    const eventsByDay = new Map<string, CalendarEvent[]>();
    const pushEvent = (key: string, event: CalendarEvent) => {
      const list = eventsByDay.get(key);
      if (list) list.push(event);
      else eventsByDay.set(key, [event]);
    };

    for (const t of transactions) {
      const key = dateKeyFromParts(saoPauloDateParts(t.date));
      const delta = this.liquidDelta(t, liquidIds);
      if (t.status === 'FORECAST') {
        if (key < todayKey) continue; // previsto vencido não entra na projeção
        projectedByDay.set(key, (projectedByDay.get(key) ?? 0n) + delta);
        pushEvent(key, {
          kind: 'forecast',
          id: t.id,
          label: t.description,
          deltaCents: delta,
          amountCents: t.amountCents,
          type: t.type,
          categoryName: t.category?.name ?? null,
        });
      } else {
        realizedByDay.set(key, (realizedByDay.get(key) ?? 0n) + delta);
        if (t.status === 'PENDING' && key >= todayKey) {
          pushEvent(key, {
            kind: 'pending',
            id: t.id,
            label: t.description,
            deltaCents: delta,
            amountCents: t.amountCents,
            type: t.type,
            categoryName: t.category?.name ?? null,
          });
        }
      }
    }

    const totalByInvoice = new Map<string, bigint>();
    for (const row of invoiceTotals) {
      if (row.invoiceId) totalByInvoice.set(row.invoiceId, row._sum.amountCents ?? 0n);
    }
    for (const inv of invoices) {
      const remaining = (totalByInvoice.get(inv.id) ?? 0n) - inv.paidCents;
      if (remaining <= 0n) continue;
      const key = dateKeyFromParts(saoPauloDateParts(inv.dueDate));
      // Vencimento já passado vira alerta, não projeção: o dinheiro ainda não saiu.
      if (key >= todayKey) projectedByDay.set(key, (projectedByDay.get(key) ?? 0n) - remaining);
      pushEvent(key, {
        kind: 'invoice-due',
        id: inv.id,
        label: `Fatura ${inv.creditCard.nickname} · ${inv.referenceMonth}`,
        deltaCents: -remaining,
        amountCents: remaining,
      });
    }

    const balanceByDay = new Map<string, bigint>();

    if (todayKey > lastKey) {
      // Mês inteiramente no passado: desconta do saldo de hoje tudo que foi
      // realizado depois do fim do mês e caminha para trás.
      const after = await this.liquidDeltaSum(
        { status: { not: 'FORECAST' }, date: { gte: end } },
        liquidIds,
      );
      let running = balanceTodayCents - after;
      for (let i = dayKeys.length - 1; i >= 0; i--) {
        balanceByDay.set(dayKeys[i], running);
        running -= realizedByDay.get(dayKeys[i]) ?? 0n;
      }
    } else if (todayKey < firstKey) {
      // Mês inteiramente no futuro: acumula o previsto entre hoje e o 1º dia.
      const before = await this.liquidDeltaSum(
        { status: 'FORECAST', date: { gte: startOfToday, lt: start } },
        liquidIds,
      );
      const dueBefore = await this.invoiceDueSum(startOfToday, start);
      let running = balanceTodayCents + before - dueBefore;
      for (const key of dayKeys) {
        running += projectedByDay.get(key) ?? 0n;
        balanceByDay.set(key, running);
      }
    } else {
      // Mês corrente: âncora em hoje, para trás com realizado, para frente com previsto.
      let running = balanceTodayCents;
      for (const key of dayKeys) {
        if (key < todayKey) continue;
        running += projectedByDay.get(key) ?? 0n;
        balanceByDay.set(key, running);
      }
      running = balanceTodayCents;
      for (let i = dayKeys.length - 1; i >= 0; i--) {
        const key = dayKeys[i];
        if (key >= todayKey) continue;
        // Saldo no fim do dia = saldo de hoje menos o realizado dos dias seguintes.
        running -= realizedByDay.get(dayKeys[i + 1]) ?? 0n;
        balanceByDay.set(key, running);
      }
    }

    const days = dayKeys.map((key) => ({
      date: key,
      isToday: key === todayKey,
      isPast: key < todayKey,
      projectedBalanceCents: balanceByDay.get(key) ?? balanceTodayCents,
      realizedDeltaCents: realizedByDay.get(key) ?? 0n,
      projectedDeltaCents: projectedByDay.get(key) ?? 0n,
      events: eventsByDay.get(key) ?? [],
    }));

    const future = days.filter((d) => !d.isPast);
    const lowest = future.reduce<(typeof days)[number] | null>(
      (min, d) => (min === null || d.projectedBalanceCents < min.projectedBalanceCents ? d : min),
      null,
    );

    return {
      month,
      todayKey,
      balanceTodayCents,
      endOfMonthBalanceCents: days.length
        ? days[days.length - 1].projectedBalanceCents
        : balanceTodayCents,
      lowestPoint: lowest
        ? { date: lowest.date, projectedBalanceCents: lowest.projectedBalanceCents }
        : null,
      days,
    };
  }

  /**
   * Efeito de um lançamento sobre o conjunto das contas líquidas. Transferência
   * entre duas contas líquidas se anula — não é entrada nem saída (regra 5.7).
   */
  private liquidDelta(row: DeltaRow, liquidIds: Set<string>): bigint {
    let delta = 0n;
    for (const id of [row.accountId, row.fromAccountId, row.toAccountId]) {
      if (id && liquidIds.has(id)) delta += accountDeltaCents(row as never, id);
    }
    return delta;
  }

  /** Soma agregada no banco (armadilha #5) do efeito em contas líquidas. */
  private async liquidDeltaSum(
    where: Prisma.TransactionWhereInput,
    liquidIds: Set<string>,
  ): Promise<bigint> {
    const ids = [...liquidIds];
    if (ids.length === 0) return 0n;

    const [direct, out, incoming] = await Promise.all([
      this.prisma.client.transaction.groupBy({
        by: ['type'],
        where: { ...where, accountId: { in: ids } },
        _sum: { amountCents: true },
      }),
      this.prisma.client.transaction.aggregate({
        where: { ...where, type: 'TRANSFER', fromAccountId: { in: ids } },
        _sum: { amountCents: true },
      }),
      this.prisma.client.transaction.aggregate({
        where: { ...where, type: 'TRANSFER', toAccountId: { in: ids } },
        _sum: { amountCents: true },
      }),
    ]);

    let total = 0n;
    for (const row of direct) {
      const sum = row._sum.amountCents ?? 0n;
      if (row.type === 'INCOME' || row.type === 'ADJUSTMENT') total += sum;
      else if (row.type === 'EXPENSE') total -= sum;
    }
    total -= out._sum.amountCents ?? 0n;
    total += incoming._sum.amountCents ?? 0n;
    return total;
  }

  /** Restante das faturas que vencem em [from, to). */
  private async invoiceDueSum(from: Date, to: Date): Promise<bigint> {
    const invoices = await this.prisma.client.invoice.findMany({
      where: { dueDate: { gte: from, lt: to } },
      select: { id: true, paidCents: true },
    });
    if (invoices.length === 0) return 0n;
    const totals = await this.prisma.client.transaction.groupBy({
      by: ['invoiceId'],
      where: {
        invoiceId: { in: invoices.map((i) => i.id) },
        type: 'EXPENSE',
        status: { not: 'FORECAST' },
      },
      _sum: { amountCents: true },
    });
    const byInvoice = new Map(totals.map((t) => [t.invoiceId, t._sum.amountCents ?? 0n]));
    let sum = 0n;
    for (const inv of invoices) {
      const remaining = (byInvoice.get(inv.id) ?? 0n) - inv.paidCents;
      if (remaining > 0n) sum += remaining;
    }
    return sum;
  }
}
