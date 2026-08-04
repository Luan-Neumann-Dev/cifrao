import { z } from 'zod';
import {
  accountTypeSchema,
  categoryKindSchema,
  importFormatSchema,
  importRowStatusSchema,
  investmentClassSchema,
  recurrenceFrequencySchema,
  transactionStatusSchema,
  transactionTypeSchema,
} from './enums';
import { DATE_FORMATS } from './import-logic';

const dayOfMonth = z.number().int().min(1).max(31);

/** Chave de mês "yyyy-MM" (fuso de São Paulo). */
export const monthKeySchema = z.string().regex(/^\d{4}-\d{2}$/, 'Mês deve ser yyyy-MM');

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

// ─── Cartão de crédito ─────────────────────────────────────────────────────────

export const createCreditCardSchema = z.object({
  nickname: z.string().min(1).max(60),
  brand: z.string().max(30).optional(),
  last4: z
    .string()
    .regex(/^\d{4}$/, 'Informe os 4 últimos dígitos')
    .optional(),
  limitCents: positiveCents,
  closingDay: dayOfMonth,
  dueDay: dayOfMonth,
  color: hexColor.optional(),
  defaultPaymentAccountId: z.string().min(1).optional().nullable(),
});
export type CreateCreditCardInput = z.infer<typeof createCreditCardSchema>;

export const updateCreditCardSchema = z.object({
  nickname: z.string().min(1).max(60).optional(),
  brand: z.string().max(30).optional().nullable(),
  last4: z
    .string()
    .regex(/^\d{4}$/, 'Informe os 4 últimos dígitos')
    .optional()
    .nullable(),
  limitCents: positiveCents.optional(),
  closingDay: dayOfMonth.optional(),
  dueDay: dayOfMonth.optional(),
  color: hexColor.optional().nullable(),
  defaultPaymentAccountId: z.string().min(1).optional().nullable(),
  archived: z.boolean().optional(),
});
export type UpdateCreditCardInput = z.infer<typeof updateCreditCardSchema>;

/** Compra no cartão (regra 5.4): `installments` gera N parcelas em N faturas. */
export const createCardPurchaseSchema = z.object({
  amountCents: positiveCents,
  date: z.coerce.date(),
  description: z.string().min(1).max(200),
  installments: z.number().int().min(1).max(72).default(1),
  categoryId: z.string().min(1).optional().nullable(),
  status: transactionStatusSchema.default('CLEARED'),
  notes: z.string().max(2000).optional(),
  isReimbursable: z.boolean().default(false),
  tagIds: z.array(z.string().min(1)).optional(),
});
export type CreateCardPurchaseInput = z.infer<typeof createCardPurchaseSchema>;

/** Pagamento de fatura (regra 5.6): transferência da conta; total ou parcial. */
export const payInvoiceSchema = z.object({
  accountId: z.string().min(1),
  amountCents: positiveCents,
  date: z.coerce.date().optional(),
});
export type PayInvoiceInput = z.infer<typeof payInvoiceSchema>;

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

/**
 * Regra 5.13 — registrar o recebimento de um reembolsável. Gera um estorno
 * vinculado que credita a conta e abate o gasto. Sem `amountCents`, estorna o
 * que ainda falta (suporta reembolso parcial).
 */
export const reimburseSchema = z.object({
  accountId: z.string().min(1),
  amountCents: positiveCents.optional(),
  date: z.coerce.date().optional(),
});
export type ReimburseInput = z.infer<typeof reimburseSchema>;

// ─── Importação (regra 5.12) ──────────────────────────────────────────────────

/**
 * Upload. O conteúdo trafega em base64 porque extrato de banco BR costuma vir em
 * windows-1252 — decodificar no servidor evita corromper acento na descrição.
 */
export const createImportSchema = z.object({
  filename: z.string().min(1).max(200),
  contentBase64: z.string().min(1),
  /** Se omitido, é detectado pelo conteúdo do arquivo. */
  format: importFormatSchema.optional(),
  accountId: z.string().min(1).optional(),
});
export type CreateImportInput = z.infer<typeof createImportSchema>;

/** Mapeamento de colunas do CSV — só o CSV precisa desta etapa. */
export const csvMappingSchema = z
  .object({
    date: z.string().min(1),
    description: z.string().min(1),
    /** Coluna única com sinal… */
    amount: z.string().min(1).optional(),
    /** …ou par débito/crédito, como alguns bancos exportam. */
    debit: z.string().min(1).optional(),
    credit: z.string().min(1).optional(),
    dateFormat: z.enum(DATE_FORMATS).default('dd/MM/yyyy'),
    /** Para extratos que exportam despesa como positivo. */
    invertSign: z.boolean().default(false),
  })
  .superRefine((data, ctx) => {
    if (!data.amount && !data.debit && !data.credit) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Escolha a coluna de valor, ou as colunas de débito e crédito.',
        path: ['amount'],
      });
    }
  });
export type CsvMapping = z.infer<typeof csvMappingSchema>;

