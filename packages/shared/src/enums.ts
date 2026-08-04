import { z } from 'zod';

/**
 * Enums de domínio — espelham o schema.prisma. Fonte única: os schemas Zod aqui
 * derivam os tipos usados no front e validam a entrada no Nest.
 */
export const ACCOUNT_TYPES = ['CHECKING', 'SAVINGS', 'WALLET', 'INVESTMENT'] as const;
export const accountTypeSchema = z.enum(ACCOUNT_TYPES);
export type AccountType = z.infer<typeof accountTypeSchema>;

export const CATEGORY_KINDS = ['EXPENSE', 'INCOME', 'BOTH'] as const;
export const categoryKindSchema = z.enum(CATEGORY_KINDS);
export type CategoryKind = z.infer<typeof categoryKindSchema>;

export const TRANSACTION_TYPES = ['EXPENSE', 'INCOME', 'TRANSFER', 'ADJUSTMENT'] as const;
export const transactionTypeSchema = z.enum(TRANSACTION_TYPES);
export type TransactionType = z.infer<typeof transactionTypeSchema>;

export const TRANSACTION_STATUSES = ['PENDING', 'CLEARED', 'FORECAST'] as const;
export const transactionStatusSchema = z.enum(TRANSACTION_STATUSES);
export type TransactionStatus = z.infer<typeof transactionStatusSchema>;

export const INVOICE_STATUSES = ['OPEN', 'CLOSED', 'PAID', 'PARTIAL'] as const;
export const invoiceStatusSchema = z.enum(INVOICE_STATUSES);
export type InvoiceStatus = z.infer<typeof invoiceStatusSchema>;

export const RECURRENCE_FREQUENCIES = ['WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'] as const;
export const recurrenceFrequencySchema = z.enum(RECURRENCE_FREQUENCIES);
export type RecurrenceFrequency = z.infer<typeof recurrenceFrequencySchema>;

export const IMPORT_FORMATS = ['OFX', 'QIF', 'CSV'] as const;
export const importFormatSchema = z.enum(IMPORT_FORMATS);
export type ImportFormat = z.infer<typeof importFormatSchema>;

export const IMPORT_STATUSES = [
  'UPLOADED',
  'PARSING',
  'NEEDS_MAPPING',
  'REVIEW',
  'CONFIRMED',
  'FAILED',
] as const;
export const importStatusSchema = z.enum(IMPORT_STATUSES);
export type ImportStatus = z.infer<typeof importStatusSchema>;

export const IMPORT_ROW_STATUSES = ['PENDING', 'DUPLICATE', 'IGNORED', 'IMPORTED'] as const;
export const importRowStatusSchema = z.enum(IMPORT_ROW_STATUSES);
export type ImportRowStatus = z.infer<typeof importRowStatusSchema>;

export const INVESTMENT_CLASSES = [
  'STOCKS',
  'REITS',
  'FIXED_INCOME',
  'TREASURY',
  'FUNDS',
  'CRYPTO',
  'INTERNATIONAL',
  'OTHER',
] as const;
export const investmentClassSchema = z.enum(INVESTMENT_CLASSES);
export type InvestmentClass = z.infer<typeof investmentClassSchema>;

/** Rótulos em português, usados na UI e nas exportações. */
export const INVESTMENT_CLASS_LABELS: Record<InvestmentClass, string> = {
  STOCKS: 'Ações',
  REITS: 'FIIs',
  FIXED_INCOME: 'Renda Fixa',
  TREASURY: 'Tesouro',
  FUNDS: 'Fundos',
  CRYPTO: 'Cripto',
  INTERNATIONAL: 'Internacional',
  OTHER: 'Outros',
};

export const INVESTMENT_SOURCES = ['MANUAL', 'SYNCED'] as const;
export const investmentSourceSchema = z.enum(INVESTMENT_SOURCES);
export type InvestmentSource = z.infer<typeof investmentSourceSchema>;

export const INVESTMENT_TRANSACTION_TYPES = ['BUY', 'SELL'] as const;
export const investmentTransactionTypeSchema = z.enum(INVESTMENT_TRANSACTION_TYPES);
export type InvestmentTransactionType = z.infer<typeof investmentTransactionTypeSchema>;
