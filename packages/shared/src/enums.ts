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