export const setImportAccountSchema = z.object({ accountId: z.string().min(1) });
export type SetImportAccountInput = z.infer<typeof setImportAccountSchema>;

/** Edição de uma linha na revisão (categorizar, ignorar, corrigir descrição). */
export const updateImportRowSchema = z.object({
  categoryId: z.string().min(1).optional().nullable(),
  status: importRowStatusSchema.optional(),
  description: z.string().min(1).max(200).optional(),
});
export type UpdateImportRowInput = z.infer<typeof updateImportRowSchema>;

/**
 * Regra 5.12 — "aplicar a todos os N lançamentos com esse padrão e criar regra".
 * Categoriza as linhas do lote que casam e, por padrão, aprende a `CategoryRule`.
 */
export const applyPatternSchema = z.object({
  pattern: z.string().min(2).max(120),
  categoryId: z.string().min(1),
  createRule: z.boolean().default(true),
  minCents: cents.nonnegative().optional().nullable(),
  maxCents: cents.nonnegative().optional().nullable(),
});
export type ApplyPatternInput = z.infer<typeof applyPatternSchema>;

export const createCategoryRuleSchema = z.object({
  pattern: z.string().min(2).max(120),
  categoryId: z.string().min(1),
  minCents: cents.nonnegative().optional().nullable(),
  maxCents: cents.nonnegative().optional().nullable(),
});
export type CreateCategoryRuleInput = z.infer<typeof createCategoryRuleSchema>;

export const updateCategoryRuleSchema = z.object({
  pattern: z.string().min(2).max(120).optional(),
  categoryId: z.string().min(1).optional(),
  minCents: cents.nonnegative().optional().nullable(),
  maxCents: cents.nonnegative().optional().nullable(),
  active: z.boolean().optional(),
});
export type UpdateCategoryRuleInput = z.infer<typeof updateCategoryRuleSchema>;

// ─── Investimentos (Fase 8) ───────────────────────────────────────────────────

/** Quantidade trafega como string e é convertida com `toQuantity` (escala 1e-8). */
const quantityInput = z.string().min(1).max(30);

export const createInvestmentSchema = z.object({
  ticker: z
    .string()
    .min(1)
    .max(20)
    .transform((value) => value.trim().toUpperCase()),
  name: z.string().max(120).optional(),
  class: investmentClassSchema,
  currentPriceCents: cents.nonnegative().optional(),
  notes: z.string().max(2000).optional(),
});
export type CreateInvestmentInput = z.infer<typeof createInvestmentSchema>;

export const updateInvestmentSchema = z.object({
  name: z.string().max(120).optional().nullable(),
  class: investmentClassSchema.optional(),
  notes: z.string().max(2000).optional().nullable(),
  archived: z.boolean().optional(),
});
export type UpdateInvestmentInput = z.infer<typeof updateInvestmentSchema>;

/**
 * Aporte ou resgate. `accountId` é opcional (decisão do dono): com conta, o
 * dinheiro sai/entra de verdade e vira lançamento; sem conta, só registra a
 * posição — serve para cadastrar carteira antiga sem reconstruir histórico.
 */
export const investmentTradeSchema = z.object({
  quantity: quantityInput,
  priceCents: positiveCents,
  feesCents: cents.nonnegative().default(0),
  date: z.coerce.date(),
  accountId: z.string().min(1).optional().nullable(),
  notes: z.string().max(500).optional(),
});
export type InvestmentTradeInput = z.infer<typeof investmentTradeSchema>;

/** Cotação manual (a Fase 8 não integra API de preço). Grava no PriceHistory. */
export const updatePriceSchema = z.object({
  priceCents: cents.nonnegative(),
  date: z.coerce.date().optional(),
});
export type UpdatePriceInput = z.infer<typeof updatePriceSchema>;

export const allocationTargetsSchema = z.object({
  targets: z.array(
    z.object({
      class: investmentClassSchema,
      targetPercent: z.number().int().min(0).max(100),
    }),
  ),
});
export type AllocationTargetsInput = z.infer<typeof allocationTargetsSchema>;

// ─── Relatórios (Fase 7) ──────────────────────────────────────────────────────

/**
 * Janela do relatório. As datas vêm como "yyyy-MM-dd" e são lidas como DIAS DE
 * CALENDÁRIO de São Paulo — `to` inclui o dia inteiro (regra 5.2). Se virassem
 * `Date` direto, "2026-03-31" seria meia-noite UTC, que em São Paulo ainda é
 * dia 30, e o relatório perderia o último dia do mês.
 */
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Data deve ser yyyy-MM-dd');

export const reportQuerySchema = z.object({
  from: isoDay.optional(),
  to: isoDay.optional(),
  accountId: z.string().min(1).optional(),
});
export type ReportQuery = z.infer<typeof reportQuerySchema>;

export const REPORT_EXPORTS = ['categorias', 'lancamentos', 'serie', 'estabelecimentos'] as const;
export const reportExportSchema = reportQuerySchema.extend({
  section: z.enum(REPORT_EXPORTS).default('categorias'),
});
export type ReportExportQuery = z.infer<typeof reportExportSchema>;

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

