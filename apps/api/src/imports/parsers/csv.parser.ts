import { type CsvMapping, detectDateFormat, parseStatementDate, toCents } from '@cifrao/shared';
import Papa from 'papaparse';
import { ImportParseError, type ParseResult, type ParsedTransaction } from './types';

type Row = Record<string, string>;

function parseCsv(content: string): { rows: Row[]; headers: string[] } {
  const result = Papa.parse<Row>(content, {
    header: true,
    skipEmptyLines: 'greedy',
    // Alguns bancos exportam com ';'. O papaparse detecta sozinho.
    delimitersToGuess: [',', ';', '\t', '|'],
    transformHeader: (h) => h.trim(),
  });

  const rows = (result.data ?? []).filter((row) => Object.values(row).some((v) => v?.trim()));
  const headers = (result.meta?.fields ?? []).filter(Boolean);
  if (headers.length === 0) {
    throw new ImportParseError('O CSV não tem cabeçalho — não dá para mapear as colunas.');
  }
  return { rows, headers };
}

/**
 * Primeira passada do CSV: só descobre as colunas e mostra a prévia. O
 * mapeamento é escolhido pelo usuário antes de virar linha de staging.
 */
export function inspectCsv(content: string): {
  headers: string[];
  preview: Row[];
  rowCount: number;
  suggestion: Partial<CsvMapping>;
} {
  const { rows, headers } = parseCsv(content);
  return {
    headers,
    preview: rows.slice(0, 5), // prévia de 5 linhas (Fase 6)
    rowCount: rows.length,
    suggestion: suggestMapping(headers, rows),
  };
}

/** "Histórico" -> "historico": o acento não pode atrapalhar o casamento. */
function foldHeader(header: string): string {
  return header
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Chuta o mapeamento pelos nomes de coluna mais comuns em extratos BR. */
function suggestMapping(headers: string[], rows: Row[]): Partial<CsvMapping> {
  const find = (...terms: string[]) =>
    headers.find((h) => terms.some((t) => foldHeader(h).includes(t)));

  // Os termos são escritos sem acento porque o cabeçalho é dobrado antes.
  const date = find('data', 'date');
  const description = find('descri', 'histor', 'memo', 'lancamento', 'detalhe');
  const amount = find('valor', 'amount', 'montante');
  const debit = find('debito', 'debit', 'saida');
  const credit = find('credito', 'credit', 'entrada');

  const suggestion: Partial<CsvMapping> = {};
  if (date) {
    suggestion.date = date;
    suggestion.dateFormat = detectDateFormat(rows.slice(0, 20).map((r) => r[date] ?? ''));
  }
  if (description) suggestion.description = description;
  if (amount) suggestion.amount = amount;
  else {
    if (debit) suggestion.debit = debit;
    if (credit) suggestion.credit = credit;
  }
  return suggestion;
}

/** Converte o CSV em lançamentos usando o mapeamento confirmado pelo usuário. */
export function parseCsvWithMapping(content: string, mapping: CsvMapping): ParseResult {
  const { rows, headers } = parseCsv(content);

  const missing = [mapping.date, mapping.description, mapping.amount, mapping.debit, mapping.credit]
    .filter((column): column is string => Boolean(column))
    .filter((column) => !headers.includes(column));
  if (missing.length > 0) {
    throw new ImportParseError(`Coluna não encontrada no arquivo: ${missing.join(', ')}`);
  }

  const transactions: ParsedTransaction[] = [];
  const problems: string[] = [];

  rows.forEach((row, index) => {
    const lineNumber = index + 2; // +1 do cabeçalho, +1 para virar 1-based
    const rawDate = row[mapping.date]?.trim();
    if (!rawDate) return;

    let cents: bigint;
    try {
      cents = amountOf(row, mapping);
    } catch {
      problems.push(`linha ${lineNumber}: valor ilegível`);
      return;
    }
    if (cents === 0n) return;

    let date: Date;
    try {
      date = parseStatementDate(rawDate, mapping.dateFormat);
    } catch {
      problems.push(`linha ${lineNumber}: data "${rawDate}" não bate com ${mapping.dateFormat}`);
      return;
    }

    if (mapping.invertSign) cents = -cents;

    transactions.push({
      lineNumber,
      date,
      amountCents: cents < 0n ? -cents : cents,
      type: cents < 0n ? 'EXPENSE' : 'INCOME',
      description: row[mapping.description]?.trim() || 'Lançamento importado',
      externalId: null,
      raw: row,
    });
  });

  if (transactions.length === 0) {
    const detail = problems.length > 0 ? ` (${problems.slice(0, 3).join('; ')})` : '';
    throw new ImportParseError(`Nenhuma linha do CSV pôde ser lida${detail}.`);
  }
  return { transactions, headers, accountLabel: null };
}

/** Valor com sinal: coluna única, ou o par débito/crédito. */
function amountOf(row: Row, mapping: CsvMapping): bigint {
  if (mapping.amount) {
    const raw = row[mapping.amount]?.trim();
    return raw ? toCents(raw) : 0n;
  }
  const debit = mapping.debit ? row[mapping.debit]?.trim() : '';
  const credit = mapping.credit ? row[mapping.credit]?.trim() : '';

  if (debit) {
    const value = toCents(debit);
    // Coluna de débito é gasto: normaliza para negativo venha como vier.
    return value > 0n ? -value : value;
  }
  if (credit) {
    const value = toCents(credit);
    return value < 0n ? -value : value;
  }
  return 0n;
}
