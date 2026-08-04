/**
 * Lógica pura da importação (regra 5.12) — sem Prisma, sem I/O, sem parser.
 *
 * Aqui ficam garantidas por teste:
 *  - a detecção de duplicata (mesma conta + data ±3 dias + mesmo valor +
 *    descrição similar), incluindo o atalho exato pelo FITID do OFX;
 *  - o motor de `CategoryRule` (padrão de descrição + faixa de valor opcional).
 *
 * Os parsers de OFX/QIF/CSV vivem na API porque dependem de libs de Node.
 */

import { saoPauloWallClockToUtc } from './date';

/** Janela de tolerância da data na detecção de duplicata (regra 5.12). */
export const DUPLICATE_DAY_WINDOW = 3;

/** A partir daqui duas descrições são consideradas "a mesma coisa". */
export const DUPLICATE_SIMILARITY_THRESHOLD = 0.6;

const MS_PER_DAY = 86_400_000;

/**
 * Normaliza uma descrição de extrato para comparação: minúsculas, sem acento,
 * sem ruído de banco (datas, sufixos de parcela, asteriscos, ids numéricos
 * longos) e com espaços colapsados. "COMPRA CARTAO *UBER   *TRIP 12/05" e
 * "Compra Cartão Uber Trip" convergem para o mesmo texto.
 */
export function normalizeDescription(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // tira acento (marcas combinantes)
    .toLowerCase()
    .replace(/\d{2}[/-]\d{2}([/-]\d{2,4})?/g, ' ') // datas
    .replace(/\b\d{1,2}\s*\/\s*\d{1,2}\b/g, ' ') // "3/12" de parcela
    .replace(/\b\d{6,}\b/g, ' ') // ids longos
    .replace(/[^a-z0-9\s]/g, ' ') // pontuação, asterisco, etc.
    .replace(/\s+/g, ' ')
    .trim();
}

/** Trigramas de um texto normalizado, com bordas para valorizar prefixos. */
function trigrams(text: string): Set<string> {
  const padded = `  ${text} `;
  const out = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) {
    out.add(padded.slice(i, i + 3));
  }
  return out;
}

/** Palavras que carregam significado (descarta "sp", "de", ruído de 1–2 letras). */
function significantTokens(normalized: string): Set<string> {
  return new Set(normalized.split(' ').filter((token) => token.length >= 3));
}

/**
 * Similaridade de descrições em [0, 1] — o critério de "descrição similar" da
 * regra 5.12 (decisão do dono: trigramas).
 *
 * Duas etapas, porque extrato bancário raramente repete o texto igual:
 *  1. **Contenção por palavra**: se todas as palavras significativas de uma
 *     descrição aparecem na outra, é o mesmo estabelecimento com ruído do banco
 *     ("Uber Trip" ⊂ "UBER *TRIP HELP.UBER.COM") — vale 1. A comparação é por
 *     token inteiro, então "UBER" NÃO casa com "UBERABA SUPERMERCADO".
 *  2. Caso contrário, coeficiente de Dice sobre trigramas, que tolera abreviação
 *     e erro de digitação sem casar estabelecimentos diferentes.
 */
export function descriptionSimilarity(a: string, b: string): number {
  const left = normalizeDescription(a);
  const right = normalizeDescription(b);
  if (!left || !right) return 0;
  if (left === right) return 1;

  const tokensLeft = significantTokens(left);
  const tokensRight = significantTokens(right);
  const [smaller, larger] =
    tokensLeft.size <= tokensRight.size ? [tokensLeft, tokensRight] : [tokensRight, tokensLeft];
  if (smaller.size > 0 && [...smaller].every((token) => larger.has(token))) return 1;

  const setA = trigrams(left);
  const setB = trigrams(right);
  let intersection = 0;
  for (const gram of setA) {
    if (setB.has(gram)) intersection += 1;
  }
  const total = setA.size + setB.size;
  return total === 0 ? 0 : (2 * intersection) / total;
}

