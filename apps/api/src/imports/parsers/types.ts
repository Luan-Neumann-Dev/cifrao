import type { TransactionType } from '@cifrao/shared';

/**
 * Contrato único de saída dos parsers (regra 5.12). Nenhum parser foi escrito à
 * mão: OFX vem do `ofx-js`, CSV do `papaparse` e QIF do `qif-ts`. Aqui só se
 * normaliza o resultado para o domínio do Cifrão.
 */
export interface ParsedTransaction {
  /** Posição no arquivo, para o usuário achar a linha na revisão. */
  lineNumber: number;
  /** Instante em UTC (regra 5.2). */
  date: Date;
  /** Sempre positivo — o sinal vive no `type`, como no resto do domínio. */
  amountCents: bigint;
  type: Extract<TransactionType, 'EXPENSE' | 'INCOME'>;
  description: string;
  /** FITID do OFX, quando o banco fornece: permite dedupe exato. */
  externalId?: string | null;
  /** Linha crua, guardada para auditoria e remapeamento. */
  raw: Record<string, unknown>;
}

export interface ParseResult {
  transactions: ParsedTransaction[];
  /** Conta detectada no arquivo (nº da conta do OFX), para conferência. */
  accountLabel?: string | null;
  /** Só CSV: colunas encontradas, para a tela de mapeamento. */
  headers?: string[];
}

/** Erro de parsing com mensagem que faz sentido para o usuário final. */
export class ImportParseError extends Error {}
