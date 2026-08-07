'use client';

import {
  ACCOUNT_PAYMENT_METHODS,
  type PaymentMethod,
  type RecurrenceFrequency,
  formatInSaoPaulo,
  invoiceWindowForPurchase,
  splitInstallments,
} from '@cifrao/shared';
import {
  ArrowDown,
  Banknote,
  Barcode,
  CalendarDays,
  ChevronDown,
  CreditCard as CreditCardIcon,
  Info,
  MoreHorizontal,
  Repeat,
  Split,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { categoryIcon } from '@/components/category-icon';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
  type Account,
  type Category,
  type CategorySuggestion,
  type CreditCard,
  type Tag,
  type Transaction,
  api,
} from '@/lib/api';
import { accountMark } from '@/lib/accounts';
import { monthLongLabel } from '@/lib/dates';
import { brl } from '@/lib/format';
import { PAYMENT_METHOD_LABEL } from '@/lib/transactions';
import { cn } from '@/lib/utils';
import { SplitEditor } from './split-editor';

type FormType = 'EXPENSE' | 'INCOME' | 'TRANSFER';

const TYPE_TABS: { value: FormType; label: string }[] = [
  { value: 'EXPENSE', label: 'Despesa' },
  { value: 'INCOME', label: 'Receita' },
  { value: 'TRANSFER', label: 'Transferência' },
];

const METHOD_ICON: Record<PaymentMethod, ReactNode> = {
  PIX: <Zap className="h-[15px] w-[15px]" strokeWidth={1.9} />,
  DEBIT: <CreditCardIcon className="h-[15px] w-[15px]" strokeWidth={1.9} />,
  CREDIT: <CreditCardIcon className="h-[15px] w-[15px]" strokeWidth={1.9} />,
  CASH: <Banknote className="h-[15px] w-[15px]" strokeWidth={1.9} />,
  BOLETO: <Barcode className="h-[15px] w-[15px]" strokeWidth={1.9} />,
};

const INSTALLMENT_OPTIONS = [1, 2, 3, 6, 10, 12, 18, 24];
const RECURRENCES: { value: RecurrenceFrequency; label: string }[] = [
  { value: 'MONTHLY', label: 'Mensal' },
  { value: 'WEEKLY', label: 'Semanal' },
  { value: 'QUARTERLY', label: 'Trimestral' },
  { value: 'YEARLY', label: 'Anual' },
];

