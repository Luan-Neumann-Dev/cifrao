'use client';

import { formatInSaoPaulo } from '@cifrao/shared';
import { Check, ChevronDown, ChevronLeft, ChevronRight, Pencil, Plus } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CategoryBadge } from '@/components/category-icon';
import { CreditCardVisual } from '@/components/credit-card-visual';
import {
  type Account,
  type Category,
  type CommitmentPoint,
  type CreditCardDetail,
  type InvoiceDetail,
  type InvoiceSummary,
  type Transaction,
  api,
} from '@/lib/api';
import { invoiceStateStyle, limitBreakdown } from '@/lib/cards';
import { dayGroupLabel, dayKeyInSaoPaulo, monthLongLabel } from '@/lib/dates';
import { brl } from '@/lib/format';
import { cn } from '@/lib/utils';
import { CommitmentChart } from './commitment-chart';
import { InstallmentSchedule } from './installment-schedule';
import { PayInvoiceDialog } from './pay-dialog';
import { PurchaseDialog } from './purchase-dialog';

const MONTHS_SHORT = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
];
function monthChip(referenceMonth: string): string {
  return MONTHS_SHORT[Number(referenceMonth.slice(5, 7)) - 1] ?? referenceMonth;
}
function ddmm(iso: string): string {
  return formatInSaoPaulo(new Date(iso), 'dd/MM');
}

