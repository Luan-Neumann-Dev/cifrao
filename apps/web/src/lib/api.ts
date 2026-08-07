import type {
  AccountType,
  CategoryKind,
  ImportFormat,
  ImportRowStatus,
  ImportStatus,
  InvestmentClass,
  InvoiceStatus,
  NotificationKind,
  PaymentMethod,
  RecurrenceFrequency,
  StatementDateFormat,
  TransactionStatus,
  TransactionType,
} from '@cifrao/shared';
import { type ApiErrorBody, messageFromApiError } from './api-error';

/**
 * Cliente da API (via proxy /api/* -> Nest). O JWT httpOnly vai junto no cookie.
 * Valores monetários chegam como string (BigInt serializado) — a UI converte
 * com Number(...) só na apresentação.
 */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let body: ApiErrorBody | null = null;
    try {
      body = (await res.json()) as ApiErrorBody;
    } catch {
      // corpo não-JSON
    }
    throw new Error(messageFromApiError(res.status, body));
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ─── Tipos de resposta (amountCents/balanceCents chegam como string) ───────────

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  balanceCents: string;
  color: string | null;
  institution: string | null;
  archived: boolean;
}

/** Saldo no fim de cada mês — `GET /accounts/:id/balance-evolution`. */
export interface BalancePoint {
  /** "yyyy-MM" no fuso de São Paulo. */
  month: string;
  balanceCents: string;
}

export interface Category {
  id: string;
  name: string;
  parentId: string | null;
  kind: CategoryKind;
  icon: string | null;
  color: string | null;
}

export interface Tag {
  id: string;
  name: string;
  color: string | null;
}

export interface TransactionRef {
  id: string;
  name: string;
  color: string | null;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  amountCents: string;
  date: string;
  description: string;
  status: TransactionStatus;
  notes: string | null;
  isReimbursable: boolean;
  reimbursedAt: string | null;
  /** Regra 5.13: preenchido quando este lançamento é o estorno de um gasto. */
  reimbursesTransactionId?: string | null;
  paymentMethod?: PaymentMethod | null;
  account: TransactionRef | null;
  fromAccount: TransactionRef | null;
  toAccount: TransactionRef | null;
  creditCard?: { id: string; nickname: string; color: string | null } | null;
  category: (TransactionRef & { icon: string | null }) | null;
  tags: { tag: Tag }[];
  creditCardId?: string | null;
  invoiceId?: string | null;
  /** Compra pai do parcelamento (regra 5.4); abre o cronograma da parcela. */
  purchaseId?: string | null;
  installmentNumber?: number | null;
  installmentTotal?: number | null;
}

/** `GET /settings/onboarding` — primeiros passos e retrospectiva pendente. */
export interface OnboardingStatus {
  onboardingDoneAt: string | null;
  needsOnboarding: boolean;
  counts: { accounts: number; cards: number; transactions: number };
  /** "yyyy-MM" da retrospectiva a oferecer agora, ou null. */
  reviewMonth: string | null;
}

/** `GET /reports/revisao` — a retrospectiva do mês. */
export interface MonthReview {
  month: string;
  incomeCents: string;
  expenseCents: string;
  leftoverCents: string;
  spentPercent: number | null;
  comparison: { months: number; avgIncomeCents: string; avgExpenseCents: string };
  topCategories: {
    category: { id: string; name: string; color: string | null; icon: string | null };
    totalCents: string;
  }[];
  budgets: {
    category: { id: string; name: string; color: string | null; icon: string | null };
    limitCents: string;
    spentCents: string;
    exceeded: boolean;
  }[];
  empty: boolean;
}

/** `GET /categories/sugestao` — categoria provável para a descrição digitada. */
export interface CategorySuggestion {
  categoryId: string;
  source: 'rule' | 'history';
  ruleId?: string;
  confidence: number;
}

