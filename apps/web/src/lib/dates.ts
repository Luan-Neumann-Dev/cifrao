import {
  formatInSaoPaulo,
  monthKeyInSaoPaulo,
  nowUtc,
  recentMonthKeys,
  saoPauloWallClockToUtc,
} from '@cifrao/shared';

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS_SHORT = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'out', 'nov', 'dez',
];
const MONTHS_LONG = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

/**
 * `formatInSaoPaulo` não recebe locale, então dia da semana e mês sairiam em
 * inglês. Estes rótulos são montados a partir dos componentes de calendário já
 * convertidos para São Paulo — sem risco de virar o dia no fuso.
 */

/** Chave de dia no fuso de SP ("2026-06-12") a partir de um instante UTC. */
export function dayKeyInSaoPaulo(iso: string): string {
  return formatInSaoPaulo(new Date(iso), 'yyyy-MM-dd');
}

/** "2026-06-12" -> "Qua, 12 jun". */
export function dayGroupLabel(dayKey: string): string {
  const [year, month, day] = dayKey.split('-').map(Number);
  // Data em UTC só para descobrir o dia da semana dos componentes já locais.
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${weekday}, ${day} ${MONTHS_SHORT[month - 1]}`;
}

/** "2026-06" -> "jun/26". */
export function monthShortLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  return `${MONTHS_SHORT[month - 1]}/${String(year).slice(2)}`;
}

/** "2026-06" -> "junho" (e "junho de 2025" quando não é o ano corrente). */
export function monthLongLabel(monthKey: string, currentYear?: number): string {
  const [year, month] = monthKey.split('-').map(Number);
  const name = MONTHS_LONG[month - 1];
  return currentYear !== undefined && year !== currentYear ? `${name} de ${year}` : name;
}

export type PeriodKey = 'month' | 'prev' | 'quarter' | 'year' | 'all';

export interface PeriodRange {
  /** Instantes UTC (ISO) que delimitam o período no fuso de São Paulo. */
  from?: string;
  to?: string;
  /** Como o período aparece ao lado do título ("junho", "3 meses"…). */
  label: string;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function startOfMonth(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  return saoPauloWallClockToUtc(year, month, 1, '00:00:00').toISOString();
}

function endOfMonth(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  return saoPauloWallClockToUtc(
    year,
    month,
    daysInMonth(year, month),
    '23:59:59.999',
  ).toISOString();
}

/**
 * Traduz o filtro de período do extrato em limites de data. Os limites são
 * horários de parede de São Paulo convertidos para UTC: pedir "junho" tem que
 * trazer o lançamento do dia 30 às 22h, que em UTC já é 1º de julho.
 */
export function periodRange(period: PeriodKey, now: Date = nowUtc()): PeriodRange {
  const current = monthKeyInSaoPaulo(now);
  const year = Number(current.slice(0, 4));

  switch (period) {
    case 'month':
      return {
        from: startOfMonth(current),
        to: endOfMonth(current),
        label: monthLongLabel(current, year),
      };
    case 'prev': {
      // `recentMonthKeys` devolve do mais antigo para o mais recente.
      const previous = recentMonthKeys(2, current)[0];
      return {
        from: startOfMonth(previous),
        to: endOfMonth(previous),
        label: monthLongLabel(previous, year),
      };
    }
    case 'quarter': {
      const oldest = recentMonthKeys(3, current)[0];
      return { from: startOfMonth(oldest), to: endOfMonth(current), label: '3 meses' };
    }
    case 'year':
      return { from: startOfMonth(`${year}-01`), to: endOfMonth(`${year}-12`), label: String(year) };
    case 'all':
      return { label: 'todo o período' };
  }
}
