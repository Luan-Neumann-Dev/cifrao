import type {
  AccountType,
  CategoryKind,
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
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
