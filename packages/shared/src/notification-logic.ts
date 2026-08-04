/**
 * Avisos do app (Fase 9). Decisão do dono: sem e-mail e sem push — os avisos são
 * derivados sob demanda dos dados que já existem e aparecem no sino do topo.
 *
 * Por isso tudo aqui é função pura: a entrada é o que o banco já sabe (faturas,
 * orçamentos, metas, previstos) e a saída é a lista pronta para a tela.
 */

import type { DateParts } from './card-logic';
import { addDaysToParts, compareDateParts, dateKeyFromParts } from './recurrence-logic';

export const NOTIFICATION_KINDS = [
  'INVOICE_DUE',
  'BUDGET_EXCEEDED',
  'GOAL_REACHED',
  'FORECAST_DUE',
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export type NotificationSeverity = 'danger' | 'warn' | 'info';

export interface NotificationPrefs {
  notifyInvoiceDue: boolean;
  notifyBudgetExceeded: boolean;
  notifyGoalReached: boolean;
  notifyForecastDue: boolean;
  /** Antecedência para avisar de vencimento e de previsto. */
  notifyDaysBefore: number;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  notifyInvoiceDue: true,
  notifyBudgetExceeded: true,
  notifyGoalReached: true,
  notifyForecastDue: true,
  notifyDaysBefore: 3,
};

export interface NotificationInvoice {
  id: string;
  cardName: string;
  dueDate: DateParts;
  /** O que falta pagar. Fatura quitada não deve nem chegar aqui. */
  remainingCents: bigint;
}

export interface NotificationBudget {
  categoryId: string;
  categoryName: string;
  limitCents: bigint;
  spentCents: bigint;
}

export interface NotificationGoal {
  id: string;
  name: string;
  targetCents: bigint;
  currentCents: bigint;
}

export interface NotificationForecast {
  id: string;
  description: string;
  date: DateParts;
  amountCents: bigint;
  type: 'EXPENSE' | 'INCOME';
}

export interface NotificationInput {
  /** Hoje em São Paulo (regra 5.2 — o dia de calendário é o daqui). */
  today: DateParts;
  prefs: NotificationPrefs;
  invoices?: readonly NotificationInvoice[];
  budgets?: readonly NotificationBudget[];
  goals?: readonly NotificationGoal[];
  forecasts?: readonly NotificationForecast[];
}

export interface AppNotification {
  /** Estável entre chamadas: é assim que a UI lembra o que já foi dispensado. */
  id: string;
  kind: NotificationKind;
  severity: NotificationSeverity;
  title: string;
  detail: string;
  href: string;
  /** Quando o aviso "acontece" — usado só para ordenar. */
  dateKey?: string;
  amountCents?: bigint;
}

const SEVERITY_RANK: Record<NotificationSeverity, number> = { danger: 0, warn: 1, info: 2 };

/** Percentual do limite já gasto, em base 100 e sem float na conta. */
export function budgetUsagePercent(spentCents: bigint, limitCents: bigint): number {
  if (limitCents <= 0n) return 0;
  return Number((spentCents * 10000n) / limitCents) / 100;
}

/** Limiar do aviso amarelo: o orçamento entrou na reta final. */
export const BUDGET_WARN_PERCENT = 80;

export function buildNotifications(input: NotificationInput): AppNotification[] {
  const { today, prefs } = input;
  const horizon = addDaysToParts(today, Math.max(0, prefs.notifyDaysBefore));
  const out: AppNotification[] = [];

  if (prefs.notifyInvoiceDue) {
    for (const invoice of input.invoices ?? []) {
      if (invoice.remainingCents <= 0n) continue;
      const vencida = compareDateParts(invoice.dueDate, today) < 0;
      const noHorizonte = compareDateParts(invoice.dueDate, horizon) <= 0;
      if (!vencida && !noHorizonte) continue;

      out.push({
        id: `invoice-due:${invoice.id}`,
        kind: 'INVOICE_DUE',
        severity: vencida ? 'danger' : 'warn',
        title: vencida
          ? `Fatura do ${invoice.cardName} venceu`
          : `Fatura do ${invoice.cardName} vence em breve`,
        detail: `Vencimento em ${formatDayMonth(invoice.dueDate)}.`,
        href: '/painel/cartoes',
        dateKey: dateKeyFromParts(invoice.dueDate),
        amountCents: invoice.remainingCents,
      });
    }
  }

  if (prefs.notifyBudgetExceeded) {
    for (const budget of input.budgets ?? []) {
      if (budget.limitCents <= 0n) continue;
      const percent = budgetUsagePercent(budget.spentCents, budget.limitCents);
      if (percent < BUDGET_WARN_PERCENT) continue;
      const estourou = budget.spentCents > budget.limitCents;

      out.push({
        id: `budget:${budget.categoryId}`,
        kind: 'BUDGET_EXCEEDED',
        severity: estourou ? 'danger' : 'warn',
        title: estourou
          ? `Orçamento de ${budget.categoryName} estourou`
          : `Orçamento de ${budget.categoryName} quase no limite`,
        detail: `${percent.toFixed(0)}% do limite do mês.`,
        href: '/painel/orcamento',
        amountCents: estourou ? budget.spentCents - budget.limitCents : budget.spentCents,
      });
    }
  }

  if (prefs.notifyGoalReached) {
    for (const goal of input.goals ?? []) {
      if (goal.targetCents <= 0n || goal.currentCents < goal.targetCents) continue;
      out.push({
        id: `goal:${goal.id}`,
        kind: 'GOAL_REACHED',
        severity: 'info',
        title: `Meta "${goal.name}" alcançada`,
        detail: 'O saldo vinculado já cobre o alvo.',
        href: '/painel/metas',
        amountCents: goal.currentCents,
      });
    }
  }

  if (prefs.notifyForecastDue) {
    for (const forecast of input.forecasts ?? []) {
      if (compareDateParts(forecast.date, horizon) > 0) continue;
      const atrasado = compareDateParts(forecast.date, today) < 0;
      out.push({
        id: `forecast:${forecast.id}`,
        kind: 'FORECAST_DUE',
        severity: atrasado ? 'warn' : 'info',
        title: atrasado
          ? `"${forecast.description}" está atrasado`
          : `"${forecast.description}" a confirmar`,
        detail: `Previsto para ${formatDayMonth(forecast.date)}.`,
        href: '/painel/recorrencias',
        dateKey: dateKeyFromParts(forecast.date),
        amountCents: forecast.amountCents,
      });
    }
  }

  return out.sort((a, b) => {
    const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (bySeverity !== 0) return bySeverity;
    const byDate = (a.dateKey ?? '').localeCompare(b.dateKey ?? '');
    if (byDate !== 0) return byDate;
    return a.id.localeCompare(b.id);
  });
}

function formatDayMonth(parts: DateParts): string {
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `${p2(parts.day)}/${p2(parts.month)}`;
}
