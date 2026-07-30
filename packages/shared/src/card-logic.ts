import type { InvoiceStatus } from './enums';

/**
 * Lógica pura de cartões e faturas — independente do Prisma. Aqui ficam
 * garantidas por teste as regras:
 *  5.3 — roteamento de compra para a fatura certa pelo dia de fechamento
 *        (corte inclusivo: compra NO dia do fechamento entra na fatura que fecha
 *        naquele dia; referenceMonth é o mês do VENCIMENTO — "fatura de agosto
 *        fecha 28/07").
 *  5.4 — parcelamento: divisão do total em N parcelas somando exatamente o total.
 *  5.5 — "disponível de verdade": limite − faturas não quitadas − parcelas futuras.
 *
 * As funções operam sobre componentes de calendário (ano/mês/dia no fuso de São
 * Paulo). A conversão para instantes UTC fica na camada de serviço.
 */

export interface DateParts {
  year: number;
  /** 1–12. */
  month: number;
  /** 1–31 (dia do mês). */
  day: number;
}

export interface InvoiceWindow {
  /** "yyyy-MM" do vencimento (chave da fatura). */
  referenceMonth: string;
  closing: DateParts;
  due: DateParts;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Quantidade de dias do mês (mês 1–12). */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Fixa o dia no último dia do mês quando ultrapassa (ex.: 31 em fevereiro). */
export function clampDay(year: number, month: number, day: number): number {
  return Math.min(day, daysInMonth(year, month));
}

/** Soma `n` meses a (year, month) com mês 1–12, ajustando o ano. */
export function addMonths(year: number, month: number, n: number): { year: number; month: number } {
  const total = year * 12 + (month - 1) + n;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

/**
 * Constrói a janela completa de uma fatura a partir do mês de FECHAMENTO.
 * O vencimento cai no mesmo mês do fechamento quando `dueDay > closingDay`;
 * caso contrário, no mês seguinte. referenceMonth = mês do vencimento.
 */
export function buildInvoiceWindow(
  closingYear: number,
  closingMonth: number,
  closingDay: number,
  dueDay: number,
): InvoiceWindow {
  const cDay = clampDay(closingYear, closingMonth, closingDay);
  const { year: dueY, month: dueM } =
    dueDay <= closingDay ? addMonths(closingYear, closingMonth, 1) : { year: closingYear, month: closingMonth };
  const dDay = clampDay(dueY, dueM, dueDay);
  return {
    referenceMonth: `${dueY}-${pad2(dueM)}`,
    closing: { year: closingYear, month: closingMonth, day: cDay },
    due: { year: dueY, month: dueM, day: dDay },
  };
}

/**
 * Em que mês fecha a fatura de uma compra. Corte INCLUSIVO: se o dia da compra
 * é ≤ dia de fechamento (fixado ao mês), fecha neste mês; senão, no próximo.
 */
export function resolveClosingMonth(
  purchase: DateParts,
  closingDay: number,
): { year: number; month: number } {
  const cDay = clampDay(purchase.year, purchase.month, closingDay);
  if (purchase.day <= cDay) return { year: purchase.year, month: purchase.month };
  return addMonths(purchase.year, purchase.month, 1);
}

/** Janela da fatura em que uma compra (não parcelada, ou a 1ª parcela) cai. */
export function invoiceWindowForPurchase(
  purchase: DateParts,
  closingDay: number,
  dueDay: number,
): InvoiceWindow {
  const { year, month } = resolveClosingMonth(purchase, closingDay);
  return buildInvoiceWindow(year, month, closingDay, dueDay);
}

/**
 * Janelas das N faturas de uma compra parcelada (regra 5.4): a 1ª parcela cai
 * na fatura da compra e cada parcela seguinte na fatura do mês subsequente —
 * sempre N faturas distintas e consecutivas.
 */
export function installmentWindows(
  purchase: DateParts,
  closingDay: number,
  dueDay: number,
  installments: number,
): InvoiceWindow[] {
  const base = resolveClosingMonth(purchase, closingDay);
  const windows: InvoiceWindow[] = [];
  for (let i = 0; i < installments; i++) {
    const { year, month } = addMonths(base.year, base.month, i);
    windows.push(buildInvoiceWindow(year, month, closingDay, dueDay));
  }
  return windows;
}

/**
 * Data (ano/mês/dia em SP) da i-ésima parcela: o mesmo dia da compra, i meses
 * adiante, fixado ao último dia quando o mês é mais curto. Cada parcela fica no
 * seu próprio mês de competência.
 */
export function installmentDateParts(purchase: DateParts, i: number): DateParts {
  const { year, month } = addMonths(purchase.year, purchase.month, i);
  return { year, month, day: clampDay(year, month, purchase.day) };
}

/**
 * Regra 5.4: divide o total em `count` parcelas inteiras (centavos) que somam
 * exatamente o total. O resto de centavos é distribuído nas primeiras parcelas.
 */
export function splitInstallments(totalCents: bigint, count: number): bigint[] {
  if (count < 1) throw new Error('count deve ser >= 1');
  const base = totalCents / BigInt(count);
  const remainder = totalCents - base * BigInt(count); // 0 <= remainder < count
  const parts: bigint[] = [];
  for (let i = 0; i < count; i++) {
    parts.push(base + (BigInt(i) < remainder ? 1n : 0n));
  }
  return parts;
}

/**
 * Status derivado de uma fatura (regra 5.3). PAID quando o pago cobre o total;
 * PARTIAL quando há pagamento parcial; CLOSED quando passou o fechamento sem
 * pagamento; OPEN enquanto ainda acumula.
 */
export function deriveInvoiceStatus(input: {
  totalCents: bigint;
  paidCents: bigint;
  closingDate: Date;
  now?: Date;
}): InvoiceStatus {
  const now = input.now ?? new Date();
  if (input.totalCents > 0n && input.paidCents >= input.totalCents) return 'PAID';
  if (input.paidCents > 0n) return 'PARTIAL';
  if (now.getTime() >= input.closingDate.getTime()) return 'CLOSED';
  return 'OPEN';
}

export interface InvoiceForAvailability {
  closingDate: Date;
  totalCents: bigint;
  paidCents: bigint;
}

export interface AvailabilityBreakdown {
  limitCents: bigint;
  /** Fatura atualmente aberta (em aberto). */
  openInvoiceCents: bigint;
  /** Faturas já fechadas/parciais ainda não quitadas. */
  closedUnpaidCents: bigint;
  /** Parcelas futuras já comprometidas (faturas que ainda vão fechar). */
  futureCommittedCents: bigint;
  /** Soma comprometida = aberta + fechadas não quitadas + futuras. */
  committedCents: bigint;
  /** Regra 5.5: limite − comprometido. Pode ser negativo (estouro). */
  availableCents: bigint;
}

/**
 * Regra 5.5 — "disponível de verdade". A fatura aberta é a de menor data de
 * fechamento entre as que ainda não fecharam; as demais que ainda vão fechar são
 * parcelas futuras; as já fechadas não quitadas também consomem limite.
 */
export function classifyInvoicesForAvailability(
  invoices: InvoiceForAvailability[],
  limitCents: bigint,
  now: Date = new Date(),
): AvailabilityBreakdown {
  const nowMs = now.getTime();

  let open: InvoiceForAvailability | null = null;
  for (const inv of invoices) {
    if (inv.closingDate.getTime() < nowMs) continue; // já fechou
    if (!open || inv.closingDate.getTime() < open.closingDate.getTime()) open = inv;
  }

  let openInvoiceCents = 0n;
  let closedUnpaidCents = 0n;
  let futureCommittedCents = 0n;
  for (const inv of invoices) {
    const rem = inv.totalCents - inv.paidCents;
    const remaining = rem > 0n ? rem : 0n;
    if (inv.closingDate.getTime() < nowMs) closedUnpaidCents += remaining;
    else if (inv === open) openInvoiceCents += remaining;
    else futureCommittedCents += remaining;
  }

  const committedCents = openInvoiceCents + closedUnpaidCents + futureCommittedCents;
  return {
    limitCents,
    openInvoiceCents,
    closedUnpaidCents,
    futureCommittedCents,
    committedCents,
    availableCents: limitCents - committedCents,
  };
}
