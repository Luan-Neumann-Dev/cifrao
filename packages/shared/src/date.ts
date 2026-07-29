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
