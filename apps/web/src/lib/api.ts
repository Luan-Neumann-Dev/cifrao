import type {
  AccountType,
  CategoryKind,
  InvoiceStatus,
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
