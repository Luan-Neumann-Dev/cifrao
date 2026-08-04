/**
 * Lógica pura dos relatórios (Fase 7) — sem Prisma, sem I/O.
 *
 * O aceite da fase é "os números do relatório batem exatamente com a soma dos
 * lançamentos filtrados". Por isso tudo aqui é inteiro em centavos (regra 5.1) e
 * nada arredonda no meio do caminho: percentual só é derivado na saída.
 */

import { addMonths, daysInMonth } from './card-logic';
import { saoPauloDateParts, saoPauloWallClockToUtc } from './date';

export type Granularity = 'day' | 'month';

const MS_PER_DAY = 86_400_000;

export interface Period {
  from: Date;
  to: Date;
}

/** O período é exatamente um mês de calendário inteiro (no fuso de São Paulo)? */
function isFullCalendarMonth(period: Period): boolean {
  const from = saoPauloDateParts(period.from);
  const to = saoPauloDateParts(period.to);
  return (
    from.day === 1 &&
    from.year === to.year &&
    from.month === to.month &&
    to.day === daysInMonth(to.year, to.month)
  );
}

/**
 * Período imediatamente anterior (decisão do dono).
 *
 * Mês cheio compara com o mês cheio anterior — 01–31/03 vai contra 01–28/02, e
 * não contra "os 31 dias anteriores", que cairia no meio de janeiro e
 * misturaria dois meses. Para qualquer outro recorte, vale a janela do mesmo
 * tamanho colada antes: 45 dias contra os 45 dias anteriores.
 */
export function previousPeriod(period: Period): Period {
  if (isFullCalendarMonth(period)) {
    const from = saoPauloDateParts(period.from);
    const previous = addMonths(from.year, from.month, -1);
    const lastDay = daysInMonth(previous.year, previous.month);
    return {
      from: saoPauloWallClockToUtc(previous.year, previous.month, 1, '00:00:00'),
      to: saoPauloWallClockToUtc(previous.year, previous.month, lastDay, '23:59:59'),
    };
  }

  const span = period.to.getTime() - period.from.getTime();
  return {
    from: new Date(period.from.getTime() - span - MS_PER_DAY),
    to: new Date(period.from.getTime() - MS_PER_DAY),
  };
}

/** Dias inteiros no período (inclusive nas duas pontas). */
export function periodDays(period: Period): number {
  return Math.max(1, Math.round((period.to.getTime() - period.from.getTime()) / MS_PER_DAY) + 1);
}

/**
 * Granularidade da série: até ~2 meses o gráfico faz sentido por dia; acima
 * disso, por mês (senão vira serragem ilegível em 380px).
 */
export function pickGranularity(period: Period): Granularity {
  return periodDays(period) <= 62 ? 'day' : 'month';
}

export interface Variation {
  currentCents: bigint;
  previousCents: bigint;
  deltaCents: bigint;
  /** `null` quando não havia base de comparação (período anterior zerado). */
  percentChange: number | null;
}

/** Variação contra o período anterior. Sem base anterior, o percentual é nulo. */
export function computeVariation(currentCents: bigint, previousCents: bigint): Variation {
  const deltaCents = currentCents - previousCents;
  const percentChange =
    previousCents === 0n ? null : Number((deltaCents * 10000n) / absBigInt(previousCents)) / 100;
  return { currentCents, previousCents, deltaCents, percentChange };
}

/** Participação de uma parte no total, em porcentagem (0 quando não há total). */
export function percentOf(partCents: bigint, totalCents: bigint): number {
  if (totalCents === 0n) return 0;
  return Number((partCents * 10000n) / absBigInt(totalCents)) / 100;
}

/** Média por lançamento, truncando para o centavo. */
export function averageCents(totalCents: bigint, count: number): bigint {
  if (count <= 0) return 0n;
  return totalCents / BigInt(count);
}

export interface SeriesPoint {
  bucket: string;
  incomeCents: bigint;
  expenseCents: bigint;
}

export interface AccumulatedPoint extends SeriesPoint {
  netCents: bigint;
  /** Saldo acumulado do período até este ponto. */
  cumulativeCents: bigint;
}

/** Fecha a série com o líquido de cada ponto e o acumulado corrente. */
export function accumulateSeries(points: SeriesPoint[]): AccumulatedPoint[] {
  let running = 0n;
  return points.map((point) => {
    const netCents = point.incomeCents - point.expenseCents;
    running += netCents;
    return { ...point, netCents, cumulativeCents: running };
  });
}

export interface CategoryRow {
  categoryId: string | null;
  totalCents: bigint;
  count: number;
  previousCents: bigint;
}

export interface CategoryReportRow extends CategoryRow {
  percent: number;
  averageCents: bigint;
  deltaCents: bigint;
  percentChange: number | null;
}

/**
 * Fecha a tabela por categoria: participação no total, média por lançamento e
 * variação contra o período anterior. Ordena pelo maior gasto.
 */
export function buildCategoryReport(
  rows: CategoryRow[],
  totalCents: bigint,
): CategoryReportRow[] {
  return rows
    .map((row) => {
      const variation = computeVariation(row.totalCents, row.previousCents);
      return {
        ...row,
        percent: percentOf(row.totalCents, totalCents),
        averageCents: averageCents(row.totalCents, row.count),
        deltaCents: variation.deltaCents,
        percentChange: variation.percentChange,
      };
    })
    .sort((a, b) => (b.totalCents > a.totalCents ? 1 : b.totalCents < a.totalCents ? -1 : 0));
}

/**
 * As categorias que mais se mexeram contra o período anterior, em valor
 * absoluto — tanto quem estourou quanto quem economizou.
 */
export function biggestVariations<T extends { deltaCents: bigint }>(rows: T[], limit = 5): T[] {
  return [...rows]
    .filter((row) => row.deltaCents !== 0n)
    .sort((a, b) => {
      const left = absBigInt(a.deltaCents);
      const right = absBigInt(b.deltaCents);
      return right > left ? 1 : right < left ? -1 : 0;
    })
    .slice(0, limit);
}

function absBigInt(value: bigint): bigint {
  return value < 0n ? -value : value;
}

/**
 * Escapa um campo para CSV: aspas duplicadas, e envolve quando há separador,
 * aspa ou quebra de linha. Sem isso, uma descrição com ";" quebra a planilha.
 */
export function csvCell(value: string | number | bigint | null | undefined): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/[";\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** Monta um CSV com `;` (o separador que o Excel pt-BR abre sem perguntar). */
export function toCsv(headers: string[], rows: (string | number | bigint | null)[][]): string {
  const lines = [headers.map(csvCell).join(';')];
  for (const row of rows) {
    lines.push(row.map(csvCell).join(';'));
  }
  // BOM para o Excel reconhecer UTF-8 e não estragar acento.
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
