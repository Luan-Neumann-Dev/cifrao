import { type StatementDateFormat, detectDateFormat, parseStatementDate, toCents } from '@cifrao/shared';
import { deserializeQif } from 'qif-ts';
import { ImportParseError, type ParseResult, type ParsedTransaction } from './types';

/**
 * QIF via `qif-ts`. O formato não declara a ordem da data (americano ou
 * brasileiro), então o formato é adivinhado pela amostra do próprio arquivo —
 * mesma heurística do CSV.
 */
export function parseQif(content: string, dateFormat?: StatementDateFormat): ParseResult {
  let data;
  try {
    data = deserializeQif(content);
  } catch (err) {
    throw new ImportParseError(`Não consegui ler o QIF: ${(err as Error).message}`);
  }

  const rows = data.transactions ?? [];
  if (rows.length === 0) {
    throw new ImportParseError('O QIF foi lido, mas não tem nenhum lançamento.');
  }

  const format =
    dateFormat ?? detectDateFormat(rows.map((row) => row.date ?? '').filter(Boolean));

  const transactions: ParsedTransaction[] = [];
  for (const row of rows) {
    if (!row.date || row.amount === undefined) continue;

    const cents = toCents(row.amount);
    if (cents === 0n) continue;

    const description = [row.payee, row.memo].filter(Boolean).join(' · ') || 'Lançamento importado';

    transactions.push({
      lineNumber: transactions.length + 1,
      date: parseStatementDate(row.date, format),
      amountCents: cents < 0n ? -cents : cents,
      type: cents < 0n ? 'EXPENSE' : 'INCOME',
      description,
      externalId: row.reference ? String(row.reference) : null,
      raw: row as unknown as Record<string, unknown>,
    });
  }

  if (transactions.length === 0) {
    throw new ImportParseError('Nenhuma linha do QIF tinha data e valor.');
  }
  return { transactions, accountLabel: null };
}