export interface SplitsResponse {
  transactionId: string;
  splits: {
    id: string;
    amountCents: string;
    category: { id: string; name: string; color: string | null; icon: string | null };
  }[];
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ─── Cartões e faturas (valores em centavos chegam como string) ────────────────

export interface AvailabilityBreakdown {
  limitCents: string;
  openInvoiceCents: string;
  closedUnpaidCents: string;
  futureCommittedCents: string;
  committedCents: string;
  availableCents: string;
}

export interface CreditCard {
  id: string;
  nickname: string;
  brand: string | null;
  last4: string | null;
  limitCents: string;
  closingDay: number;
  dueDay: number;
  color: string | null;
  archived: boolean;
  defaultPaymentAccountId: string | null;
}

export interface CreditCardWithAvailability extends CreditCard {
  availability: AvailabilityBreakdown;
}

export interface InvoiceSummary {
  id: string;
  creditCardId: string;
  referenceMonth: string;
  closingDate: string;
  dueDate: string;
  status: InvoiceStatus;
  paidCents: string;
  totalCents: string;
  remainingCents: string;
}

export interface CreditCardDetail extends CreditCardWithAvailability {
  invoices: InvoiceSummary[];
}

export interface InvoiceDetail extends InvoiceSummary {
  creditCard: { id: string; nickname: string; color: string | null; limitCents: string };
  transactions: Transaction[];
}

export interface CommitmentPoint {
  month: string;
  totalCents: string;
  remainingCents: string;
}

/** Uma parcela do cronograma de `GET /purchases/:id` (regra 5.4). */
export interface PurchaseInstallment {
  transactionId: string;
  installmentNumber: number | null;
  amountCents: string;
  date: string;
  status: TransactionStatus;
  invoiceId: string | null;
  /** "yyyy-MM" da fatura que recebeu esta parcela. */
  referenceMonth: string | null;
  dueDate: string | null;
  invoicePaid: boolean;
}

export interface PurchaseDetail {
  id: string;
  description: string;
  totalCents: string;
  installmentTotal: number;
  purchaseDate: string;
  category: (TransactionRef & { icon: string | null }) | null;
  installments: PurchaseInstallment[];
}

// ─── Dashboard (Fase 4) ────────────────────────────────────────────────────────

export interface DashboardAccount {
  id: string;
  name: string;
  type: AccountType;
  color: string | null;
  balanceCents: string;
}

export interface DashboardInvoice {
  id: string;
  creditCardId: string;
  cardNickname: string;
  cardColor: string | null;
  referenceMonth: string;
  closingDate: string;
  dueDate: string;
  totalCents: string;
  paidCents: string;
  remainingCents: string;
  status: InvoiceStatus;
}

export interface DashboardCategorySpend {
  categoryId: string | null;
  name: string;
  color: string | null;
  icon: string | null;
  cents: string;
}

export interface DashboardTimelineEvent {
  date: string;
  kind: 'invoice-due' | 'forecast-income' | 'forecast-expense';
  label: string;
  amountCents: string;
  positive: boolean;
}

export interface DashboardInsight {
  categoryId: string;
  name: string;
  color: string | null;
  currentCents: string;
  avgCents: string;
  deltaCents: string;
}

export interface BudgetStatusFields {
  limitCents: string;
  spentCents: string;
  remainingCents: string;
  percentUsed: number;
  dailyAllowanceCents: string;
  daysRemaining: number;
  over: boolean;
}

export interface DashboardBudgetItem extends BudgetStatusFields {
  id: string;
  categoryId: string;
  category: { id: string; name: string; color: string | null; icon: string | null };
}

export interface DashboardBudgetSummary {
  daysRemaining: number;
  count: number;
  items: DashboardBudgetItem[];
  totals: BudgetStatusFields;
}

export interface Dashboard {
  month: string;
  balances: {
    availableTodayCents: string;
    netWorthCents: string;
    /** Carteira a preço de mercado (Fase 8), já dentro do patrimônio. */
    portfolioValueCents: string;
    availableEndOfMonthCents: string;
    accounts: DashboardAccount[];
  };
  availableBreakdown: {
    liquidTodayCents: string;
    forecastIncomeCents: string;
    forecastExpenseCents: string;
    cardCommittedCents: string;
    resultCents: string;
  };
  monthTotals: { incomeCents: string; expenseCents: string; netCents: string };
  /** Últimos 6 meses, o de referência por último — a faísca dos cartões. */
  monthlyTrend: {
    month: string;
    incomeCents: string;
    expenseCents: string;
    netCents: string;
  }[];
  /** Lançamentos ainda em PENDING, esperando confirmação. */
  pendingCount: number;
  openInvoices: DashboardInvoice[];
  categorySpending: DashboardCategorySpend[];
  budgetSummary: DashboardBudgetSummary;
  insight: DashboardInsight | null;
  timeline: DashboardTimelineEvent[];
  recent: Transaction[];
}

// ─── Recorrências, orçamento, metas, calendário (Fase 5) ──────────────────────

export interface RecurringRule {
  id: string;
  description: string;
  type: TransactionType;
  amountCents: string;
  frequency: RecurrenceFrequency;
  dayOfMonth: number | null;
  startDate: string;
  endDate: string | null;
  active: boolean;
  notes: string | null;
  accountId: string | null;
  fromAccountId: string | null;
  toAccountId: string | null;
  categoryId: string | null;
  lastGeneratedAt: string | null;
  account: TransactionRef | null;
  fromAccount: TransactionRef | null;
  toAccount: TransactionRef | null;
  category: (TransactionRef & { icon: string | null }) | null;
  /** Prévia das próximas datas ("yyyy-MM-dd"), calculada no servidor. */
  nextDates: string[];
}

export interface BudgetItem extends BudgetStatusFields {
  id: string;
  categoryId: string;
  month: string;
  category: { id: string; name: string; color: string | null; icon: string | null };
}

export interface BudgetList {
  month: string;
  daysRemaining: number;
  items: BudgetItem[];
  totals: BudgetStatusFields;
}

export interface BudgetSuggestion {
  categoryId: string;
  category: { id: string; name: string; color: string | null; icon: string | null } | null;
  historyTotalCents: string;
  suggestedCents: string;
  currentLimitCents: string | null;
}

export interface BudgetSuggestions {
  month: string;
  months: number;
  items: BudgetSuggestion[];
}

export interface Goal {
  id: string;
  name: string;
  deadline: string | null;
  archived: boolean;
  monthlyContributionCents: string | null;
  linkedAccount: {
    id: string;
    name: string;
    type: AccountType;
    color: string | null;
    balanceCents: string;
  };
  targetCents: string;
  currentCents: string;
  remainingCents: string;
  percent: number;
  reached: boolean;
  paceCents: string;
  paceSource: 'history' | 'contribution' | 'none';
  etaMonths: number | null;
  etaMonth: string | null;
  monthsToDeadline: number | null;
  onTrack: boolean | null;
}

export interface CalendarEvent {
  kind: 'forecast' | 'pending' | 'invoice-due';
  id: string;
  label: string;
  deltaCents: string;
  amountCents: string;
  type?: TransactionType;
  categoryName?: string | null;
}

export interface CalendarDay {
  date: string;
  isToday: boolean;
  isPast: boolean;
  projectedBalanceCents: string;
  realizedDeltaCents: string;
  projectedDeltaCents: string;
  events: CalendarEvent[];
}

export interface CalendarMonth {
  month: string;
  todayKey: string;
  balanceTodayCents: string;
  endOfMonthBalanceCents: string;
  lowestPoint: { date: string; projectedBalanceCents: string } | null;
  days: CalendarDay[];
}

export interface Refund {
  id: string;
  amountCents: string;
  date: string;
  account: TransactionRef | null;
}

/** Gasto reembolsável com o quanto já voltou (regra 5.13, suporta parcial). */
export interface Receivable extends Transaction {
  reimbursements: Refund[];
  reimbursedCents: string;
  remainingCents: string;
  partial: boolean;
}

// ─── Importação e regras (Fase 6) ─────────────────────────────────────────────

export interface ImportSummary {
  id: string;
  filename: string;
  format: ImportFormat;
  status: ImportStatus;
  progress: number;
  totalRows: number;
  duplicateRows: number;
  importedRows: number;
  error: string | null;
  createdAt: string;
  confirmedAt: string | null;
  account: TransactionRef | null;
}

export interface ImportRowRef {
  id: string;
  date: string;
  description: string;
  amountCents: string;
}

export interface ImportRow {
  id: string;
  lineNumber: number;
  date: string;
  amountCents: string;
  description: string;
  originalDescription: string;
  type: TransactionType;
  externalId: string | null;
  status: ImportRowStatus;
  categoryId: string | null;
  suggestedCategoryId: string | null;
  matchedRuleId: string | null;
  duplicateOfId: string | null;
  duplicateScore: number | null;
  category: (TransactionRef & { icon: string | null }) | null;
  duplicateOf: ImportRowRef | null;
  matchedForecast: ImportRowRef | null;
}

export interface CsvPreview {
  headers: string[];
  preview: Record<string, string>[];
  rowCount: number;
  suggestion: Partial<CsvMappingInput>;
}

export interface CsvMappingInput {
  date: string;
  description: string;
  amount?: string;
  debit?: string;
  credit?: string;
  dateFormat: StatementDateFormat;
  invertSign: boolean;
}

export interface ImportDetail extends ImportSummary {
  detectedAccountLabel: string | null;
  columnMapping: CsvMappingInput | null;
  preview: CsvPreview | null;
  rows: ImportRow[];
  pagination: { page: number; pageSize: number; total: number };
  counts: { pending: number; duplicate: number; ignored: number; imported: number };
}

export interface CategoryRule {
  id: string;
  pattern: string;
  minCents: string | null;
  maxCents: string | null;
  categoryId: string;
  appliedCount: number;
  active: boolean;
  category: { id: string; name: string; color: string | null; icon: string | null };
}

// ─── Investimentos (Fase 8) ───────────────────────────────────────────────────

export interface InvestmentPosition {
  id: string;
  ticker: string;
  name: string | null;
  class: InvestmentClass;
  /** Inteiro na escala 1e-8 — use `formatQuantity` do shared para exibir. */
  quantity: string;
  avgPriceCents: string;
  currentPriceCents: string;
  priceUpdatedAt: string | null;
  investedCents: string;
  marketValueCents: string;
  gainCents: string;
  gainPercent: number | null;
  realizedGainCents: string;
}

export interface InvestmentTrade {
  id: string;
  type: 'BUY' | 'SELL';
  quantity: string;
  priceCents: string;
  feesCents: string;
  totalCents: string;
  date: string;
  avgPriceAfterCents: string;
  realizedGainCents: string;
  notes: string | null;
  account: TransactionRef | null;
}

export interface InvestmentDetail extends InvestmentPosition {
  notes: string | null;
  archived: boolean;
  transactions: InvestmentTrade[];
  prices: { id: string; date: string; priceCents: string }[];
}

export interface AllocationSlice {
  class: InvestmentClass;
  marketValueCents: string;
  percent: number;
  targetPercent: number | null;
  deviationPoints: number | null;
  adjustmentCents: string | null;
}

export interface Portfolio {
  totals: {
    marketValueCents: string;
    investedCents: string;
    gainCents: string;
    gainPercent: number | null;
    realizedGainCents: string;
    positionCount: number;
  };
  positions: InvestmentPosition[];
  allocation: AllocationSlice[];
  evolution: { month: string; marketValueCents: string }[];
}

// ─── Relatórios (Fase 7) ──────────────────────────────────────────────────────

export interface Variation {
  currentCents: string;
  previousCents: string;
  deltaCents: string;
  percentChange: number | null;
}

export interface ReportSeriesPoint {
  bucket: string;
  incomeCents: string;
  expenseCents: string;
  netCents: string;
  cumulativeCents: string;
}

export interface ReportCategoryRow {
  categoryId: string | null;
  name: string;
  color: string | null;
  icon: string | null;
  totalCents: string;
  count: number;
  percent: number;
  averageCents: string;
  previousCents: string;
  deltaCents: string;
  percentChange: number | null;
}

export interface ReportMerchant {
  key: string;
  label: string;
  count: number;
  totalCents: string;
}

export interface ReportNetWorthPoint {
  month: string;
  accountsCents: string;
  investmentsCents: string;
  cardDebtCents: string;
  netWorthCents: string;
}

export interface Report {
  period: {
    from: string;
    to: string;
    previousFrom: string;
    previousTo: string;
    granularity: 'day' | 'month';
  };
  totals: {
    incomeCents: string;
    expenseCents: string;
    netCents: string;
    refundedCents: string;
    transactionCount: number;
    income: Variation;
    expense: Variation;
    net: Variation;
    savingsRate: number;
  };
  series: ReportSeriesPoint[];
  categories: ReportCategoryRow[];
  biggestVariations: ReportCategoryRow[];
  topTransactions: {
    id: string;
    date: string;
    description: string;
    amountCents: string;
    type: TransactionType;
    category: (TransactionRef & { icon: string | null }) | null;
    account: { id: string; name: string } | null;
    creditCard: { id: string; nickname: string } | null;
  }[];
  topMerchants: ReportMerchant[];
  netWorth: ReportNetWorthPoint[];
}

// ─── Configurações, avisos e backup (Fase 9) ──────────────────────────────────

export interface Profile {
  id: string;
  name: string | null;
  email: string;
  emailVerified: boolean;
  twoFactorEnabled: boolean | null;
  createdAt: string;
  theme: string | null;
  accentColor: string | null;
  notifyInvoiceDue: boolean;
  notifyBudgetExceeded: boolean;
  notifyGoalReached: boolean;
  notifyForecastDue: boolean;
  notifyDaysBefore: number;
}

export interface ActiveSession {
  id: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  device: string;
  /** A sessão deste navegador — a única que os botões não podem derrubar. */
  current: boolean;
}

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  severity: 'danger' | 'warn' | 'info';
  title: string;
  detail: string;
  href: string;
  dateKey?: string;
  amountCents?: string;
}