function todayInSp(): string {
  return formatInSaoPaulo(new Date(), 'yyyy-MM-dd');
}
function daysAgoInSp(days: number): string {
  return formatInSaoPaulo(new Date(Date.now() - days * 86_400_000), 'yyyy-MM-dd');
}
/** Centavos digitados no teclado viram "1.234,56" para exibição. */
function centsToDisplay(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Formulário de lançamento no formato do design: valor grande em cima, teclado
 * numérico no celular, e os campos que só fazem sentido para o tipo escolhido.
 */
export function TransactionSheet({
  transaction,
  accounts,
  cards,
  categories,
  tags,
  onClose,
  onSaved,
  onDelete,
}: {
  transaction?: Transaction;
  accounts: Account[];
  cards: CreditCard[];
  categories: Category[];
  tags: Tag[];
  onClose: () => void;
  onSaved: () => void;
  onDelete: (id: string) => void;
}) {
  const editing = Boolean(transaction);
  const [type, setType] = useState<FormType>((transaction?.type as FormType) ?? 'EXPENSE');
  const [cents, setCents] = useState(transaction ? Number(transaction.amountCents) : 0);
  const [date, setDate] = useState(
    transaction ? formatInSaoPaulo(new Date(transaction.date), 'yyyy-MM-dd') : todayInSp(),
  );
  const [method, setMethod] = useState<PaymentMethod>(
    transaction?.paymentMethod ?? (transaction?.creditCardId ? 'CREDIT' : 'PIX'),
  );
  const [accountId, setAccountId] = useState(transaction?.account?.id ?? accounts[0]?.id ?? '');
  const [cardId, setCardId] = useState(transaction?.creditCardId ?? cards[0]?.id ?? '');
  const [installments, setInstallments] = useState(transaction?.installmentTotal ?? 1);
  const [categoryId, setCategoryId] = useState(transaction?.category?.id ?? '');
  const [fromAccountId, setFromAccountId] = useState(transaction?.fromAccount?.id ?? '');
  const [toAccountId, setToAccountId] = useState(transaction?.toAccount?.id ?? '');
  const [description, setDescription] = useState(transaction?.description ?? '');
  const [notes, setNotes] = useState(transaction?.notes ?? '');
  const [selectedTags, setSelectedTags] = useState<string[]>(
    transaction?.tags.map((t) => t.tag.id) ?? [],
  );
  const [isReimbursable, setIsReimbursable] = useState(transaction?.isReimbursable ?? false);
  const [moreOpen, setMoreOpen] = useState(editing);
  const [repeat, setRepeat] = useState(false);
  const [frequency, setFrequency] = useState<RecurrenceFrequency>('MONTHLY');
  const [splitOpen, setSplitOpen] = useState(false);
  const [suggestion, setSuggestion] = useState<CategorySuggestion | null>(null);
  const [saving, setSaving] = useState(false);

  const isCredit = type !== 'TRANSFER' && method === 'CREDIT';
  const card = cards.find((c) => c.id === cardId) ?? null;

  // Sugestão de categoria a partir da descrição (motor de regras da Fase 6).
  useEffect(() => {
    if (type === 'TRANSFER' || description.trim().length < 3 || editing) {
      setSuggestion(null);
      return;
    }
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ description: description.trim() });
      if (cents > 0) params.set('amountCents', String(cents));
      api<CategorySuggestion | null>(`/categories/sugestao?${params}`)
        .then(setSuggestion)
        .catch(() => setSuggestion(null));
    }, 400);
    return () => clearTimeout(timer);
  }, [description, cents, type, editing]);

  /** Regra 5.3: em qual fatura a compra cai, com os dias deste cartão. */
  const invoice = useMemo(() => {
    if (!isCredit || !card || !date) return null;
    const [year, month, day] = date.split('-').map(Number);
    if (!year || !month || !day) return null;
    const w = invoiceWindowForPurchase({ year, month, day }, card.closingDay, card.dueDay);
    const p2 = (n: number) => String(n).padStart(2, '0');
    const parts = cents > 0 ? splitInstallments(BigInt(cents), installments) : [];
    return {
      label: monthLongLabel(w.referenceMonth, year),
      closing: `${p2(w.closing.day)}/${p2(w.closing.month)}`,
      firstPart: parts[0],
      lastMonth: lastInvoiceMonth(w.referenceMonth, installments, year),
    };
  }, [isCredit, card, date, cents, installments]);

  const kindCategories = categories.filter(
    (c) => c.kind === 'BOTH' || (type === 'EXPENSE' ? c.kind === 'EXPENSE' : c.kind === 'INCOME'),
  );
  const suggestedId = suggestion?.categoryId ?? null;
  /** A sugerida sobe para o começo da grade — é onde o polegar já está. */
  const gridCategories = useMemo(() => {
    if (!suggestedId) return kindCategories;
    const found = kindCategories.find((c) => c.id === suggestedId);
    if (!found) return kindCategories;
    return [found, ...kindCategories.filter((c) => c.id !== suggestedId)];
  }, [kindCategories, suggestedId]);

  function pressKey(key: number | '00' | 'del') {
    setCents((current) => {
      if (key === 'del') return Math.floor(current / 10);
      if (key === '00') return Math.min(99_999_999, current * 100);
      return Math.min(99_999_999, current * 10 + key);
    });
  }

  function toggleTag(id: string) {
    setSelectedTags((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  }

  const valueColor =
    type === 'INCOME' ? 'var(--positive)' : type === 'TRANSFER' ? 'var(--ink)' : 'var(--negative)';

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (cents <= 0) {
      toast.error('Informe um valor maior que zero.');
      return;
    }
    setSaving(true);
    const isoDate = new Date(`${date}T12:00:00.000Z`).toISOString();
    const finalDescription = description.trim() || defaultDescription(type, categoryId, categories);

    try {
      if (editing && transaction) {
        await api(`/transactions/${transaction.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            amountCents: cents,
            date: isoDate,
            description: finalDescription,
            notes: notes || null,
            categoryId: type === 'TRANSFER' ? undefined : categoryId || null,
            paymentMethod: type === 'TRANSFER' ? undefined : method,
            isReimbursable,
            tagIds: selectedTags,
          }),
        });
        toast.success('Alterações salvas.');
      } else if (type === 'TRANSFER') {
        await api('/transactions', {
          method: 'POST',
          body: JSON.stringify({
            type,
            fromAccountId,
            toAccountId,
            amountCents: cents,
            date: isoDate,
            description: finalDescription,
          }),
        });
        toast.success('Transferência registrada.');
      } else if (isCredit) {
        await api(`/credit-cards/${cardId}/purchases`, {
          method: 'POST',
          body: JSON.stringify({
            amountCents: cents,
            date: isoDate,
            description: finalDescription,
            installments,
            categoryId: categoryId || undefined,
            notes: notes || undefined,
            isReimbursable,
            tagIds: selectedTags,
          }),
        });
        toast.success(installments > 1 ? `Compra em ${installments}x lançada.` : 'Compra lançada.');
      } else {
        await api('/transactions', {
          method: 'POST',
          body: JSON.stringify({
            type,
            accountId,
            amountCents: cents,
            date: isoDate,
            description: finalDescription,
            notes: notes || undefined,
            categoryId: categoryId || undefined,
            paymentMethod: method,
            isReimbursable,
            tagIds: selectedTags,
          }),
        });
        toast.success(type === 'INCOME' ? 'Receita lançada.' : 'Despesa lançada.');
      }

      // Repetir cria a regra da Fase 5, que gera os previstos a partir daqui.
      if (repeat && !editing && type !== 'TRANSFER' && !isCredit) {
        await api('/recurring-rules', {
          method: 'POST',
          body: JSON.stringify({
            description: finalDescription,
            type,
            amountCents: cents,
            frequency,
            startDate: isoDate,
            accountId,
            categoryId: categoryId || undefined,
          }),
        });
        toast.success('Recorrência criada — os previstos já entraram na lista.');
      }

      onSaved();
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent sheet hideClose className="p-0">
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex justify-center pt-2.5 sm:hidden">
            <span className="h-[5px] w-[38px] rounded-full bg-line" />
          </div>

          <div className="flex items-center justify-between px-[22px] pb-2 pt-4">
            <div className="flex items-center gap-2.5">
              <DialogTitle className="font-manrope text-[19px] font-bold text-ink">
                {editing ? 'Editar lançamento' : 'Novo lançamento'}
              </DialogTitle>
              {editing && (
                <span className="rounded-md bg-surface-2 px-2 py-[3px] text-[11px] uppercase tracking-[0.05em] text-ink-2">
                  edição
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] bg-surface-2 text-ink-2 transition-colors hover:text-ink"
            >
              <X className="h-[17px] w-[17px]" />
              <span className="sr-only">Fechar</span>
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="px-[22px] pt-1.5 text-center">
              <div className="flex items-baseline justify-center gap-2">
                <span className="font-manrope text-[22px] font-semibold text-ink-2">R$</span>
                {/* No desktop dá para digitar; no celular o teclado abaixo manda. */}
                <input
                  aria-label="Valor"
                  inputMode="none"
                  readOnly
                  value={centsToDisplay(cents)}
                  onChange={() => undefined}
                  className="w-[min(300px,70vw)] bg-transparent text-center font-manrope text-[40px] font-bold leading-[1.1] tracking-[-0.02em] tabular-nums outline-none sm:hidden"
                  style={{ color: valueColor }}
                />
                <input
                  aria-label="Valor"
                  inputMode="decimal"
                  value={centsToDisplay(cents)}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, '').slice(0, 8);
                    setCents(Number(digits));
                  }}
                  className="hidden w-[min(300px,70vw)] bg-transparent text-center font-manrope text-[40px] font-bold leading-[1.1] tracking-[-0.02em] tabular-nums outline-none sm:block"
                  style={{ color: valueColor }}
                />
              </div>

              {!editing && (
                <div className="mt-4 inline-flex rounded-[12px] bg-surface-2 p-1">
                  {TYPE_TABS.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setType(t.value)}
                      className={cn(
                        'h-[38px] rounded-[9px] px-4 text-[13.5px] font-semibold transition-colors',
                        type === t.value ? 'bg-surface text-ink shadow-sm' : 'text-ink-2',
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Teclado só no celular: no desktop o teclado físico é mais rápido. */}
            <div className="grid grid-cols-3 gap-2 px-[22px] pb-1.5 pt-[18px] sm:hidden">
              {([1, 2, 3, 4, 5, 6, 7, 8, 9, '00', 0, 'del'] as const).map((k) => (
                <button
                  key={String(k)}
                  type="button"
                  onClick={() => pressKey(k === 'del' ? 'del' : k)}
                  className="h-14 rounded-[14px] bg-surface-2 font-manrope text-[22px] font-bold text-ink transition-transform active:scale-95"
                >
                  {k === 'del' ? '⌫' : k}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-5 px-[22px] pt-3">
              <Section label="Data">
                <div className="flex gap-2">
                  <PickButton active={date === todayInSp()} onClick={() => setDate(todayInSp())}>
                    Hoje
                  </PickButton>
                  <PickButton
                    active={date === daysAgoInSp(1)}
                    onClick={() => setDate(daysAgoInSp(1))}
                  >
                    Ontem
                  </PickButton>
                  <label
                    className={cn(
                      'flex h-[42px] flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[12px] border-[1.5px] text-sm font-semibold transition-colors',
                      date !== todayInSp() && date !== daysAgoInSp(1)
                        ? 'border-primary bg-primary-soft text-primary'
                        : 'border-line bg-surface text-ink-2',
                    )}
                  >
                    <CalendarDays className="h-[15px] w-[15px]" strokeWidth={1.75} />
                    {date !== todayInSp() && date !== daysAgoInSp(1)
                      ? formatInSaoPaulo(new Date(`${date}T12:00:00Z`), 'dd/MM')
                      : 'Escolher'}
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => e.target.value && setDate(e.target.value)}
                      className="sr-only"
                    />
                  </label>
                </div>
              </Section>

              {type !== 'TRANSFER' ? (
                <>
                  <Section label="Forma de pagamento">
                    <div className="flex flex-wrap gap-2">
                      {(['CREDIT', ...ACCOUNT_PAYMENT_METHODS] as PaymentMethod[]).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setMethod(m)}
                          disabled={m === 'CREDIT' && cards.length === 0}
                          className="inline-flex h-10 items-center gap-[7px] rounded-full border-[1.5px] px-3.5 text-[13.5px] font-semibold transition-colors disabled:opacity-40"
                          style={{
                            borderColor: method === m ? 'var(--primary)' : 'var(--line)',
                            background: method === m ? 'var(--primary-soft)' : 'var(--surface)',
                            color: method === m ? 'var(--primary)' : 'var(--ink)',
                          }}
                        >
                          {METHOD_ICON[m]}
                          {PAYMENT_METHOD_LABEL[m]}
                        </button>
                      ))}
                    </div>
                  </Section>

                  {isCredit ? (
                    <div className="flex flex-col gap-3.5 rounded-[16px] bg-surface-2 p-4">
                      <div>
                        <div className="mb-2 text-xs font-semibold text-ink-2">Cartão</div>
                        <div className="flex flex-wrap gap-2">
                          {cards.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => setCardId(c.id)}
                              className="inline-flex h-[38px] items-center gap-2 rounded-[10px] border-[1.5px] bg-surface px-3 text-[13px] font-semibold text-ink transition-colors"
                              style={{
                                borderColor: cardId === c.id ? 'var(--primary)' : 'var(--line)',
                              }}
                            >
                              <span
                                className="h-2.5 w-2.5 rounded-[3px]"
                                style={{ background: c.color ?? 'var(--primary)' }}
                              />
                              {c.nickname}
                            </button>
                          ))}
                        </div>
                      </div>

                      {invoice && (
                        <div className="flex items-start gap-2.5 text-[13px] leading-snug text-ink">
                          <CreditCardIcon
                            className="mt-px h-[17px] w-[17px] shrink-0 text-primary"
                            strokeWidth={1.85}
                          />
                          <span>
                            Entra na fatura de{' '}
                            <b className="font-manrope font-bold text-primary">{invoice.label}</b>{' '}
                            <span className="text-ink-2">(fecha {invoice.closing})</span>
                          </span>
                        </div>
                      )}

                      {!editing && (
                        <div>
                          <div className="mb-2 text-xs font-semibold text-ink-2">Parcelas</div>
                          <div className="flex gap-[7px] overflow-x-auto pb-0.5">
                            {INSTALLMENT_OPTIONS.map((n) => (
                              <button
                                key={n}
                                type="button"
                                onClick={() => setInstallments(n)}
                                className="h-[38px] min-w-[44px] shrink-0 rounded-[10px] border-[1.5px] px-3 font-manrope text-[13px] font-bold transition-colors"
                                style={{
                                  borderColor:
                                    installments === n ? 'var(--primary)' : 'var(--line)',
                                  background:
                                    installments === n ? 'var(--primary)' : 'var(--surface)',
                                  color: installments === n ? '#fff' : 'var(--ink)',
                                }}
                              >
                                {n}x
                              </button>
                            ))}
                          </div>
                          {installments > 1 && invoice?.firstPart !== undefined && (
                            <div className="mt-2.5 text-[13px] text-ink">
                              <b className="font-manrope font-bold">
                                {installments}× de {brl(invoice.firstPart.toString())}
                              </b>{' '}
                              <span className="text-ink-2">— até {invoice.lastMonth}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <Section label="Conta">
                      <div className="relative flex h-[52px] items-center gap-[11px] rounded-[14px] border-[1.5px] border-line bg-surface px-4 focus-within:border-primary">
                        <span
                          className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] font-manrope text-[13px] font-bold text-white"
                          style={{
                            background:
                              accounts.find((a) => a.id === accountId)?.color ?? 'var(--primary)',
                          }}
                        >
                          {(() => {
                            const a = accounts.find((x) => x.id === accountId);
                            return a ? accountMark(a.name, a.type) : '—';
                          })()}
                        </span>
                        <span className="flex-1 truncate text-[15px] text-ink">
                          {accounts.find((a) => a.id === accountId)?.name ?? 'Selecione'}
                        </span>
                        <ChevronDown className="h-[17px] w-[17px] shrink-0 text-ink-2" />
                        <select
                          aria-label="Conta"
                          value={accountId}
                          onChange={(e) => setAccountId(e.target.value)}
                          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                        >
                          <option value="">Selecione…</option>
                          {accounts.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </Section>
                  )}

                  <Section label="Categoria">
                    <div className="grid grid-cols-3 gap-2">
                      {gridCategories.slice(0, 9).map((c) => {
                        const Icon = categoryIcon(c.icon);
                        const on = categoryId === c.id;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => setCategoryId(on ? '' : c.id)}
                            className="relative flex h-[74px] flex-col items-center justify-center gap-1.5 rounded-[14px] border-[1.5px] transition-colors"
                            style={{
                              borderColor: on ? 'var(--primary)' : 'var(--line)',
                              background: on ? 'var(--primary-soft)' : 'var(--surface)',
                            }}
                          >
                            <span
                              className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px]"
                              style={{
                                color: c.color ?? 'var(--ink-2)',
                                background: `color-mix(in srgb, ${c.color ?? 'var(--ink-2)'} 14%, transparent)`,
                              }}
                            >
                              <Icon className="h-[18px] w-[18px]" strokeWidth={1.85} />
                            </span>
                            <span className="max-w-full truncate px-1 text-xs font-medium text-ink">
                              {c.name}
                            </span>
                            {c.id === suggestedId && (
                              <span className="absolute right-1.5 top-1.5 rounded-[5px] bg-primary-soft px-1.5 py-px text-[9px] font-bold uppercase tracking-[0.04em] text-primary">
                                sugerido
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    {kindCategories.length > 9 && (
                      <div className="relative mt-2 flex h-11 items-center rounded-[13px] border border-line px-4">
                        <span className="flex-1 truncate text-sm text-ink">
                          {categories.find((c) => c.id === categoryId)?.name ??
                            'Outra categoria…'}
                        </span>
                        <ChevronDown className="h-4 w-4 text-ink-2" />
                        <select
                          aria-label="Outra categoria"
                          value={categoryId}
                          onChange={(e) => setCategoryId(e.target.value)}
                          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                        >
                          <option value="">Sem categoria</option>
                          {kindCategories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </Section>
                </>
              ) : (
                <div className="flex flex-col gap-3.5">
                  <Section label="De">
                    <AccountSelect
                      accounts={accounts}
                      value={fromAccountId}
                      highlight
                      onChange={(v) => {
                        setFromAccountId(v);
                        if (v === toAccountId) setToAccountId('');
                      }}
                    />
                  </Section>
                  <div className="flex justify-center">
                    <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-surface-2 text-ink-2">
                      <ArrowDown className="h-[18px] w-[18px]" strokeWidth={1.85} />
                    </span>
                  </div>
                  <Section label="Para">
                    <AccountSelect
                      accounts={accounts.filter((a) => a.id !== fromAccountId)}
                      value={toAccountId}
                      onChange={setToAccountId}
                    />
                  </Section>
                  {accounts.length < 2 && (
                    <p className="rounded-[12px] bg-surface-2 px-3.5 py-2.5 text-xs text-ink-2">
                      Transferência move dinheiro entre duas contas suas, e você tem{' '}
                      {accounts.length === 1 ? 'só uma' : 'nenhuma'} cadastrada.
                    </p>
                  )}
                </div>
              )}

              <div>
                <button
                  type="button"
                  onClick={() => setMoreOpen((v) => !v)}
                  aria-expanded={moreOpen}
                  className="flex h-[46px] w-full items-center justify-between rounded-[13px] border border-line px-4 text-sm font-semibold text-ink transition-colors hover:bg-surface-2"
                >
                  <span className="inline-flex items-center gap-2.5">
                    <MoreHorizontal className="h-[17px] w-[17px] text-ink-2" strokeWidth={1.85} />
                    Mais opções
                  </span>
                  <ChevronDown
                    className={cn(
                      'h-[17px] w-[17px] text-ink-2 transition-transform',
                      moreOpen && 'rotate-180',
                    )}
                  />
                </button>

                {moreOpen && (
                  <div className="mt-3 flex flex-col gap-3">
                    <input
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Descrição"
                      maxLength={200}
                      className="h-12 w-full rounded-[13px] border border-line bg-surface px-[15px] text-[14.5px] text-ink outline-none transition-colors placeholder:text-ink-2/60 focus:border-primary focus:shadow-[var(--ring)]"
                    />

                    {tags.length > 0 && type !== 'TRANSFER' && (
                      <div className="flex flex-wrap gap-2">
                        {tags.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => toggleTag(t.id)}
                            className={cn(
                              'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                              selectedTags.includes(t.id)
                                ? 'border-primary bg-primary-soft text-primary'
                                : 'border-line text-ink-2',
                            )}
                          >
                            {t.name}
                          </button>
                        ))}
                      </div>
                    )}

                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Observação"
                      rows={2}
                      className="w-full resize-none rounded-[13px] border border-line bg-surface px-[15px] py-3 text-[14.5px] text-ink outline-none transition-colors placeholder:text-ink-2/60 focus:border-primary focus:shadow-[var(--ring)]"
                    />

                    {editing && transaction && type !== 'TRANSFER' && (
                      <button
                        type="button"
                        onClick={() => setSplitOpen(true)}
                        className="flex h-12 items-center justify-between rounded-[13px] border border-line px-[15px] text-sm text-ink transition-colors hover:bg-surface-2"
                      >
                        <span className="inline-flex items-center gap-2.5">
                          <Split className="h-4 w-4 text-ink-2" strokeWidth={1.85} />
                          Dividir entre categorias
                        </span>
                        <ChevronDown className="h-4 w-4 -rotate-90 text-ink-2" />
                      </button>
                    )}

                    {type === 'EXPENSE' && (
                      <div className="flex h-12 items-center justify-between rounded-[13px] border border-line px-[15px]">
                        <span className="text-sm text-ink">Reembolsável</span>
                        <Toggle on={isReimbursable} onChange={setIsReimbursable} label="Reembolsável" />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Repetir cria a regra de recorrência da Fase 5 (regra 5.11). */}
              {!editing && type !== 'TRANSFER' && !isCredit && (
                <div>
                  <div className="flex h-12 items-center justify-between">
                    <span className="inline-flex items-center gap-2.5 text-[14.5px] font-medium text-ink">
                      <Repeat className="h-[18px] w-[18px] text-ink-2" strokeWidth={1.85} />
                      Repetir
                    </span>
                    <Toggle on={repeat} onChange={setRepeat} label="Repetir" />
                  </div>
                  {repeat && (
                    <div className="mt-1.5 flex flex-wrap gap-[7px]">
                      {RECURRENCES.map((r) => (
                        <button
                          key={r.value}
                          type="button"
                          onClick={() => setFrequency(r.value)}
                          className="h-[38px] rounded-full border-[1.5px] px-3.5 text-[13px] font-semibold transition-colors"
                          style={{
                            borderColor: frequency === r.value ? 'var(--primary)' : 'var(--line)',
                            background:
                              frequency === r.value ? 'var(--primary-soft)' : 'var(--surface)',
                            color: frequency === r.value ? 'var(--primary)' : 'var(--ink)',
                          }}
                        >
                          {r.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {editing && transaction && (
                <button
                  type="button"
                  onClick={() => {
                    onDelete(transaction.id);
                    onClose();
                  }}
                  className="inline-flex h-[46px] items-center justify-center gap-2 rounded-[13px] text-sm font-semibold text-negative transition-colors hover:bg-[color-mix(in_srgb,var(--negative)_8%,transparent)]"
                >
                  <Trash2 className="h-4 w-4" strokeWidth={1.85} />
                  Excluir lançamento
                </button>
              )}

              {editing && (
                <p className="flex items-start gap-2 text-xs leading-snug text-ink-2">
                  <Info className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={1.85} />
                  Trocar de conta ou de tipo é excluir e lançar de novo — assim o saldo das duas
                  contas nunca fica pela metade.
                </p>
              )}
            </div>
          </div>

          <div className="sticky bottom-0 mt-4 border-t border-line bg-surface px-[22px] pb-[calc(14px+env(safe-area-inset-bottom))] pt-3.5">
            <button
              type="submit"
              disabled={saving || cents <= 0}
              className="h-[54px] w-full rounded-full bg-primary text-base font-semibold text-white transition-colors hover:bg-primary-hover disabled:opacity-50"
            >
              {saving ? 'Salvando…' : editing ? 'Salvar alterações' : `Lançar ${brl(cents)}`}
            </button>
          </div>
        </form>
      </DialogContent>

      {splitOpen && transaction && (
        <SplitEditor
          transaction={transaction}
          categories={categories}
          onClose={() => setSplitOpen(false)}
          onSaved={onSaved}
        />
      )}
    </Dialog>
  );
}

/** Mês da última parcela, para o "até novembro/2026". */
function lastInvoiceMonth(referenceMonth: string, installments: number, year: number): string {
  const [y, m] = referenceMonth.split('-').map(Number);
  const total = m - 1 + (installments - 1);
  const lastYear = y + Math.floor(total / 12);
  const lastMonth = (total % 12) + 1;
  return monthLongLabel(`${lastYear}-${String(lastMonth).padStart(2, '0')}`, year);
}

/** Sem descrição digitada, o nome da categoria já diz mais que "Lançamento". */
function defaultDescription(type: FormType, categoryId: string, categories: Category[]): string {
  const category = categories.find((c) => c.id === categoryId);
  if (category) return category.name;
  return type === 'INCOME' ? 'Receita' : type === 'TRANSFER' ? 'Transferência' : 'Despesa';
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2.5 text-xs font-semibold uppercase tracking-[0.04em] text-ink-2">
        {label}
      </div>
      {children}
    </div>
  );
}

function PickButton({
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
      className="h-[42px] flex-1 rounded-[12px] border-[1.5px] text-sm font-semibold transition-colors"
      style={{
        borderColor: active ? 'var(--primary)' : 'var(--line)',
        background: active ? 'var(--primary-soft)' : 'var(--surface)',
        color: active ? 'var(--primary)' : 'var(--ink-2)',
      }}
    >
      {children}
    </button>
  );
}

function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className="relative h-[26px] w-11 rounded-full transition-colors"
      style={{ background: on ? 'var(--primary)' : 'var(--track)' }}
    >
      <span
        className="absolute top-[3px] h-5 w-5 rounded-full bg-white transition-[left]"
        style={{ left: on ? 21 : 3 }}
      />
    </button>
  );
}

function AccountSelect({
  accounts,
  value,
  onChange,
  highlight,
}: {
  accounts: Account[];
  value: string;
  onChange: (value: string) => void;
  highlight?: boolean;
}) {
  const account = accounts.find((a) => a.id === value) ?? null;
  return (
    <div
      className="relative flex h-[52px] items-center gap-[11px] rounded-[14px] border-[1.5px] bg-surface px-4 focus-within:border-primary"
      style={{ borderColor: highlight && account ? 'var(--primary)' : 'var(--line)' }}
    >
      <span
        className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] font-manrope text-[13px] font-bold text-white"
        style={{ background: account?.color ?? 'var(--surface-2)' }}
      >
        {account ? accountMark(account.name, account.type) : '—'}
      </span>
      <span className="flex-1 truncate text-[15px] text-ink">
        {account?.name ?? 'Selecione uma conta'}
      </span>
      <ChevronDown className="h-[17px] w-[17px] shrink-0 text-ink-2" />
      <select
        aria-label="Conta"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      >
        <option value="">Selecione…</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
    </div>
  );
}