/** Diferença absoluta em dias entre dois instantes (só a parte de calendário). */
export function daysApart(a: Date, b: Date): number {
  const dayA = Math.floor(a.getTime() / MS_PER_DAY);
  const dayB = Math.floor(b.getTime() / MS_PER_DAY);
  return Math.abs(dayA - dayB);
}

// ─── Datas de extrato (regra 5.2: persistir em UTC) ───────────────────────────

export const DATE_FORMATS = ['dd/MM/yyyy', 'MM/dd/yyyy', 'yyyy-MM-dd'] as const;
export type StatementDateFormat = (typeof DATE_FORMATS)[number];

/**
 * Data do OFX: `YYYYMMDD[HHMMSS][[±H:TZ]]`. Com offset explícito, ele manda; sem
 * offset, o horário é lido como hora de parede de São Paulo. Sempre devolve UTC.
 */
export function parseOfxDate(raw: string): Date {
  const digits = raw.trim().match(/^(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?/);
  if (!digits) throw new Error(`Data OFX inválida: ${raw}`);

  const [, y, mo, d, h = '12', mi = '00', s = '00'] = digits;
  const offset = raw.match(/\[([+-]?\d+(?:\.\d+)?):?[^\]]*\]/);

  if (offset) {
    const hours = Number(offset[1]);
    const ms = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
    return new Date(ms - hours * 3_600_000);
  }
  return saoPauloWallClockToUtc(Number(y), Number(mo), Number(d), `${h}:${mi}:${s}`);
}

/**
 * Data de CSV/QIF num dos formatos aceitos, lida como dia de calendário em São
 * Paulo (meio-dia, para não escorregar de dia com a virada de fuso).
 */
export function parseStatementDate(raw: string, format: StatementDateFormat): Date {
  const parts = raw.trim().match(/(\d{1,4})\D+(\d{1,2})\D+(\d{1,4})/);
  if (!parts) throw new Error(`Data inválida: ${raw}`);
  const [, a, b, c] = parts;

  let year: number;
  let month: number;
  let day: number;
  if (format === 'yyyy-MM-dd') {
    [year, month, day] = [Number(a), Number(b), Number(c)];
  } else if (format === 'MM/dd/yyyy') {
    [month, day, year] = [Number(a), Number(b), Number(c)];
  } else {
    [day, month, year] = [Number(a), Number(b), Number(c)];
  }
  if (year < 100) year += year < 70 ? 2000 : 1900; // "26" -> 2026
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    throw new Error(`Data inválida: ${raw}`);
  }
  return saoPauloWallClockToUtc(year, month, day, '12:00:00');
}

/**
 * Adivinha o formato de data de uma amostra de linhas. Só decide "MM/dd" quando
 * a evidência aponta para isso; no empate assume o padrão brasileiro (dd/MM),
 * que é o caso do dono. A UI mostra o formato escolhido e deixa trocar.
 */
export function detectDateFormat(samples: string[]): StatementDateFormat {
  let firstOverTwelve = 0;
  let secondOverTwelve = 0;

  for (const sample of samples) {
    const value = sample?.trim() ?? '';
    if (/^\d{4}\D/.test(value)) return 'yyyy-MM-dd';
    const parts = value.match(/(\d{1,2})\D+(\d{1,2})\D+(\d{2,4})/);
    if (!parts) continue;
    if (Number(parts[1]) > 12) firstOverTwelve += 1;
    if (Number(parts[2]) > 12) secondOverTwelve += 1;
  }
  if (secondOverTwelve > firstOverTwelve) return 'MM/dd/yyyy';
  return 'dd/MM/yyyy';
}

export interface ImportCandidate {
  date: Date;
  amountCents: bigint;
  description: string;
  /** FITID do OFX, quando o banco fornece. */
  externalId?: string | null;
}

export interface ExistingTransaction {
  id: string;
  date: Date;
  amountCents: bigint;
  description: string;
  externalId?: string | null;
}

