import type { InvestmentClass } from './enums';

/**
 * Lógica pura de investimentos (Fase 8) — preço médio, rentabilidade e alocação.
 *
 * Dois princípios que sustentam tudo aqui:
 *  - Dinheiro é inteiro em centavos (regra 5.1). O **custo investido** é a fonte
 *    da verdade, somado exatamente a cada aporte; o preço médio é DERIVADO dele.
 *    Guardar o preço médio e ir recalculando em cima dele mesmo acumularia erro
 *    de arredondamento a cada aporte.
 *  - Quantidade não é dinheiro: é inteiro na escala 1e-8, porque cripto precisa
 *    de fração e float acumularia erro do mesmo jeito.
 */

/** Quantidade é guardada como inteiro de 1e-8 unidades. */
export const QUANTITY_SCALE = 100_000_000n;
const QUANTITY_DECIMALS = 8;

/**
 * Converte "1,5", "0.00123456" ou "1.000,5" em quantidade inteira na escala
 * 1e-8. Mesmas regras de separador do `toCents`: com vírgula é formato pt-BR
 * (ponto é milhar); sem vírgula, o ponto é o separador decimal.
 */
export function toQuantity(input: string | number): bigint {
  let text = String(input).trim();
  if (text === '') throw new Error('Quantidade vazia');

  const negative = text.startsWith('-');
  text = text.replace(/[^0-9,.]/g, '');

  const normalized = text.includes(',')
    ? text.replace(/\./g, '').replace(',', '.')
    : text;
  if (!/^\d*\.?\d*$/.test(normalized) || normalized === '' || normalized === '.') {
    throw new Error(`Quantidade inválida: ${input}`);
  }

  const [whole = '0', fraction = ''] = normalized.split('.');
  const padded = fraction.padEnd(QUANTITY_DECIMALS, '0').slice(0, QUANTITY_DECIMALS);
  const value = BigInt(whole || '0') * QUANTITY_SCALE + BigInt(padded || '0');
  return negative ? -value : value;
}

