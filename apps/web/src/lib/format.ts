import { formatBRL, toCents } from '@cifrao/shared';

/** Formata centavos (string/number/bigint vindos da API) como moeda BRL. */
export function brl(cents: string | number | bigint): string {
  const value = typeof cents === 'string' ? Number(cents) : cents;
  return formatBRL(value);
}

/** Converte uma entrada do usuário ("1.234,56", "R$ 10", "-5") em centavos number. */
export function centsFromInput(input: string): number {
  return Number(toCents(input));
}