export interface DuplicateMatch {
  id: string;
  score: number;
  /** `exact` = mesmo FITID; `heuristic` = data + valor + descrição similar. */
  reason: 'exact' | 'heuristic';
}

/**
 * Regra 5.12 — acha o lançamento existente que provavelmente é o mesmo desta
 * linha. `existing` já deve vir filtrado pela MESMA CONTA. Precedência: FITID
 * igual ganha de tudo; senão exige mesmo valor, data dentro da janela e
 * descrição acima do limiar, escolhendo a maior similaridade.
 */
export function findDuplicate(
  candidate: ImportCandidate,
  existing: ExistingTransaction[],
  options: { dayWindow?: number; threshold?: number } = {},
): DuplicateMatch | null {
  const dayWindow = options.dayWindow ?? DUPLICATE_DAY_WINDOW;
  const threshold = options.threshold ?? DUPLICATE_SIMILARITY_THRESHOLD;

  if (candidate.externalId) {
    const exact = existing.find((tx) => tx.externalId && tx.externalId === candidate.externalId);
    if (exact) return { id: exact.id, score: 1, reason: 'exact' };
  }

  let best: DuplicateMatch | null = null;
  for (const tx of existing) {
    if (tx.amountCents !== candidate.amountCents) continue;
    if (daysApart(tx.date, candidate.date) > dayWindow) continue;

    const score = descriptionSimilarity(candidate.description, tx.description);
    if (score < threshold) continue;
    if (!best || score > best.score) best = { id: tx.id, score, reason: 'heuristic' };
  }
  return best;
}

// ─── Motor de CategoryRule ────────────────────────────────────────────────────

export interface CategoryRuleLike {
  id: string;
  /** Trecho da descrição a casar (comparado já normalizado). */
  pattern: string;
  minCents?: bigint | null;
  maxCents?: bigint | null;
  categoryId: string;
  active?: boolean;
  appliedCount?: number;
}

export interface RuleMatch {
  ruleId: string;
  categoryId: string;
}

/**
 * Regra 5.12 — casa a descrição (e a faixa de valor, quando definida) com as
 * regras aprendidas. Vence a regra de padrão mais longo (mais específica); em
 * empate, a mais usada. Regras inativas são ignoradas.
 */
export function matchCategoryRule(
  rules: CategoryRuleLike[],
  input: { description: string; amountCents: bigint },
): RuleMatch | null {
  const haystack = normalizeDescription(input.description);
  const amount = input.amountCents < 0n ? -input.amountCents : input.amountCents;

  const candidates = rules.filter((rule) => {
    if (rule.active === false) return false;
    const needle = normalizeDescription(rule.pattern);
    if (!needle || !haystack.includes(needle)) return false;
    if (rule.minCents != null && amount < rule.minCents) return false;
    if (rule.maxCents != null && amount > rule.maxCents) return false;
    return true;
  });
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const byLength = normalizeDescription(b.pattern).length - normalizeDescription(a.pattern).length;
    if (byLength !== 0) return byLength;
    return (b.appliedCount ?? 0) - (a.appliedCount ?? 0);
  });
  const winner = candidates[0];
  return { ruleId: winner.id, categoryId: winner.categoryId };
}

/**
 * Sugere o padrão de uma nova regra a partir de uma descrição: usa o miolo
 * significativo (descarta tokens numéricos e palavras muito curtas). É o texto
 * que aparece pré-preenchido em "aplicar a todos e criar regra".
 */
export function suggestRulePattern(description: string, maxWords = 3): string {
  const words = normalizeDescription(description)
    .split(' ')
    .filter((w) => w.length > 2 && !/^\d+$/.test(w));
  return words.slice(0, maxWords).join(' ');
}

/** Quantas linhas do lote casariam com esse padrão (o "N" do botão). */
export function countMatchingPattern(
  pattern: string,
  rows: { description: string }[],
): number {
  const needle = normalizeDescription(pattern);
  if (!needle) return 0;
  return rows.filter((row) => normalizeDescription(row.description).includes(needle)).length;
}
