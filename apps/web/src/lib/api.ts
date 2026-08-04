import type {
  AccountType,
  CategoryKind,
  ImportFormat,
  ImportRowStatus,
  ImportStatus,
  InvoiceStatus,
  RecurrenceFrequency,
  StatementDateFormat,
  TransactionStatus,
  TransactionType,
} from '@cifrao/shared';

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
    let message = `Erro ${res.status}`;
    try {
      const body = (await res.json()) as { message?: string };
      if (body?.message) message = body.message;
    } catch {
      // corpo não-JSON
    }
    throw new Error(message);
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
  account: TransactionRef | null;
  fromAccount: TransactionRef | null;
  toAccount: TransactionRef | null;
  category: (TransactionRef & { icon: string | null }) | null;
  tags: { tag: Tag }[];
  creditCardId?: string | null;
  invoiceId?: string | null;
  installmentNumber?: number | null;
  installmentTotal?: number | null;
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

export interface Receivables {
  pending: Receivable[];
  /** O que ainda falta entrar (já desconta os parciais recebidos). */
  pendingTotalCents: string;
  pendingCount: number;
  pendingGrossCents: string;
  received: Receivable[];
  receivedTotalCents: string;
}
