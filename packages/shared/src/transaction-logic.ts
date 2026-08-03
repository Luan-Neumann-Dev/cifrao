import type { TransactionStatus, TransactionType } from './enums';

/**
 * Lógica pura de lançamentos — independente do Prisma. É aqui que ficam
 * garantidas por teste as regras 5.7 (transferência não é receita/despesa) e
 * 5.8 (ajuste = saldo real − saldo atual).
 */
export interface TxLike {
  type: TransactionType;
  amountCents: bigint | number;
  accountId?: string | null;
  fromAccountId?: string | null;
  toAccountId?: string | null;
  categoryId?: string | null;
  status?: TransactionStatus;
  /** Preenchido quando este lançamento é o estorno de um gasto (regra 5.13). */
  reimbursesTransactionId?: string | null;
}

/**
 * Regra 5.13: o estorno de um reembolsável é dinheiro voltando, não receita
 * nova. Ele credita a conta (ver `accountDeltaCents`), mas nos relatórios abate
 * o gasto da categoria em vez de somar como entrada.
 */
export function isReimbursementRefund(tx: TxLike): boolean {
  return Boolean(tx.reimbursesTransactionId);
}

function toBig(v: bigint | number): bigint {
  return typeof v === 'bigint' ? v : BigInt(Math.round(v));
}

/** Só EXPENSE e INCOME contam como fluxo de caixa em relatórios/orçamentos. */
export function isCashflow(tx: TxLike): boolean {
  return tx.type === 'EXPENSE' || tx.type === 'INCOME';
}
export function isExpense(tx: TxLike): boolean {
  return tx.type === 'EXPENSE';
}
export function isIncome(tx: TxLike): boolean {
  return tx.type === 'INCOME';
}
export function isTransfer(tx: TxLike): boolean {
  return tx.type === 'TRANSFER';
}

/** Previsões (FORECAST) não são realizadas: não entram nas somas de caixa. */
function isRealized(tx: TxLike): boolean {
  return tx.status !== 'FORECAST';
}

/**
 * Efeito de um lançamento no saldo de UMA conta (saldo mantido).
 * EXPENSE: −valor; INCOME: +valor; ADJUSTMENT: +delta (com sinal);
 * TRANSFER: −valor na conta de origem, +valor na de destino.
 */
export function accountDeltaCents(tx: TxLike, accountId: string): bigint {
  const amt = toBig(tx.amountCents);
  switch (tx.type) {
    case 'EXPENSE':
      return tx.accountId === accountId ? -amt : 0n;
    case 'INCOME':
      return tx.accountId === accountId ? amt : 0n;
    case 'ADJUSTMENT':
      return tx.accountId === accountId ? amt : 0n;
    case 'TRANSFER':
      if (tx.fromAccountId === accountId) return -amt;
      if (tx.toAccountId === accountId) return amt;
      return 0n;
    default:
      return 0n;
  }
}

/**
 * Soma das DESPESAS (magnitude), já **líquida de reembolsos** (5.13). Ignora
 * INCOME, TRANSFER, ADJUSTMENT e FORECAST.
 */
export function sumExpenseCents(txs: TxLike[]): bigint {
  let total = 0n;
  for (const tx of txs) {
    if (!isRealized(tx)) continue;
    if (isExpense(tx)) total += toBig(tx.amountCents);
    else if (isIncome(tx) && isReimbursementRefund(tx)) total -= toBig(tx.amountCents);
  }
  return total;
}

/**
 * Soma das RECEITAS (magnitude). Ignora EXPENSE, TRANSFER, ADJUSTMENT, FORECAST
 * e **estornos de reembolso** — devolução não é ganho (5.13).
 */
export function sumIncomeCents(txs: TxLike[]): bigint {
  let total = 0n;
  for (const tx of txs) {
    if (isIncome(tx) && isRealized(tx) && !isReimbursementRefund(tx)) {
      total += toBig(tx.amountCents);
    }
  }
  return total;
}

/** Fluxo líquido = receitas − despesas. Transferências não afetam. */
export function netCashflowCents(txs: TxLike[]): bigint {
  return sumIncomeCents(txs) - sumExpenseCents(txs);
}

/** Regra 5.8: o ajuste a lançar é o saldo real informado menos o saldo atual. */
export function computeAdjustmentDeltaCents(
  realBalanceCents: bigint | number,
  currentBalanceCents: bigint | number,
): bigint {
  return toBig(realBalanceCents) - toBig(currentBalanceCents);
}

export interface CategoryTotals {
  expenseCents: bigint;
  incomeCents: bigint;
}

/**
 * Agrupa por categoria SOMENTE o fluxo de caixa (despesa/receita). Transferências
 * e ajustes ficam de fora — não poluem gastos por categoria (base de 5.10).
 */
export function sumByCategory(txs: TxLike[]): Map<string | null, CategoryTotals> {
  const map = new Map<string | null, CategoryTotals>();
  for (const tx of txs) {
    if (!isCashflow(tx) || !isRealized(tx)) continue;
    const key = tx.categoryId ?? null;
    const entry = map.get(key) ?? { expenseCents: 0n, incomeCents: 0n };
    if (isExpense(tx)) entry.expenseCents += toBig(tx.amountCents);
    // Estorno abate o gasto da categoria em vez de virar receita (5.13).
    else if (isReimbursementRefund(tx)) entry.expenseCents -= toBig(tx.amountCents);
    else entry.incomeCents += toBig(tx.amountCents);
    map.set(key, entry);
  }
  return map;
}