export interface NotificationList {
  notifications: AppNotification[];
  unread: number;
}

/** Categoria com o que aponta para ela — é o que diz se dá para apagar. */
export interface CategoryUsage extends Category {
  transactionCount: number;
  budgetCount: number;
  ruleCount: number;
  recurringCount: number;
  childCount: number;
  /** Sem lançamento e sem filha: dá para apagar direto, sem mesclar. */
  deletable: boolean;
}

export interface MergeResult {
  merged: { from: string; into: string };
  moved: {
    transactions: number;
    splits: number;
    purchases: number;
    recurringRules: number;
    importRows: number;
    children: number;
    budgets: number;
    categoryRules: number;
  };
  budgetsSomados: { month: string; limitCents: string }[];
  regrasUnificadas: number;
}

export interface BackupSummary {
  sections: { model: string; label: string; count: number }[];
  totalRecords: number;
}

export interface RestoreJob {
  id: string;
  status: 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED';
  mode: 'replace' | 'merge';
  progress: number;
  totalRecords: number;
  restored: Record<string, number> | null;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface RestoreEnqueued {
  job: Pick<RestoreJob, 'id' | 'status' | 'mode' | 'totalRecords' | 'createdAt'>;
  check: { counts: Record<string, number>; unknownModels: string[] };
}

export interface Receivables {
  pending: Receivable[];
  /** O que ainda falta entrar (já desconta os parciais recebidos). */
  pendingTotalCents: string;
  pendingCount: number;
  pendingGrossCents: string;
  received: Receivable[];
  receivedTotalCents: string;
}
