import { z } from 'zod';
import {
  accountTypeSchema,
  categoryKindSchema,
  transactionStatusSchema,
  transactionTypeSchema,
} from './enums';

/** Valor monetário em centavos trafega como inteiro seguro (regra 5.1). */
const cents = z.number().int();
const positiveCents = cents.positive();
const hexColor = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Cor deve ser hex (#RGB ou #RRGGBB)');

// ─── Conta ────────────────────────────────────────────────────────────────────

export const createAccountSchema = z.object({
  name: z.string().min(1).max(80),
  type: accountTypeSchema,
  initialBalanceCents: cents.default(0),
  color: hexColor.optional(),
  institution: z.string().max(80).optional(),
});
export type CreateAccountInput = z.infer<typeof createAccountSchema>;

export const updateAccountSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  type: accountTypeSchema.optional(),
  color: hexColor.optional(),
  institution: z.string().max(80).optional().nullable(),
  archived: z.boolean().optional(),
});
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;

/** Regra 5.8: informa-se o saldo real; o sistema lança a diferença (ADJUSTMENT). */
export const adjustBalanceSchema = z.object({
  realBalanceCents: cents,
  date: z.coerce.date().optional(),
  description: z.string().max(200).optional(),
});
export type AdjustBalanceInput = z.infer<typeof adjustBalanceSchema>;

// ─── Categoria ──────────────────────────────────────────────────────────────

export const createCategorySchema = z.object({
  name: z.string().min(1).max(60),
  kind: categoryKindSchema.default('BOTH'),
  icon: z.string().max(40).optional(),
  color: hexColor.optional(),
  parentId: z.string().min(1).optional().nullable(),
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = createCategorySchema.partial();
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

// ─── Tag ──────────────────────────────────────────────────────────────────────

export const createTagSchema = z.object({
  name: z.string().min(1).max(40),
  color: hexColor.optional(),
});
export type CreateTagInput = z.infer<typeof createTagSchema>;

// ─── Lançamentos ───────────────────────────────────────────────────────────────

const cashflowBase = {
  amountCents: positiveCents,
  date: z.coerce.date(),
  description: z.string().min(1).max(200),
  status: transactionStatusSchema.default('CLEARED'),
  notes: z.string().max(2000).optional(),
  isReimbursable: z.boolean().default(false),
  categoryId: z.string().min(1).optional().nullable(),
  tagIds: z.array(z.string().min(1)).optional(),
};

const createExpenseSchema = z.object({
  type: z.literal('EXPENSE'),
  accountId: z.string().min(1),
  ...cashflowBase,
});
const createIncomeSchema = z.object({
  type: z.literal('INCOME'),
  accountId: z.string().min(1),
  ...cashflowBase,
});
const createTransferSchema = z.object({
  type: z.literal('TRANSFER'),
  fromAccountId: z.string().min(1),
  toAccountId: z.string().min(1),
  amountCents: positiveCents,
  date: z.coerce.date(),
  description: z.string().min(1).max(200),
  status: transactionStatusSchema.default('CLEARED'),
  notes: z.string().max(2000).optional(),
});

export const createTransactionSchema = z
  .discriminatedUnion('type', [createExpenseSchema, createIncomeSchema, createTransferSchema])
  .superRefine((data, ctx) => {
    if (data.type === 'TRANSFER' && data.fromAccountId === data.toAccountId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A conta de origem e destino devem ser diferentes.',
        path: ['toAccountId'],
      });
    }
  });
export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;

/** Edição: não troca tipo nem contas (isso é excluir e recriar). */
export const updateTransactionSchema = z.object({
  amountCents: positiveCents.optional(),
  date: z.coerce.date().optional(),
  description: z.string().min(1).max(200).optional(),
  status: transactionStatusSchema.optional(),
  notes: z.string().max(2000).optional().nullable(),
  categoryId: z.string().min(1).optional().nullable(),
  isReimbursable: z.boolean().optional(),
  reimbursedAt: z.coerce.date().optional().nullable(),
  tagIds: z.array(z.string().min(1)).optional(),
});
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;

// ─── Filtros e ações em lote ───────────────────────────────────────────────────

export const transactionFilterSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  type: transactionTypeSchema.optional(),
  accountId: z.string().min(1).optional(),
  categoryId: z.string().min(1).optional(),
  tagId: z.string().min(1).optional(),
  status: transactionStatusSchema.optional(),
  search: z.string().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type TransactionFilter = z.infer<typeof transactionFilterSchema>;

export const bulkActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('categorize'), ids: z.array(z.string()).min(1), categoryId: z.string().min(1) }),
  z.object({ action: z.literal('setStatus'), ids: z.array(z.string()).min(1), status: transactionStatusSchema }),
  z.object({ action: z.literal('addTag'), ids: z.array(z.string()).min(1), tagId: z.string().min(1) }),
  z.object({ action: z.literal('delete'), ids: z.array(z.string()).min(1) }),
]);
export type BulkActionInput = z.infer<typeof bulkActionSchema>;
