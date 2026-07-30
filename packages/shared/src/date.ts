/**
 * Datas no Cifrão são persistidas em UTC. A conversão para America/Sao_Paulo
 * acontece só na exibição e no cálculo de "em que mês cai este lançamento".
 * Ver regra 5.2 do CLAUDE.md. Fatura que fecha dia 28 vira dia 27 se errar isso.
 */
import { format as formatTz, fromZonedTime, toZonedTime } from 'date-fns-tz';

export const SP_TIMEZONE = 'America/Sao_Paulo';

/** Instante atual em UTC. */
export function nowUtc(): Date {
  return new Date();
}

/** Converte um instante UTC para o horário de parede de São Paulo. */
export function toSaoPaulo(date: Date): Date {
  return toZonedTime(date, SP_TIMEZONE);
}

/**
 * Interpreta uma data/hora de parede de São Paulo e retorna o instante UTC.
 * Ex.: "2025-08-01T00:00:00" em SP -> 2025-08-01T03:00:00Z.
 */
export function saoPauloToUtc(localWallClock: Date | string): Date {
  return fromZonedTime(localWallClock, SP_TIMEZONE);
}

/**
 * Em que mês (no fuso de São Paulo) cai este instante UTC. Formato "yyyy-MM".
 * É a chave usada para agrupar lançamentos por mês.
 */
export function monthKeyInSaoPaulo(date: Date): string {
  return formatTz(toZonedTime(date, SP_TIMEZONE), 'yyyy-MM', { timeZone: SP_TIMEZONE });
}

/** Formata um instante UTC no fuso de São Paulo (padrão dd/MM/yyyy). */
export function formatInSaoPaulo(date: Date, pattern = 'dd/MM/yyyy'): string {
  return formatTz(toZonedTime(date, SP_TIMEZONE), pattern, { timeZone: SP_TIMEZONE });
}

/** Componentes de calendário (ano/mês/dia) de um instante UTC no fuso de SP. */
export function saoPauloDateParts(date: Date): { year: number; month: number; day: number } {
  const [year, month, day] = formatInSaoPaulo(date, 'yyyy-MM-dd').split('-').map(Number);
  return { year, month, day };
}

/** Instante UTC do horário de parede de SP para um dia (hora padrão: meio-dia). */
export function saoPauloWallClockToUtc(
  year: number,
  month: number,
  day: number,
  time = '12:00:00',
): Date {
  const p2 = (n: number) => String(n).padStart(2, '0');
  return saoPauloToUtc(`${year}-${p2(month)}-${p2(day)}T${time}`);
}

/**
 * Últimas `n` chaves de mês ("yyyy-MM") no fuso de São Paulo, da mais antiga
 * para a mais recente. Aritmética inteira sobre ano/mês (sem armadilha de fuso).
 */
export function recentMonthKeys(n: number, refKey: string = monthKeyInSaoPaulo(nowUtc())): string[] {
  const [y, m] = refKey.split('-').map(Number);
  let year = y;
  let month = m; // 1-12
  const keys: string[] = [];
  for (let i = 0; i < n; i++) {
    keys.push(`${year}-${String(month).padStart(2, '0')}`);
    month -= 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }
  }
  return keys.reverse();
}
