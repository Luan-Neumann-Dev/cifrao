'use client';

import { CalendarDays, Check, Plus, Search, SlidersHorizontal, Tag as TagIcon, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CategoryBadge } from '@/components/category-icon';
import {
  type Account,
  type Category,
  type CreditCard,
  type Paginated,
  type Tag,
  type Transaction,
  api,
} from '@/lib/api';
import { type PeriodKey, periodRange } from '@/lib/dates';
import { brl } from '@/lib/format';
import {
  PAYMENT_METHOD_LABEL,
  TYPE_LABEL,
  amountDisplay,
  filteredTotals,
  groupByDay,
  sourceLabel,
} from '@/lib/transactions';
import { cn } from '@/lib/utils';
import { BulkCategoryDialog, BulkTagDialog } from './bulk-dialogs';
import {
  EMPTY_PANEL,
  FiltersSheet,
  type PanelFilters,
  STATUS_LABEL,
  countPanelFilters,
} from './filters-sheet';
import { TransactionSheet } from './transaction-sheet';

const PERIODS: { value: PeriodKey; label: string }[] = [
  { value: 'month', label: 'Este mês' },
  { value: 'prev', label: 'Mês passado' },
  { value: 'quarter', label: '3 meses' },
  { value: 'year', label: 'Este ano' },
  { value: 'all', label: 'Tudo' },
];

/** Período e busca ficam sempre à vista; o resto mora no painel de filtros. */
interface Filters extends PanelFilters {
  period: PeriodKey;
  search: string;
}
const EMPTY: Filters = { ...EMPTY_PANEL, period: 'month', search: '' };

/** "conta:ID" ou "cartao:ID" — um seletor só para conta e cartão, como no design. */
function sourceParam(source: string): { key: 'accountId' | 'creditCardId'; id: string } | null {
  const [kind, id] = source.split(':');
  if (!id) return null;
  return { key: kind === 'cartao' ? 'creditCardId' : 'accountId', id };
}