// ─── Dashboard ──────────────────────────────────────────────────────────────

export const dashboardQuerySchema = z.object({
  /** Mês de referência "yyyy-MM" (fuso de São Paulo). Padrão: mês corrente. */
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, 'Mês deve ser yyyy-MM')
    .optional(),
});
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;

// ─── Recorrências (regra 5.11) ────────────────────────────────────────────────

const recurrenceBase = {
  description: z.string().min(1).max(200),
  amountCents: positiveCents,
  frequency: recurrenceFrequencySchema,
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional().nullable(),
  /** Dia do mês nas frequências mensais; padrão = dia do startDate. */
  dayOfMonth: dayOfMonth.optional().nullable(),
  notes: z.string().max(2000).optional(),
  active: z.boolean().default(true),
};

const recurringExpenseSchema = z.object({
  type: z.literal('EXPENSE'),
  accountId: z.string().min(1),
  categoryId: z.string().min(1).optional().nullable(),
  ...recurrenceBase,
});
const recurringIncomeSchema = z.object({
  type: z.literal('INCOME'),
  accountId: z.string().min(1),
  categoryId: z.string().min(1).optional().nullable(),
  ...recurrenceBase,
});
const recurringTransferSchema = z.object({
  type: z.literal('TRANSFER'),
  fromAccountId: z.string().min(1),
  toAccountId: z.string().min(1),
  ...recurrenceBase,
});

/** Decisão da Fase 5: recorrência cobre conta (despesa/receita/transferência). */
export const createRecurringRuleSchema = z
  .discriminatedUnion('type', [recurringExpenseSchema, recurringIncomeSchema, recurringTransferSchema])
  .superRefine((data, ctx) => {
    if (data.type === 'TRANSFER' && data.fromAccountId === data.toAccountId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A conta de origem e destino devem ser diferentes.',
        path: ['toAccountId'],
      });
    }
    if (data.endDate && data.endDate < data.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A data final não pode ser antes do início.',
        path: ['endDate'],
      });
    }
  });
export type CreateRecurringRuleInput = z.infer<typeof createRecurringRuleSchema>;

/** Edição não troca tipo nem contas (isso é excluir e recriar, como no lançamento). */
export const updateRecurringRuleSchema = z.object({
  description: z.string().min(1).max(200).optional(),
  amountCents: positiveCents.optional(),
  frequency: recurrenceFrequencySchema.optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional().nullable(),
  dayOfMonth: dayOfMonth.optional().nullable(),
  categoryId: z.string().min(1).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  active: z.boolean().optional(),
});
export type UpdateRecurringRuleInput = z.infer<typeof updateRecurringRuleSchema>;

// ─── Orçamento (regra 5.10) ───────────────────────────────────────────────────

export const upsertBudgetSchema = z.object({
  categoryId: z.string().min(1),
  month: monthKeySchema,
  limitCents: cents.nonnegative(),
});
export type UpsertBudgetInput = z.infer<typeof upsertBudgetSchema>;

export const monthQuerySchema = z.object({ month: monthKeySchema.optional() });
export type MonthQuery = z.infer<typeof monthQuerySchema>;

export const applySuggestionsSchema = z.object({
  month: monthKeySchema,
  /** Se omitido, aplica a sugestão de todas as categorias com histórico. */
  categoryIds: z.array(z.string().min(1)).optional(),
});
export type ApplySuggestionsInput = z.infer<typeof applySuggestionsSchema>;

// ─── Metas (regra 5.9) ────────────────────────────────────────────────────────

export const createGoalSchema = z.object({
  name: z.string().min(1).max(80),
  targetCents: positiveCents,
  deadline: z.coerce.date().optional().nullable(),
  /** A meta aponta para um saldo que já existe — nunca cria saldo paralelo. */
  linkedAccountId: z.string().min(1),
  monthlyContributionCents: cents.nonnegative().optional().nullable(),
});
export type CreateGoalInput = z.infer<typeof createGoalSchema>;

export const updateGoalSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  targetCents: positiveCents.optional(),
  deadline: z.coerce.date().optional().nullable(),
  linkedAccountId: z.string().min(1).optional(),
  monthlyContributionCents: cents.nonnegative().optional().nullable(),
  archived: z.boolean().optional(),
});
export type UpdateGoalInput = z.infer<typeof updateGoalSchema>;

export const bulkActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('categorize'), ids: z.array(z.string()).min(1), categoryId: z.string().min(1) }),
  z.object({ action: z.literal('setStatus'), ids: z.array(z.string()).min(1), status: transactionStatusSchema }),
  z.object({ action: z.literal('addTag'), ids: z.array(z.string()).min(1), tagId: z.string().min(1) }),
  z.object({ action: z.literal('delete'), ids: z.array(z.string()).min(1) }),
]);
export type BulkActionInput = z.infer<typeof bulkActionSchema>;
