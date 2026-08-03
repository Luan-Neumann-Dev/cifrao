import type {
  AccountType,
  CategoryKind,
  InvoiceStatus,
  RecurrenceFrequency,
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

export interface Receivables {
  pending: Transaction[];
  pendingTotalCents: string;
  pendingCount: number;
  received: Transaction[];
  receivedTotalCents: string;
}