export default function CartaoDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const [card, setCard] = useState<CreditCardDetail | null>(null);
  const [commitment, setCommitment] = useState<CommitmentPoint[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'invoice' | 'future'>('invoice');
  const [invoiceId, setInvoiceId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [c, cm] = await Promise.all([
        api<CreditCardDetail>(`/credit-cards/${id}`),
        api<CommitmentPoint[]>(`/credit-cards/${id}/commitment`),
      ]);
      setCard(c);
      setCommitment(cm);
      // Sem escolha do usuário, abre na fatura aberta — é a que ele veio ver.
      setInvoiceId((current) => {
        if (current && c.invoices.some((i) => i.id === current)) return current;
        return (c.invoices.find((i) => i.status === 'OPEN') ?? c.invoices[0])?.id ?? null;
      });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void reload();
    Promise.all([api<Account[]>('/accounts'), api<Category[]>('/categories')])
      .then(([a, cat]) => {
        setAccounts(a);
        setCategories(cat);
      })
      .catch(() => undefined);
  }, [reload]);

  // Antiga primeiro: a régua de faturas anda da esquerda (passado) para a direita.
  const invoices = useMemo(
    () => (card ? [...card.invoices].reverse() : []),
    [card],
  );
  const index = invoices.findIndex((i) => i.id === invoiceId);
  const invoice = index >= 0 ? invoices[index] : null;

  if (loading) return <p className="text-sm text-ink-2">Carregando…</p>;
  if (!card) return <p className="text-sm text-ink-2">Cartão não encontrado.</p>;

  const openInvoice = card.invoices.find((i) => i.status === 'OPEN');
  const limit = limitBreakdown(card.availability);

  return (
    <div>
      <Link
        href="/painel/cartoes"
        className="mb-1 inline-flex h-9 items-center gap-[7px] px-1.5 text-[13.5px] font-semibold text-ink-2 transition-colors hover:text-ink"
      >
        <ChevronLeft className="h-[17px] w-[17px]" />
        Cartões
      </Link>

      <div className="grid items-start gap-4 lg:grid-cols-[1.05fr_1fr]">
        <CreditCardVisual
          nickname={card.nickname}
          brand={card.brand}
          last4={card.last4}
          color={card.color}
          action={
            <Link
              href={`/painel/cartoes/${card.id}/editar`}
              title="Editar"
              className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-white/15 text-white transition-colors hover:bg-white/25"
            >
              <Pencil className="h-[15px] w-[15px]" strokeWidth={1.85} />
              <span className="sr-only">Editar cartão</span>
            </Link>
          }
        >
          <div className="mt-[34px]">
            <div className="text-[11.5px] text-white/70">
              {openInvoice
                ? `Fatura de ${monthLongLabel(openInvoice.referenceMonth)} (aberta)`
                : 'Sem fatura aberta'}
            </div>
            <div className="mt-0.5 font-manrope text-[26px] font-bold tabular-nums">
              {brl(openInvoice?.totalCents ?? 0)}
            </div>
          </div>
        </CreditCardVisual>

        {/* Regra 5.5 — os três números separados, com a explicação embaixo. */}
        <div className="rounded-[20px] border border-[var(--card-border)] bg-surface px-6 py-[22px] shadow-[var(--card-shadow)]">
          <div className="flex items-baseline justify-between">
            <span className="text-[13px] text-ink-2">Limite</span>
            <span className="font-manrope text-[13px] tabular-nums text-ink-2">
              {brl(card.limitCents)}
            </span>
          </div>

          <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-[var(--track)]">
            {limit.segments.map((s) => (
              <div key={s.key} style={{ width: `${s.percent}%`, background: s.fill }} />
            ))}
          </div>

          <div className="mt-[18px] flex flex-col gap-[11px]">
            {limit.segments.map((s) => (
              <div key={s.key} className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2 text-[13.5px] text-ink">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                    style={{ background: s.fill }}
                  />
                  {s.label}
                </span>
                <span
                  className="font-manrope text-sm font-semibold tabular-nums"
                  style={{ color: s.key === 'open' ? 'var(--ink)' : s.color }}
                >
                  {brl(s.cents)}
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between gap-3 border-t border-line pt-[11px]">
              <span className="inline-flex items-center gap-2 text-[13.5px] text-ink">
                <span className="h-2.5 w-2.5 shrink-0 rounded-[3px] bg-[var(--track)]" />
                Disponível de verdade
              </span>
              <span
                className="font-manrope text-[15px] font-bold tabular-nums"
                style={{
                  color: limit.availableCents < 0 ? 'var(--negative)' : 'var(--positive)',
                }}
              >
                {brl(limit.availableCents)}
              </span>
            </div>
          </div>

          <p className="mt-3.5 text-xs leading-snug text-ink-2">
            Parcela futura já consumiu limite, mesmo sem ter virado fatura. Por isso “disponível de
            verdade” desconta as duas.
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex w-fit gap-1.5 rounded-[12px] bg-surface-2 p-1">
          <TabButton active={tab === 'invoice'} onClick={() => setTab('invoice')}>
            Fatura
          </TabButton>
          <TabButton active={tab === 'future'} onClick={() => setTab('future')}>
            Parcelas futuras
          </TabButton>
        </div>
        {/* Não está no protótipo, mas é daqui que se lança compra no cartão. */}
        <PurchaseDialog card={card} categories={categories} onSaved={reload}>
          <button
            type="button"
            className="inline-flex h-10 items-center gap-[7px] rounded-full border border-line bg-surface px-[15px] text-[13.5px] font-semibold text-ink transition-colors hover:bg-surface-2"
          >
            <Plus className="h-4 w-4" strokeWidth={2} />
            Nova compra
          </button>
        </PurchaseDialog>
      </div>

      {tab === 'invoice' ? (
        invoices.length === 0 ? (
          <p className="mt-6 text-center text-sm text-ink-2">
            Nenhuma fatura ainda. Lance uma compra para gerar a primeira.
          </p>
        ) : (
          <div className="mt-4">
            <div className="flex items-center gap-2">
              <ArrowButton
                label="Fatura anterior"
                disabled={index <= 0}
                onClick={() => setInvoiceId(invoices[index - 1].id)}
              >
                <ChevronLeft className="h-[17px] w-[17px]" />
              </ArrowButton>
              <div className="flex flex-1 gap-2 overflow-x-auto p-0.5">
                {invoices.map((iv) => (
                  <InvoiceChip
                    key={iv.id}
                    invoice={iv}
                    selected={iv.id === invoiceId}
                    onClick={() => setInvoiceId(iv.id)}
                  />
                ))}
              </div>
              <ArrowButton
                label="Próxima fatura"
                disabled={index < 0 || index >= invoices.length - 1}
                onClick={() => setInvoiceId(invoices[index + 1].id)}
              >
                <ChevronRight className="h-[17px] w-[17px]" />
              </ArrowButton>
            </div>

            {invoice && (
              <InvoicePanel
                key={invoice.id}
                invoice={invoice}
                accounts={accounts}
                defaultAccountId={card.defaultPaymentAccountId}
                onPaid={reload}
              />
            )}
          </div>
        )
      ) : (
        <div className="mt-4 rounded-[20px] border border-[var(--card-border)] bg-surface px-6 py-[22px] shadow-[var(--card-shadow)]">
          <h2 className="font-manrope text-base font-bold text-ink">
            Comprometido nos próximos 12 meses
          </h2>
          <p className="mt-1.5 max-w-[52ch] text-[13px] leading-snug text-ink-2">
            Quanto de cada mês já está tomado por parcelas antes de o mês começar. Barras cheias são
            meses mais pesados.
          </p>
          <CommitmentChart data={commitment} />
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'h-[38px] rounded-[9px] px-[18px] text-[13.5px] font-semibold transition-colors',
        active ? 'bg-surface text-ink shadow-sm' : 'text-ink-2 hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}

function ArrowButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-line bg-surface text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-40 disabled:hover:bg-surface"
    >
      {children}
    </button>
  );
}

function InvoiceChip({
  invoice,
  selected,
  onClick,
}: {
  invoice: InvoiceSummary;
  selected: boolean;
  onClick: () => void;
}) {
  const state = invoiceStateStyle(invoice.status);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={selected ? 'true' : undefined}
      className="min-w-[120px] flex-1 rounded-[13px] border-[1.5px] px-3.5 py-[11px] text-left transition-colors"
      style={{
        borderColor: selected ? state.color : 'var(--line)',
        background: selected ? state.soft : 'var(--surface)',
      }}
    >
      <div className="flex items-center gap-[7px]">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: state.color }} />
        <span className="font-manrope text-sm font-bold text-ink">
          {monthChip(invoice.referenceMonth)}
        </span>
      </div>
      <div className="mt-[5px] text-[11.5px] font-semibold" style={{ color: state.color }}>
        {state.shortLabel}
      </div>
      <div className="mt-0.5 font-manrope text-[12.5px] tabular-nums text-ink-2">
        {brl(invoice.totalCents)}
      </div>
    </button>
  );
}

function InvoicePanel({
  invoice,
  accounts,
  defaultAccountId,
  onPaid,
}: {
  invoice: InvoiceSummary;
  accounts: Account[];
  defaultAccountId: string | null;
  onPaid: () => void;
}) {
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const state = invoiceStateStyle(invoice.status);
  const remaining = Number(invoice.remainingCents);

  useEffect(() => {
    let alive = true;
    setDetail(null);
    api<InvoiceDetail>(`/invoices/${invoice.id}`)
      .then((d) => {
        if (alive) setDetail(d);
      })
      .catch((e: Error) => toast.error(e.message));
    return () => {
      alive = false;
    };
  }, [invoice.id]);

  // Pagamentos (TRANSFER) não são compras: ficam fora do extrato da fatura.
  const purchases = (detail?.transactions ?? []).filter((t) => t.type !== 'TRANSFER');
  const groups = useMemo(() => {
    const byDay = new Map<string, Transaction[]>();
    for (const tx of purchases) {
      const key = dayKeyInSaoPaulo(tx.date);
      const list = byDay.get(key);
      if (list) list.push(tx);
      else byDay.set(key, [tx]);
    }
    return [...byDay.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, rows]) => ({
        key,
        label: dayGroupLabel(key),
        rows,
        totalCents: rows.reduce(
          (sum, t) => sum + (t.type === 'INCOME' ? -1 : 1) * Number(t.amountCents),
          0,
        ),
      }));
  }, [purchases]);

  return (
    <>
      <div className="mt-3.5 rounded-[20px] border border-[var(--card-border)] bg-surface px-6 py-[22px] shadow-[var(--card-shadow)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div
              className="mb-2.5 inline-flex items-center gap-2 rounded-full px-[11px] py-[5px] text-xs font-semibold"
              style={{ background: state.soft, color: state.color }}
            >
              <span className="h-[7px] w-[7px] rounded-full" style={{ background: state.color }} />
              {state.label}
            </div>
            <div className="font-manrope text-[34px] font-bold leading-none tracking-[-0.02em] tabular-nums text-ink">
              {brl(invoice.totalCents)}
            </div>
            <div className="mt-3 flex flex-wrap gap-4 text-[13px] text-ink-2">
              <span>
                Fecha em <span className="font-semibold text-ink">{ddmm(invoice.closingDate)}</span>
              </span>
              <span>
                Vence em <span className="font-semibold text-ink">{ddmm(invoice.dueDate)}</span>
              </span>
              {Number(invoice.paidCents) > 0 && remaining > 0 && (
                <span>
                  Restam <span className="font-semibold text-ink">{brl(remaining)}</span>
                </span>
              )}
            </div>
          </div>

          {remaining > 0 ? (
            <PayInvoiceDialog
              invoice={invoice}
              accounts={accounts}
              defaultAccountId={defaultAccountId}
              onPaid={onPaid}
            >
              <button
                type="button"
                className="h-[50px] shrink-0 rounded-full bg-primary px-[26px] text-[15px] font-semibold text-white transition-colors hover:bg-primary-hover"
              >
                Pagar fatura
              </button>
            </PayInvoiceDialog>
          ) : (
            Number(invoice.totalCents) > 0 && (
              <div
                className="inline-flex h-[50px] shrink-0 items-center gap-2 rounded-full px-[22px] text-[14.5px] font-semibold"
                style={{ background: state.soft, color: 'var(--positive)' }}
              >
                <Check className="h-[18px] w-[18px]" strokeWidth={2} />
                Paga
              </div>
            )
          )}
        </div>
      </div>

      {!detail ? (
        <p className="mt-5 text-center text-sm text-ink-2">Carregando lançamentos…</p>
      ) : groups.length === 0 ? (
        <p className="mt-5 text-center text-sm text-ink-2">Sem compras nesta fatura.</p>
      ) : (
        <div className="mt-[18px] flex flex-col gap-[18px]">
          {groups.map((g) => (
            <div key={g.key}>
              <div className="flex items-baseline justify-between px-1 pb-2.5">
                <span className="font-manrope text-[13px] font-bold text-ink">{g.label}</span>
                <span className="font-manrope text-[13px] tabular-nums text-ink-2">
                  − {brl(g.totalCents)}
                </span>
              </div>
              <div className="overflow-hidden rounded-[18px] border border-[var(--card-border)] bg-surface shadow-[var(--card-shadow)]">
                {g.rows.map((tx) => (
                  <PurchaseRow key={tx.id} transaction={tx} invoiceId={invoice.id} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function PurchaseRow({ transaction, invoiceId }: { transaction: Transaction; invoiceId: string }) {
  const [open, setOpen] = useState(false);
  const parcelada = Boolean(transaction.purchaseId && transaction.installmentTotal);
  const estorno = transaction.type === 'INCOME';

  return (
    <div className="border-b border-line last:border-b-0">
      <div className="flex items-center gap-3 px-4 py-3.5">
        <CategoryBadge icon={transaction.category?.icon} color={transaction.category?.color} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[15px] text-ink">{transaction.description}</span>
            {parcelada && (
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-surface-2 px-[7px] py-0.5 transition-colors hover:bg-line"
              >
                <span className="font-manrope text-[11px] font-semibold text-ink-2">
                  {transaction.installmentNumber}/{transaction.installmentTotal}
                </span>
                <ChevronDown
                  className={cn(
                    'h-[11px] w-[11px] text-ink-2 transition-transform',
                    open && 'rotate-180',
                  )}
                  strokeWidth={2.4}
                />
              </button>
            )}
          </div>
          <div className="mt-[3px] text-xs text-ink-2">
            {transaction.category?.name ?? (estorno ? 'Estorno' : 'Sem categoria')}
          </div>
        </div>
        <span
          className="shrink-0 whitespace-nowrap font-manrope text-[15px] font-semibold tabular-nums"
          style={{ color: estorno ? 'var(--positive)' : 'var(--ink)' }}
        >
          {estorno ? '+ ' : '− '}
          {brl(transaction.amountCents)}
        </span>
      </div>

      {open && transaction.purchaseId && (
        <InstallmentSchedule purchaseId={transaction.purchaseId} currentInvoiceId={invoiceId} />
      )}
    </div>
  );
}
