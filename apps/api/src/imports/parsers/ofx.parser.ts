import { parseOfxDate, toCents } from '@cifrao/shared';
import { loadOfx } from './esm';
import { ImportParseError, type ParseResult, type ParsedTransaction } from './types';

/** Navega um caminho no objeto solto que o `ofx-js` devolve. */
function pick(source: unknown, ...path: string[]): unknown {
  let current: unknown = source;
  for (const key of path) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

/** O OFX repete tags sem marcar lista: um item vem objeto, vários vêm array. */
function asArray(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value as Record<string, unknown>[];
  if (value && typeof value === 'object') return [value as Record<string, unknown>];
  return [];
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Extrato de conta e de cartão vivem em ramos diferentes do OFX. Os dois têm a
 * mesma BANKTRANLIST dentro, então basta achar o ramo certo.
 */
const STATEMENT_PATHS: [string, string, string][] = [
  ['BANKMSGSRSV1', 'STMTTRNRS', 'STMTRS'],
  ['CREDITCARDMSGSRSV1', 'CCSTMTTRNRS', 'CCSTMTRS'],
];

export async function parseOfx(content: string): Promise<ParseResult> {
  const ofx = await loadOfx();

  let parsed;
  try {
    parsed = ofx.parseSync(content);
  } catch (err) {
    throw new ImportParseError(`Não consegui ler o OFX: ${(err as Error).message}`);
  }

  const statements: Record<string, unknown>[] = [];
  for (const [msg, trnrs, stmt] of STATEMENT_PATHS) {
    for (const response of asArray(pick(parsed.OFX, msg, trnrs))) {
      statements.push(...asArray(response[stmt]));
    }
  }
  if (statements.length === 0) {
    throw new ImportParseError('O arquivo OFX não tem extrato de conta nem de cartão.');
  }

  const transactions: ParsedTransaction[] = [];
  let accountLabel: string | null = null;

  for (const statement of statements) {
    accountLabel ??=
      text(pick(statement, 'BANKACCTFROM', 'ACCTID')) ||
      text(pick(statement, 'CCACCTFROM', 'ACCTID')) ||
      null;

    for (const row of asArray(pick(statement, 'BANKTRANLIST', 'STMTTRN'))) {
      const rawAmount = text(row.TRNAMT);
      const rawDate = text(row.DTPOSTED) || text(row.DTUSER);
      if (!rawAmount || !rawDate) continue;

      const cents = toCents(rawAmount);
      if (cents === 0n) continue; // lançamento nulo: nada a importar

      // MEMO costuma ser mais descritivo que NAME; usa o que existir.
      const description = text(row.MEMO) || text(row.NAME) || 'Lançamento importado';

      transactions.push({
        lineNumber: transactions.length + 1,
        date: parseOfxDate(rawDate),
        amountCents: cents < 0n ? -cents : cents,
        type: cents < 0n ? 'EXPENSE' : 'INCOME',
        description,
        externalId: text(row.FITID) || null,
        raw: row,
      });
    }
  }

  if (transactions.length === 0) {
    throw new ImportParseError('O OFX foi lido, mas não tem nenhum lançamento.');
  }
  return { transactions, accountLabel };
}
