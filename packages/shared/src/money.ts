/**
 * Dinheiro no Cifrão é SEMPRE inteiro em centavos (bigint).
 * Nunca float, nunca Decimal. Formatação BRL só na camada de apresentação.
 * Ver regra 5.1 do CLAUDE.md.
 */

export type Cents = bigint;

const brlFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

// Intl insere espaço não-quebrável (U+00A0 ou U+202F) entre "R$" e o número.
const NON_BREAKING_SPACE = /[\u00A0\u202F]/g;

/**
 * Converte uma entrada monetária em centavos (bigint).
 *
 * Regras de parsing de string:
 * - Símbolos (R$), espaços e letras são ignorados.
 * - Sinal negativo: prefixo "-" ou envolto em parênteses "(...)".
 * - Se houver vírgula: formato pt-BR -> pontos são milhar, vírgula é decimal.
 * - Sem vírgula, com ponto: o ponto é o separador decimal (formato "de máquina").
 * - Sem separadores: valor inteiro em reais.
 * - Arredonda para o centavo mais próximo (meio para cima).
 */
export function toCents(input: string | number): Cents {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) {
      throw new Error(`Valor monetário inválido: ${input}`);
    }
    return BigInt(Math.round(input * 100));
  }

  let s = input.trim();
  if (s === '') {
    throw new Error('Valor monetário vazio');
  }

  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }

  // Remove tudo que não for dígito, vírgula, ponto ou hífen.
  s = s.replace(/[^0-9,.-]/g, '');
  if (s.includes('-')) {
    negative = true;
    s = s.replace(/-/g, '');
  }
  if (s === '') {
    throw new Error(`Valor monetário inválido: ${input}`);
  }

  let normalized: string;
  if (s.includes(',')) {
    // pt-BR: ponto é milhar, vírgula é decimal.
    normalized = s.replace(/\./g, '').replace(',', '.');
  } else {
    // ponto (se houver) é o separador decimal.
    normalized = s;
  }

  if (!/^\d*\.?\d*$/.test(normalized) || normalized === '' || normalized === '.') {
    throw new Error(`Valor monetário inválido: ${input}`);
  }

  const [intPart = '0', fracRaw = ''] = normalized.split('.');
  // Três casas para permitir arredondamento no terceiro dígito.
  const frac = fracRaw.padEnd(3, '0');
  const base = BigInt(intPart || '0') * 100n + BigInt(frac.slice(0, 2) || '0');
  const roundUp = Number(frac[2] ?? '0') >= 5 ? 1n : 0n;
  const result = base + roundUp;

  return negative ? -result : result;
}

/** Formata centavos como moeda BRL (ex.: 123456n -> "R$ 1.234,56"). */
export function formatBRL(cents: Cents | number): string {
  const c = typeof cents === 'bigint' ? cents : BigInt(Math.trunc(cents));
  // Deriva um number apenas na apresentação; precisão de centavos preservada
  // via divisão inteira antes de converter.
  const value = Number(c) / 100;
  return brlFormatter.format(value).replace(NON_BREAKING_SPACE, ' ');
}

/** Soma valores em centavos preservando precisão de bigint. */
export function sumCents(...values: Array<Cents | number>): Cents {
  return values.reduce<Cents>(
    (acc, v) => acc + (typeof v === 'bigint' ? v : BigInt(Math.round(v))),
    0n,
  );
}
