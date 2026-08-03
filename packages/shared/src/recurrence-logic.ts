import { type DateParts, addMonths, clampDay } from './card-logic';
import type { RecurrenceFrequency } from './enums';

/**
 * Lógica pura de recorrências (regra 5.11) — independente do Prisma.
 *
 * Uma `RecurringRule` gera lançamentos previstos (`status = FORECAST`) até a data
 * final ou até o horizonte rolante (12 meses). Toda a aritmética acontece sobre
 * componentes de calendário do fuso de São Paulo; a conversão para instantes UTC
 * fica na camada de serviço (regra 5.2).
 */

/** Passo em meses das frequências baseadas em mês. WEEKLY é tratada à parte. */
const MONTH_STEP: Record<Exclude<RecurrenceFrequency, 'WEEKLY'>, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  YEARLY: 12,
};

/** Trava de segurança: nenhuma regra gera mais que isto numa passada. */
const MAX_OCCURRENCES = 600;

/** Ordena datas de calendário: < 0 se a < b, 0 se iguais, > 0 se a > b. */
export function compareDateParts(a: DateParts, b: DateParts): number {
  if (a.year !== b.year) return a.year - b.year;
  if (a.month !== b.month) return a.month - b.month;
  return a.day - b.day;
}

/** Soma dias a uma data de calendário (aritmética em UTC puro, sem fuso). */
export function addDaysToParts(parts: DateParts, days: number): DateParts {
  const d = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  d.setUTCDate(d.getUTCDate() + days);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** Chave "yyyy-MM-dd" de uma data de calendário. */
export function dateKeyFromParts(parts: DateParts): string {
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `${parts.year}-${p2(parts.month)}-${p2(parts.day)}`;
}

export interface RecurrenceSpec {
  frequency: RecurrenceFrequency;
  /** Primeira data possível (âncora da série). */
  start: DateParts;
  /** Última data permitida, inclusive. `null` = indefinido. */
  end?: DateParts | null;
  /**
   * Dia do mês desejado nas frequências mensais. Padrão: o dia do `start`.
   * Dias maiores que o mês são fixados no último dia (31 em fevereiro → 28/29).
   */
  dayOfMonth?: number | null;
}

/**
 * Todas as ocorrências da regra até `horizon` (inclusive), respeitando `end`.
 * Sempre em ordem crescente e sem repetição de data.
 */
export function occurrencesUntil(spec: RecurrenceSpec, horizon: DateParts): DateParts[] {
  const out: DateParts[] = [];
  const limit = spec.end && compareDateParts(spec.end, horizon) < 0 ? spec.end : horizon;
  if (compareDateParts(spec.start, limit) > 0) return out;

  if (spec.frequency === 'WEEKLY') {
    let cur = spec.start;
    while (compareDateParts(cur, limit) <= 0 && out.length < MAX_OCCURRENCES) {
      out.push(cur);
      cur = addDaysToParts(cur, 7);
    }
    return out;
  }

  const step = MONTH_STEP[spec.frequency];
  const desiredDay = spec.dayOfMonth ?? spec.start.day;
  let i = 0;
  while (out.length < MAX_OCCURRENCES) {
    const { year, month } = addMonths(spec.start.year, spec.start.month, i * step);
    const parts: DateParts = { year, month, day: clampDay(year, month, desiredDay) };
    i += 1;
    // O dia desejado pode cair antes do início dentro do mês-âncora: pula.
    if (compareDateParts(parts, spec.start) < 0) continue;
    if (compareDateParts(parts, limit) > 0) break;
    out.push(parts);
  }
  return out;
}

/** Ocorrências dentro de uma janela fechada [from, to]. */
export function occurrencesBetween(
  spec: RecurrenceSpec,
  from: DateParts,
  to: DateParts,
): DateParts[] {
  return occurrencesUntil(spec, to).filter((p) => compareDateParts(p, from) >= 0);
}

/** As próximas `count` ocorrências a partir de `from` (para a prévia da UI). */
export function nextOccurrences(spec: RecurrenceSpec, from: DateParts, count: number): DateParts[] {
  const horizon = addMonths(from.year, from.month, 120);
  const all = occurrencesUntil(spec, { year: horizon.year, month: horizon.month, day: 28 });
  return all.filter((p) => compareDateParts(p, from) >= 0).slice(0, count);
}
