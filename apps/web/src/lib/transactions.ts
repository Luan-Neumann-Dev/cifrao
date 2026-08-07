import {
  type PaymentMethod,
  type TransactionType,
  netCashflowCents,
  sumExpenseCents,
  sumIncomeCents,
} from '@cifrao/shared';
import type { Transaction } from '@/lib/api';
import { dayGroupLabel, dayKeyInSaoPaulo } from '@/lib/dates';

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  PIX: 'Pix',
  DEBIT: 'Débito',
  CREDIT: 'Crédito',
  CASH: 'Dinheiro',
  BOLETO: 'Boleto',
};

export const TYPE_LABEL: Record<TransactionType, string> = {
  EXPENSE: 'Despesa',
  INCOME: 'Receita',
  TRANSFER: 'Transferência',
  ADJUSTMENT: 'Ajuste',
};

export interface DayGroup {
  key: string;
  label: string;
  /** Soma com sinal do grupo: entrada positiva, saída negativa. */
  totalCents: number;
  rows: Transaction[];
  forecast: boolean;
}

/** Efeito do lançamento no bolso, com sinal — para o total do dia. */
export function signedCents(tx: Transaction): number {
  const amount = Number(tx.amountCents);
  switch (tx.type) {
    case 'INCOME':
      return amount;
    case 'EXPENSE':
      return -amount;
    case 'ADJUSTMENT':
      // Ajuste já vem com sinal (regra 5.8).
      return amount;
    default:
      // Transferência não muda o total: sai de um bolso e entra no outro (5.7).
      return 0;
  }
}

/**
 * Agrupa por dia no fuso de São Paulo. Os previstos saem num grupo próprio no
 * fim: primeiro o que já aconteceu, depois o que vem por aí — misturar os dois
 * na mesma régua de datas faz o mês parecer maior do que é.
 */
export function groupByDay(transactions: Transaction[], today = new Date()): DayGroup[] {
  const todayKey = dayKeyInSaoPaulo(today.toISOString());
  const yesterdayKey = dayKeyInSaoPaulo(
    new Date(today.getTime() - 24 * 60 * 60 * 1000).toISOString(),
  );

  const realizados = new Map<string, Transaction[]>();
  const previstos: Transaction[] = [];

  for (const tx of transactions) {
    if (tx.status === 'FORECAST') {
      previstos.push(tx);
      continue;
    }
    const key = dayKeyInSaoPaulo(tx.date);
    const list = realizados.get(key);
    if (list) list.push(tx);
    else realizados.set(key, [tx]);
  }

  const groups: DayGroup[] = [...realizados.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, rows]) => ({
      key,
      label: prefixed(key, todayKey, yesterdayKey),
      rows,
      totalCents: rows.reduce((sum, tx) => sum + signedCents(tx), 0),
      forecast: false,
    }));

  if (previstos.length > 0) {
    groups.push({
      key: 'forecast',
      label: 'Próximos · previstos',
      rows: previstos.sort((a, b) => a.date.localeCompare(b.date)),
      totalCents: previstos.reduce((sum, tx) => sum + signedCents(tx), 0),
      forecast: true,
    });
  }

  return groups;
}

function prefixed(key: string, todayKey: string, yesterdayKey: string): string {
  const label = dayGroupLabel(key);
  if (key === todayKey) return `Hoje · ${label}`;
  if (key === yesterdayKey) return `Ontem · ${label}`;
  return label;
}

export interface FilteredTotals {
  netCents: number;
  incomeCents: number;
  expenseCents: number;
}

/**
 * Totais do rodapé. Usa as mesmas funções do `shared` que os relatórios usam,
 * então os números batem entre as telas por construção: transferência não entra
 * (5.7), estorno de reembolso abate o gasto em vez de virar receita (5.13) e
 * previsto não conta como realizado.
 */
export function filteredTotals(transactions: Transaction[]): FilteredTotals {
  const txs = transactions.map((t) => ({
    type: t.type,
    amountCents: BigInt(t.amountCents),
    status: t.status,
    reimbursesTransactionId: t.reimbursesTransactionId ?? null,
  }));
  return {
    netCents: Number(netCashflowCents(txs)),
    incomeCents: Number(sumIncomeCents(txs)),
    expenseCents: Number(sumExpenseCents(txs)),
  };
}

/** Como o valor aparece na linha: sinal e cor seguem o design. */
export function amountDisplay(tx: Transaction): { text: string; color: string } {
  const amount = Number(tx.amountCents);
  switch (tx.type) {
    case 'INCOME':
      return { text: '+', color: 'var(--positive)' };
    case 'EXPENSE':
      // No design a despesa é tinta normal, não vermelha: vermelho fica para o
      // que exige ação. Uma lista toda vermelha não destaca nada.
      return { text: '−', color: 'var(--ink)' };
    case 'TRANSFER':
      return { text: '', color: 'var(--ink-2)' };
    default:
      return { text: amount < 0 ? '−' : '+', color: 'var(--warn)' };
  }
}

/** Origem/destino em uma linha, do jeito que a lista mostra. */
export function sourceLabel(tx: Transaction): string {
  if (tx.type === 'TRANSFER') {
    return `${tx.fromAccount?.name ?? '—'} → ${tx.toAccount?.name ?? '—'}`;
  }
  const method = tx.paymentMethod ? PAYMENT_METHOD_LABEL[tx.paymentMethod] : null;
  const place = tx.account?.name ?? tx.creditCard?.nickname ?? '—';
  return method && method !== 'Crédito' ? `${method} · ${place}` : place;
}