/** Formata a quantidade sem zeros à direita ("1.5", "0.00123456", "10"). */
export function formatQuantity(quantity: bigint): string {
  const negative = quantity < 0n;
  const absolute = negative ? -quantity : quantity;
  const whole = absolute / QUANTITY_SCALE;
  const fraction = (absolute % QUANTITY_SCALE).toString().padStart(QUANTITY_DECIMALS, '0');
  const trimmed = fraction.replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole}${trimmed ? `.${trimmed}` : ''}`;
}

/** Divisão inteira arredondando ao mais próximo (meio para cima). */
function divideRound(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) return 0n;
  const negative = numerator < 0n !== denominator < 0n;
  const a = numerator < 0n ? -numerator : numerator;
  const b = denominator < 0n ? -denominator : denominator;
  const result = (a + b / 2n) / b;
  return negative ? -result : result;
}

/** Custo em centavos de `quantity` unidades a `priceCents` cada. */
export function costOfCents(quantity: bigint, priceCents: bigint): bigint {
  return divideRound(quantity * priceCents, QUANTITY_SCALE);
}

/** Preço médio derivado do custo investido — nunca acumulado sobre si mesmo. */
export function averagePriceCents(investedCents: bigint, quantity: bigint): bigint {
  if (quantity <= 0n) return 0n;
  return divideRound(investedCents * QUANTITY_SCALE, quantity);
}

export interface Position {
  quantity: bigint;
  investedCents: bigint;
}

export interface PositionState extends Position {
  avgPriceCents: bigint;
}

export interface TradeInput {
  quantity: bigint;
  priceCents: bigint;
  /** Corretagem e taxas: entram no custo da compra, saem do valor da venda. */
  feesCents?: bigint;
}

export interface TradeResult extends PositionState {
  /** Dinheiro que sai da conta (aporte) ou entra nela (resgate). */
  totalCents: bigint;
  /** Lucro/prejuízo realizado nesta operação (zero em aporte). */
  realizedGainCents: bigint;
}

/**
 * Aceite da Fase 8 — aporte recalcula o preço médio.
 *
 * Preço médio = custo total ÷ quantidade total. As taxas entram no custo, que é
 * como o preço médio é calculado no Brasil para fins de imposto.
 */
export function applyContribution(position: Position, trade: TradeInput): TradeResult {
  if (trade.quantity <= 0n) throw new Error('Quantidade do aporte deve ser positiva');

  const fees = trade.feesCents ?? 0n;
  const totalCents = costOfCents(trade.quantity, trade.priceCents) + fees;
  const quantity = position.quantity + trade.quantity;
  const investedCents = position.investedCents + totalCents;

  return {
    quantity,
    investedCents,
    avgPriceCents: averagePriceCents(investedCents, quantity),
    totalCents,
    realizedGainCents: 0n,
  };
}

/**
 * Resgate. Regra do preço médio brasileiro: a venda **não altera o preço
 * médio** — ela reduz a quantidade e realiza o lucro sobre a parte vendida. O
 * custo investido cai proporcionalmente ao que saiu.
 */
export function applyRedemption(position: Position, trade: TradeInput): TradeResult {
  if (trade.quantity <= 0n) throw new Error('Quantidade do resgate deve ser positiva');
  if (trade.quantity > position.quantity) {
    throw new Error('Resgate maior que a quantidade em carteira');
  }

  const fees = trade.feesCents ?? 0n;
  const grossCents = costOfCents(trade.quantity, trade.priceCents);
  const totalCents = grossCents - fees;

  const avgBefore = averagePriceCents(position.investedCents, position.quantity);
  // Custo da parte vendida: proporcional, para o resto da posição manter o
  // mesmo preço médio depois da venda.
  const soldCostCents =
    trade.quantity === position.quantity
      ? position.investedCents
      : divideRound(position.investedCents * trade.quantity, position.quantity);

  const quantity = position.quantity - trade.quantity;
  const investedCents = position.investedCents - soldCostCents;

  return {
    quantity,
    investedCents,
    // Zerou a posição: preço médio volta a zero; senão, segue o mesmo de antes.
    avgPriceCents: quantity === 0n ? 0n : avgBefore,
    totalCents,
    realizedGainCents: totalCents - soldCostCents,
  };
}

export interface PositionMetrics {
  marketValueCents: bigint;
  investedCents: bigint;
  /** Rentabilidade absoluta: valor de mercado − custo. */
  gainCents: bigint;
  /** Rentabilidade percentual sobre o custo. `null` sem custo (nada investido). */
  gainPercent: number | null;
}

/** Rentabilidade de uma posição contra a cotação atual. */
export function positionMetrics(
  position: Position,
  currentPriceCents: bigint,
): PositionMetrics {
  const marketValueCents = costOfCents(position.quantity, currentPriceCents);
  const gainCents = marketValueCents - position.investedCents;
  const gainPercent =
    position.investedCents === 0n
      ? null
      : Number((gainCents * 10000n) / position.investedCents) / 100;

  return {
    marketValueCents,
    investedCents: position.investedCents,
    gainCents,
    gainPercent,
  };
}

export interface AllocationSlice {
  class: InvestmentClass;
  marketValueCents: bigint;
  /** Participação real na carteira. */
  percent: number;
  targetPercent: number | null;
  /** Real − alvo, em pontos percentuais. Positivo = acima do alvo. */
  deviationPoints: number | null;
  /** Quanto comprar (positivo) ou vender (negativo) para bater o alvo. */
  adjustmentCents: bigint | null;
}

/**
 * Alocação por classe com alvo e desvio. O desvio vem em pontos percentuais e
 * em reais, que é o número acionável: "faltam R$ 2.000 em Renda Fixa".
 */
export function allocationByClass(
  positions: { class: InvestmentClass; marketValueCents: bigint }[],
  targets: Map<InvestmentClass, number> = new Map(),
): AllocationSlice[] {
  const byClass = new Map<InvestmentClass, bigint>();
  for (const position of positions) {
    byClass.set(position.class, (byClass.get(position.class) ?? 0n) + position.marketValueCents);
  }
  // Classe com alvo definido mas sem posição também aparece (falta comprar).
  for (const className of targets.keys()) {
    if (!byClass.has(className)) byClass.set(className, 0n);
  }

  const total = [...byClass.values()].reduce((acc, value) => acc + value, 0n);

  return [...byClass.entries()]
    .map(([className, marketValueCents]) => {
      const percent = total === 0n ? 0 : Number((marketValueCents * 10000n) / total) / 100;
      const targetPercent = targets.get(className) ?? null;
      const idealCents =
        targetPercent === null ? null : divideRound(total * BigInt(targetPercent), 100n);

      return {
        class: className,
        marketValueCents,
        percent,
        targetPercent,
        deviationPoints: targetPercent === null ? null : Number((percent - targetPercent).toFixed(2)),
        adjustmentCents: idealCents === null ? null : idealCents - marketValueCents,
      };
    })
    .sort((a, b) => (b.marketValueCents > a.marketValueCents ? 1 : b.marketValueCents < a.marketValueCents ? -1 : 0));
}
