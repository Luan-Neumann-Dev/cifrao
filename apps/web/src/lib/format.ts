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

export interface BrlParts {
  /** '−' quando negativo (sinal tipográfico, não hífen); vazio quando positivo. */
  sign: string;
  currency: string;
  /** Reais com separador de milhar: "12.480". */
  whole: string;
  /** Centavos já com a vírgula: ",90". */
  fraction: string;
}

/**
 * Quebra o valor formatado nas partes que o design mostra em tamanhos
 * diferentes: "R$" pequeno, os reais grandes e os centavos no meio (Seção 4).
 */
export function splitBrl(cents: string | number | bigint): BrlParts {
  const value = typeof cents === 'string' ? Number(cents) : Number(cents);
  // Formata o módulo: o sinal do design é tipográfico e vai à parte.
  const [currency = 'R$', number = '0,00'] = brl(Math.abs(value)).split(' ');
  const comma = number.lastIndexOf(',');
  return {
    sign: value < 0 ? '−' : '',
    currency,
    whole: comma === -1 ? number : number.slice(0, comma),
    fraction: comma === -1 ? '' : number.slice(comma),
  };
}