export default function LancamentosPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [data, setData] = useState<Paginated<Transaction> | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [creating, setCreating] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    Promise.all([
      api<Account[]>('/accounts'),
      api<CreditCard[]>('/credit-cards'),
      api<Category[]>('/categories'),
      api<Tag[]>('/tags'),
    ])
      .then(([a, cc, c, t]) => {
        setAccounts(a);
        setCards(cc);
        setCategories(c);
        setTags(t);
      })
      .catch((e) => toast.error((e as Error).message));
  }, []);

  // Filtro por clique vindo do dashboard: semeia os filtros a partir da URL.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const seed: Partial<Filters> = {};
    if (sp.get('categoryId')) seed.categoryId = sp.get('categoryId') as string;
    if (sp.get('tagId')) seed.tagId = sp.get('tagId') as string;
    if (sp.get('type')) seed.type = sp.get('type') as string;
    if (sp.get('status')) seed.status = sp.get('status') as string;
    if (sp.get('accountId')) seed.source = `conta:${sp.get('accountId')}`;
    if (sp.get('creditCardId')) seed.source = `cartao:${sp.get('creditCardId')}`;
    // Sem período na URL, mostra tudo: o dashboard já filtrou o que queria.
    if (Object.keys(seed).length > 0) setFilters((f) => ({ ...f, ...seed, period: 'all' }));
  }, []);

  const range = useMemo(() => periodRange(filters.period), [filters.period]);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (range.from) p.set('from', range.from);
    if (range.to) p.set('to', range.to);
    if (filters.type) p.set('type', filters.type);
    if (filters.categoryId) p.set('categoryId', filters.categoryId);
    if (filters.tagId) p.set('tagId', filters.tagId);
    if (filters.status) p.set('status', filters.status);
    if (filters.paymentMethod) p.set('paymentMethod', filters.paymentMethod);
    if (filters.search.trim()) p.set('search', filters.search.trim());
    const source = sourceParam(filters.source);
    if (source) p.set(source.key, source.id);
    p.set('page', String(page));
    p.set('pageSize', '100');
    return p.toString();
  }, [filters, range.from, range.to, page]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api<Paginated<Transaction>>(`/transactions?${query}`));
      setSelected(new Set());
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    const t = setTimeout(() => void load(), filters.search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, filters.search]);

  function setFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setPage(1);
    setFilters((f) => ({ ...f, [key]: value }));
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const items = useMemo(() => data?.items ?? [], [data]);
  const groups = useMemo(() => groupByDay(items), [items]);
  const totals = useMemo(() => filteredTotals(items), [items]);

  /** Exclui na hora e só confirma no servidor quando o toast fecha (desfazer). */
  function deleteWithUndo(ids: string[]) {
    const removing = new Set(ids);
    setData((d) => (d ? { ...d, items: d.items.filter((i) => !removing.has(i.id)) } : d));
    setSelected(new Set());
    let undone = false;
    toast(ids.length > 1 ? `${ids.length} lançamentos excluídos` : 'Lançamento excluído', {
      duration: 5000,
      action: {
        label: 'Desfazer',
        onClick: () => {
          undone = true;
          void load();
        },
      },
      onAutoClose: async () => {
        if (undone) return;
        try {
          if (ids.length > 1) {
            await api('/transactions/bulk', {
              method: 'POST',
              body: JSON.stringify({ action: 'delete', ids }),
            });
          } else {
            await api(`/transactions/${ids[0]}`, { method: 'DELETE' });
          }
        } catch (e) {
          toast.error((e as Error).message);
          void load();
        }
      },
    });
  }

  async function bulkClear() {
    try {
      await api('/transactions/bulk', {
        method: 'POST',
        body: JSON.stringify({ action: 'setStatus', ids: [...selected], status: 'CLEARED' }),
      });
      toast.success('Marcados como efetivados.');
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const chips = activeChips(filters, { accounts, cards, categories, tags });
  const panelCount = countPanelFilters(filters);
  const count = data?.total ?? 0;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="pb-24">
      <div className="flex items-center justify-between gap-4 px-1 pt-1">
        <div>
          <h1 className="font-manrope text-2xl font-bold tracking-[-0.015em] text-ink">
            Lançamentos
          </h1>
          <div className="mt-0.5 text-[13px] text-ink-2">
            {loading ? 'carregando…' : `${count} ${count === 1 ? 'lançamento' : 'lançamentos'}`}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          disabled={accounts.length === 0}
          className="inline-flex h-11 shrink-0 items-center gap-[7px] rounded-full bg-primary pl-4 pr-5 text-sm font-semibold text-white transition-colors hover:bg-primary-hover disabled:opacity-50"
        >
          <Plus className="h-[18px] w-[18px]" />
          Novo
        </button>
      </div>

      {accounts.length === 0 && (
        <p className="mt-4 rounded-[14px] bg-surface-2 px-4 py-3 text-sm text-ink-2">
          Crie uma conta antes de lançar.
        </p>
      )}

      {/* Barra de filtros: gruda no topo ao rolar, abaixo do cabeçalho do app. */}
      <div className="sticky top-[57px] z-20 bg-bg pb-2.5 pt-3">
        {/* Data e busca sempre à vista; o resto atrás de um botão só. */}
        <div className="flex flex-wrap gap-2">
          <ChipSelect
            icon={<CalendarDays className="h-[15px] w-[15px] text-ink-2" strokeWidth={1.75} />}
            value={filters.period}
            onChange={(v) => setFilter('period', v as PeriodKey)}
            options={PERIODS}
          />

          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            className="inline-flex h-[38px] shrink-0 items-center gap-[7px] rounded-[12px] border bg-surface px-3 text-[13px] font-medium text-ink transition-colors hover:border-primary/50"
            style={{ borderColor: panelCount > 0 ? 'var(--primary)' : 'var(--line)' }}
          >
            <SlidersHorizontal
              className="h-[15px] w-[15px]"
              strokeWidth={1.75}
              style={{ color: panelCount > 0 ? 'var(--primary)' : 'var(--ink-2)' }}
            />
            Filtros
            {panelCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 font-manrope text-[11px] font-bold text-white">
                {panelCount}
              </span>
            )}
          </button>

          <label className="inline-flex h-[38px] min-w-[150px] flex-1 items-center gap-[7px] rounded-[12px] border border-line bg-surface px-3.5 text-[13px] text-ink-2 transition-colors focus-within:border-primary">
            <Search className="h-[15px] w-[15px] shrink-0" strokeWidth={1.75} />
            <input
              value={filters.search}
              onChange={(e) => setFilter('search', e.target.value)}
              placeholder="Buscar por descrição"
              className="w-full min-w-0 bg-transparent text-ink outline-none placeholder:text-ink-2"
            />
            {filters.search && (
              <button
                type="button"
                aria-label="Limpar busca"
                onClick={() => setFilter('search', '')}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
              >
                <X className="h-3.5 w-3.5" strokeWidth={2.2} />
              </button>
            )}
          </label>
        </div>

        {chips.length > 0 && (
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {chips.map((chip) => (
              <span
                key={chip.key}
                className="inline-flex h-8 items-center gap-[7px] rounded-full bg-primary-soft pl-[13px] pr-1.5 text-[13px] font-semibold text-primary"
              >
                {chip.label}
                <button
                  type="button"
                  aria-label={`Remover filtro ${chip.label}`}
                  onClick={() => setFilter(chip.key, chip.reset as never)}
                  className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 transition-colors hover:bg-primary/25"
                >
                  <X className="h-3 w-3" strokeWidth={2.4} />
                </button>
              </span>
            ))}
            <button
              type="button"
              onClick={() => {
                setPage(1);
                // Limpa só o que está nos chips; período e busca são do usuário.
                setFilters((f) => ({ ...f, ...EMPTY_PANEL }));
              }}
              className="h-8 rounded-full px-3 text-[13px] font-medium text-ink-2 transition-colors hover:text-ink"
            >
              Limpar
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-ink-2">Carregando…</p>
      ) : groups.length === 0 ? (
        <p className="py-10 text-center text-sm text-ink-2">
          Nenhum lançamento com esses filtros.
        </p>
      ) : (
        <div className="mt-1.5 flex flex-col gap-[22px]">
          {groups.map((g) => (
            <div key={g.key}>
              <div className="flex items-baseline justify-between px-1 pb-2.5">
                <span className="font-manrope text-[13px] font-bold text-ink">{g.label}</span>
                <span className="font-manrope text-[13px] tabular-nums text-ink-2">
                  {g.totalCents < 0 ? '−' : '+'} {brl(Math.abs(g.totalCents))}
                </span>
              </div>
              <div className="overflow-hidden rounded-[18px] border border-[var(--card-border)] bg-surface shadow-[var(--card-shadow)]">
                {g.rows.map((tx) => (
                  <Row
                    key={tx.id}
                    transaction={tx}
                    selected={selected.has(tx.id)}
                    anySelected={selected.size > 0}
                    onToggle={() => toggleSelected(tx.id)}
                    onOpen={() => setEditing(tx)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-5 flex items-center justify-center gap-3">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="h-9 rounded-full border border-line px-4 text-[13px] font-semibold text-ink transition-colors hover:bg-surface-2 disabled:opacity-40"
          >
            Anterior
          </button>
          <span className="text-sm text-ink-2">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="h-9 rounded-full border border-line px-4 text-[13px] font-semibold text-ink transition-colors hover:bg-surface-2 disabled:opacity-40"
          >
            Próxima
          </button>
        </div>
      )}

      {/* Rodapé com o total do que está filtrado. */}
      {!loading && items.length > 0 && (
        <div className="sticky bottom-0 z-[15] mt-5 flex items-center justify-between gap-4 rounded-[16px] border border-[var(--card-border)] bg-surface px-5 py-4 shadow-[0_-2px_14px_rgba(26,21,35,.06)]">
          <div>
            <div className="text-xs text-ink-2">
              Total filtrado · {count} {count === 1 ? 'lançamento' : 'lançamentos'}
            </div>
            <div
              className="mt-px font-manrope text-[22px] font-bold tabular-nums"
              style={{ color: totals.netCents < 0 ? 'var(--ink)' : 'var(--positive)' }}
            >
              {totals.netCents < 0 ? '−' : '+'} {brl(Math.abs(totals.netCents))}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-positive">entradas + {brl(totals.incomeCents)}</div>
            <div className="mt-0.5 text-xs text-negative">saídas − {brl(totals.expenseCents)}</div>
          </div>
        </div>
      )}

      {/* Ações em lote: barra escura flutuante, como no design. */}
      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-[70] flex max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-1.5 overflow-x-auto rounded-full bg-ink py-2.5 pl-4 pr-2.5 shadow-[0_16px_40px_rgba(26,21,35,.32)]">
          <span className="flex shrink-0 items-center gap-2.5 whitespace-nowrap text-[13.5px] font-semibold text-white">
            <span className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-primary px-1.5 font-manrope text-xs">
              {selected.size}
            </span>
            selecionados
          </span>
          <span className="mx-1 h-[22px] w-px shrink-0 bg-white/20" />
          <BulkCategoryDialog ids={[...selected]} categories={categories} onDone={load}>
            <BulkButton icon={<CategoryBadge icon={null} color={null} className="!h-4 !w-4" />}>
              Categorizar
            </BulkButton>
          </BulkCategoryDialog>
          <BulkButton
            icon={<Check className="h-[15px] w-[15px] text-positive" strokeWidth={2} />}
            onClick={bulkClear}
          >
            Marcar pago
          </BulkButton>
          <BulkTagDialog ids={[...selected]} tags={tags} onDone={load}>
            <BulkButton icon={<TagIcon className="h-[15px] w-[15px]" strokeWidth={1.85} />}>
              Tag
            </BulkButton>
          </BulkTagDialog>
          <BulkButton
            icon={<Trash2 className="h-[15px] w-[15px]" strokeWidth={1.85} />}
            danger
            onClick={() => deleteWithUndo([...selected])}
          >
            Excluir
          </BulkButton>
          <button
            type="button"
            title="Cancelar seleção"
            onClick={() => setSelected(new Set())}
            className="ml-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          >
            <X className="h-[15px] w-[15px]" strokeWidth={2.2} />
          </button>
        </div>
      )}

      {/* FAB: ação primária no mobile (Seção 4). */}
      {selected.size === 0 && accounts.length > 0 && (
        <button
          type="button"
          onClick={() => setCreating(true)}
          title="Novo lançamento"
          className="fixed bottom-7 right-7 z-40 flex h-15 w-15 items-center justify-center rounded-full bg-primary text-white shadow-[var(--fab-shadow)] transition-transform hover:-translate-y-0.5 active:scale-95 lg:hidden"
          style={{ height: 60, width: 60 }}
        >
          <Plus className="h-[26px] w-[26px]" />
          <span className="sr-only">Novo lançamento</span>
        </button>
      )}

      {filtersOpen && (
        <FiltersSheet
          filters={filters}
          onChange={(key, value) => setFilter(key, value)}
          onClear={() => {
            setPage(1);
            // Só o painel: período e busca estão à vista e são do usuário.
            setFilters((f) => ({ ...f, ...EMPTY_PANEL }));
          }}
          onClose={() => setFiltersOpen(false)}
          accounts={accounts}
          cards={cards}
          categories={categories}
          tags={tags}
          resultCount={count}
          loading={loading}
        />
      )}

      {(creating || editing) && (
        <TransactionSheet
          transaction={editing ?? undefined}
          accounts={accounts}
          cards={cards}
          categories={categories}
          tags={tags}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={load}
          onDelete={(id) => deleteWithUndo([id])}
        />
      )}
    </div>
  );
}

interface ActiveChip {
  key: keyof Filters;
  label: string;
  reset: string;
}

/**
 * O que o botão "Filtros" está escondendo, para desligar um a um sem reabrir o
 * painel. Período e busca ficam de fora: já estão à vista com o próprio valor.
 */
function activeChips(
  filters: Filters,
  data: { accounts: Account[]; cards: CreditCard[]; categories: Category[]; tags: Tag[] },
): ActiveChip[] {
  const chips: ActiveChip[] = [];
  if (filters.type) chips.push({ key: 'type', label: TYPE_LABEL[filters.type as 'EXPENSE'], reset: '' });
  const source = sourceParam(filters.source);
  if (source) {
    const name =
      source.key === 'accountId'
        ? data.accounts.find((a) => a.id === source.id)?.name
        : data.cards.find((c) => c.id === source.id)?.nickname;
    if (name) chips.push({ key: 'source', label: name, reset: '' });
  }
  if (filters.categoryId) {
    const name = data.categories.find((c) => c.id === filters.categoryId)?.name;
    if (name) chips.push({ key: 'categoryId', label: name, reset: '' });
  }
  if (filters.tagId) {
    const name = data.tags.find((t) => t.id === filters.tagId)?.name;
    if (name) chips.push({ key: 'tagId', label: name, reset: '' });
  }
  if (filters.status) {
    chips.push({ key: 'status', label: STATUS_LABEL[filters.status], reset: '' });
  }
  if (filters.paymentMethod) {
    chips.push({
      key: 'paymentMethod',
      label: PAYMENT_METHOD_LABEL[filters.paymentMethod as 'PIX'],
      reset: '',
    });
  }
  return chips;
}

function Row({
  transaction,
  selected,
  anySelected,
  onToggle,
  onOpen,
}: {
  transaction: Transaction;
  selected: boolean;
  anySelected: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const amount = amountDisplay(transaction);
  const forecast = transaction.status === 'FORECAST';
  const parcelada = Boolean(transaction.installmentNumber && transaction.installmentTotal);
  const source = transaction.account ?? transaction.creditCard ?? null;
  const sourceColor =
    (source && 'color' in source ? source.color : null) ?? 'var(--ink-2)';

  return (
    <div
      className={cn(
        'flex cursor-pointer items-center gap-3 border-b border-line px-4 py-3.5 transition-colors last:border-b-0 hover:bg-[var(--overlay)]',
        selected && 'bg-primary-soft',
      )}
      style={{
        opacity: forecast ? 0.62 : 1,
        borderLeft: forecast ? '3px dashed var(--line)' : '3px solid transparent',
      }}
      // Com algo selecionado, clicar na linha continua selecionando: é o modo
      // "escolher vários". Sem seleção, clicar abre para editar.
      onClick={() => (anySelected ? onToggle() : onOpen())}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={selected}
        aria-label={`Selecionar ${transaction.description}`}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[7px] border-2 transition-colors"
        style={{
          borderColor: selected ? 'var(--primary)' : 'var(--line)',
          background: selected ? 'var(--primary)' : 'transparent',
        }}
      >
        {selected && <Check className="h-[13px] w-[13px] text-white" strokeWidth={3} />}
      </button>

      <CategoryBadge
        icon={transaction.type === 'TRANSFER' ? 'arrow-left-right' : transaction.category?.icon}
        color={transaction.type === 'TRANSFER' ? 'var(--ink-2)' : transaction.category?.color}
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[15px] text-ink">{transaction.description}</span>
          {parcelada && (
            <span className="shrink-0 rounded-md bg-surface-2 px-1.5 py-0.5 font-manrope text-[11px] font-semibold text-ink-2">
              {transaction.installmentNumber}/{transaction.installmentTotal}
            </span>
          )}
          {forecast && (
            <span className="shrink-0 rounded-md bg-primary-soft px-[7px] py-0.5 text-[11px] font-semibold text-primary">
              previsto
            </span>
          )}
        </div>
        <div className="mt-[3px] flex items-center gap-[7px] text-xs text-ink-2">
          <span className="inline-flex min-w-0 items-center gap-[5px]">
            <span
              className="h-[7px] w-[7px] shrink-0 rounded-[2px]"
              style={{ background: sourceColor }}
            />
            <span className="truncate">{sourceLabel(transaction)}</span>
          </span>
          <span className="shrink-0">
            · {transaction.category?.name ?? TYPE_LABEL[transaction.type]}
          </span>
        </div>
      </div>

      <span
        className="shrink-0 whitespace-nowrap font-manrope text-[15px] font-semibold tabular-nums"
        style={{ color: amount.color }}
      >
        {amount.text} {brl(transaction.amountCents)}
      </span>
    </div>
  );
}

function BulkButton({
  icon,
  children,
  danger,
  onClick,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  danger?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[13px] font-semibold transition-colors hover:bg-white/15',
        danger ? 'text-negative' : 'text-white',
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function ChipSelect({
  icon,
  value,
  onChange,
  options,
}: {
  icon?: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  const active = value !== '' && value !== 'month';
  return (
    <span
      className="relative inline-flex h-[38px] shrink-0 items-center gap-[7px] rounded-[12px] border bg-surface px-3 text-[13px] font-medium text-ink"
      style={{ borderColor: active ? 'var(--primary)' : 'var(--line)' }}
    >
      {icon}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="cursor-pointer appearance-none bg-transparent pr-4 text-ink outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <svg
        className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-ink-2"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </span>
  );
}
