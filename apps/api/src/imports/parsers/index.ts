import type { CsvMapping, ImportFormat } from '@cifrao/shared';
import { inspectCsv, parseCsvWithMapping } from './csv.parser';
import { parseOfx } from './ofx.parser';
import { parseQif } from './qif.parser';
import { ImportParseError, type ParseResult } from './types';

export { decodeUpload } from './encoding';
export { inspectCsv } from './csv.parser';
export { ImportParseError };
export type { ParseResult, ParsedTransaction } from './types';

/**
 * Detecção de formato pelo conteúdo (regra 5.12), com o nome do arquivo só como
 * desempate. O conteúdo manda porque extrato baixado do banco vem com nome
 * genérico e extensão errada mais vezes do que se imagina.
 */
export function detectFormat(content: string, filename?: string): ImportFormat | null {
  const head = content.slice(0, 2000).toUpperCase();
  if (head.includes('OFXHEADER') || head.includes('<OFX>')) return 'OFX';
  if (/^\s*!TYPE:/im.test(head) || head.includes('!ACCOUNT')) return 'QIF';

  const extension = filename?.toLowerCase().match(/\.(ofx|qfx|qif|csv|txt)$/)?.[1];
  if (extension === 'ofx' || extension === 'qfx') return 'OFX';
  if (extension === 'qif') return 'QIF';
  if (extension === 'csv' || extension === 'txt') return 'CSV';

  // Última tentativa: parece tabela com separador e cabeçalho?
  const firstLine = content.split(/\r?\n/, 1)[0] ?? '';
  if (/[,;\t]/.test(firstLine)) return 'CSV';
  return null;
}

/**
 * Roda o parser do formato. CSV só passa por aqui depois que o usuário confirma
 * o mapeamento de colunas — sem ele, a etapa é `inspectCsv`.
 */
export async function parseImport(
  format: ImportFormat,
  content: string,
  mapping?: CsvMapping | null,
): Promise<ParseResult> {
  switch (format) {
    case 'OFX':
      return parseOfx(content);
    case 'QIF':
      return parseQif(content);
    case 'CSV': {
      if (!mapping) {
        throw new ImportParseError('O CSV precisa do mapeamento de colunas antes de ser lido.');
      }
      return parseCsvWithMapping(content, mapping);
    }
    default:
      throw new ImportParseError(`Formato não suportado: ${String(format)}`);
  }
}

/** Prévia de 5 linhas para o CSV, usada na tela de mapeamento. */
export function previewCsv(content: string) {
  return inspectCsv(content);
}
