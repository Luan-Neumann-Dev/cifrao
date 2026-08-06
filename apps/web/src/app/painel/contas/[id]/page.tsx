'use client';

import { type TransactionType, accountDeltaCents } from '@cifrao/shared';
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  Pencil,
  Search,
  SlidersVertical,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  type ButtonHTMLAttributes,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { toast } from 'sonner';
import { CategoryBadge } from '@/components/category-icon';
import {
  type Account,
  type BalancePoint,
  type Category,
  type Paginated,
  type Transaction,
  api,
} from '@/lib/api';
import { ACCOUNT_TYPE_LABEL, accountMark } from '@/lib/accounts';
import { type PeriodKey, dayGroupLabel, dayKeyInSaoPaulo, monthShortLabel, periodRange } from '@/lib/dates';
import { brl, splitBrl } from '@/lib/format';
import { AccountDialog } from '../account-dialog';
import { AdjustDialog } from '../adjust-dialog';

const PERIODS: { value: PeriodKey; label: string }[] = [
  { value: 'month', label: 'Este mês' },
  { value: 'prev', label: 'Mês passado' },
  { value: 'quarter', label: '3 meses' },
  { value: 'year', label: 'Este ano' },
  { value: 'all', label: 'Tudo' },
];

const TYPE_LABEL: Record<TransactionType, string> = {
  EXPENSE: 'Despesa',
  INCOME: 'Receita',
  TRANSFER: 'Transferência',
  ADJUSTMENT: 'Ajuste',
};

interface DayGroup {
  key: string;
  label: string;
  totalCents: number;
  rows: Transaction[];
}

export default function ContaDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const [account, setAccount] = useState<Account | null>(null);
  const [evolution, setEvolution] = useState<BalancePoint[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  const [period, setPeriod] = useState<PeriodKey>('month');
  const [type, setType] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [search, setSearch] = useState('');

  const range = useMemo(() => periodRange(period), [period]);

  const loadAccount = useCallback(async () => {
    try {
      const [acc, ev] = await Promise.all([
        api<Account>(`/accounts/${id}`),
        api<BalancePoint[]>(`/accounts/${id}/balance-evolution`),
      ]);
      setAccount(acc);
      setEvolution(ev);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadAccount();
    api<Category[]>('/categories')
      .then(setCategories)
      .catch(() => setCategories([]));
  }, [loadAccount]);

  const loadTransactions = useCallback(async () => {
    const params = new URLSearchParams({ accountId: id, pageSize: '200' });
    if (range.from) params.set('from', range.from);
    if (range.to) params.set('to', range.to);
    if (type) params.set('type', type);
    if (categoryId) params.set('categoryId', categoryId);
    if (search.trim()) params.set('search', search.trim());
    try {
      const page = await api<Paginated<Transaction>>(`/transactions?${params}`);
      setTransactions(page.items);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, [id, range.from, range.to, type, categoryId, search]);

  useEffect(() => {
    // A busca digita letra a letra: espera parar de digitar antes de consultar.
    const t = setTimeout(() => void loadTransactions(), search ? 300 : 0);
    return () => clearTimeout(t);
  }, [loadTransactions, search]);

  /** Agrupa por dia no fuso de SP e soma o efeito de cada lançamento nesta conta. */
  const groups = useMemo<DayGroup[]>(() => {
    const byDay = new Map<string, Transaction[]>();
    for (const tx of transactions) {
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
        totalCents: rows.reduce((sum, tx) => sum + Number(deltaFor(tx, id)), 0),
      }));
  }, [transactions, id]);

  const chart = useMemo(
    () =>
      evolution.map((p) => ({
        month: monthShortLabel(p.month),
        value: Number(p.balanceCents) / 100,
      })),
    [evolution],
  );
  const deltaCents =
    evolution.length > 1
      ? Number(evolution[evolution.length - 1].balanceCents) - Number(evolution[0].balanceCents)
      : 0;

  if (loading) return <p className="text-sm text-ink-2">Carregando…</p>;
  if (!account) return <p className="text-sm text-ink-2">Conta não encontrada.</p>;

  const parts = splitBrl(account.balanceCents);
  const color = account.color ?? 'var(--primary)';
  const DeltaIcon = deltaCents < 0 ? TrendingDown : TrendingUp;

  return (
    <div>
      <Link
        href="/painel/contas"
        className="mb-1.5 inline-flex h-9 items-center gap-[7px] px-1.5 text-[13.5px] font-semibold text-ink-2 transition-colors hover:text-ink"
      >
        <ChevronLeft className="h-[17px] w-[17px]" />
        Contas
      </Link>

      <div className="rounded-[20px] border border-[var(--card-border)] bg-surface px-[26px] py-6 shadow-[var(--card-shadow)]">
        <div className="flex flex-wrap items-start justify-between gap-3.5">
          <div className="flex items-center gap-3">
            <span
              className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-[13px] font-manrope text-lg font-extrabold text-white"
              style={{ background: color }}
            >
              {accountMark(account.name, account.type)}
            </span>
            <div>
              <div className="font-manrope text-[17px] font-bold text-ink">{account.name}</div>
              <div className="mt-0.5 text-[12.5px] text-ink-2">
                {ACCOUNT_TYPE_LABEL[account.type]}
                {account.institution ? ` · ${account.institution}` : ''}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <AdjustDialog account={account} onSaved={loadAccount}>
              <PillButton>
                <SlidersVertical className="h-4 w-4" strokeWidth={1.85} />
                Ajustar saldo
              </PillButton>
            </AdjustDialog>
            <AccountDialog account={account} onSaved={loadAccount}>
              <PillButton title="Editar conta">
                <Pencil className="h-4 w-4" strokeWidth={1.85} />
                <span className="sr-only sm:not-sr-only">Editar</span>
              </PillButton>
            </AccountDialog>
          </div>
        </div>

        <div className="mt-5 flex items-baseline font-manrope font-bold leading-none tracking-[-0.02em] text-ink">
          {parts.sign && <span className="mr-1.5 text-[28px]">{parts.sign}</span>}
          <span className="mr-[7px] text-[19px] font-semibold text-ink-2">{parts.currency}</span>
          <span className="text-[40px] tabular-nums">{parts.whole}</span>
          <span className="text-[22px] tabular-nums opacity-60">{parts.fraction}</span>
        </div>
        {evolution.length > 1 && (
          <div
            className="mt-2.5 inline-flex items-center gap-1.5 text-[13px] font-semibold"
            style={{ color: deltaCents < 0 ? 'var(--negative)' : 'var(--positive)' }}
          >
            <DeltaIcon className="h-[15px] w-[15px]" />
            {deltaCents < 0 ? '−' : '+'} {brl(Math.abs(deltaCents))} nos últimos {evolution.length}{' '}
            meses
          </div>
        )}

        <div className="mt-[22px]">
          <div className="mb-2.5 text-xs font-semibold uppercase tracking-[0.04em] text-ink-2">
            Evolução do saldo · {evolution.length} meses
          </div>
          <div className="h-[150px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chart} margin={{ top: 8, right: 6, bottom: 0, left: 6 }}>
                <defs>
                  <linearGradient id="saldoArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11, fill: 'var(--ink-2)' }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <Tooltip
                  cursor={{ stroke: 'var(--line)' }}
                  formatter={(v) => [brl(Number(v) * 100), 'Saldo']}
                  contentStyle={{
                    borderRadius: 12,
                    border: '1px solid var(--line)',
                    background: 'var(--surface)',
                    fontSize: 13,
                  }}
                  labelStyle={{ color: 'var(--ink-2)' }}
                />
                <Area
                  type="linear"
                  dataKey="value"
                  stroke="var(--primary)"
                  strokeWidth={2.5}
                  fill="url(#saldoArea)"
                  dot={{ r: 3.5, fill: 'var(--surface)', stroke: 'var(--primary)', strokeWidth: 2.5 }}
                  activeDot={{ r: 5 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="mb-3 mt-[22px] flex items-center justify-between">
        <h2 className="font-manrope text-base font-bold text-ink">Extrato</h2>
        <span className="text-[13px] text-ink-2">{range.label}</span>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2">
        <ChipSelect
          icon={<CalendarDays className="h-3.5 w-3.5 text-ink-2" strokeWidth={1.75} />}
          value={period}
          onChange={(v) => setPeriod(v as PeriodKey)}
          options={PERIODS.map((p) => ({ value: p.value, label: p.label }))}
        />
        <ChipSelect
          value={type}
          onChange={setType}
          options={[
            { value: '', label: 'Tipo' },
            ...(Object.keys(TYPE_LABEL) as TransactionType[]).map((t) => ({
              value: t,
              label: TYPE_LABEL[t],
            })),
          ]}
        />
        <ChipSelect
          value={categoryId}
          onChange={setCategoryId}
          options={[
            { value: '', label: 'Categoria' },
            ...categories.map((c) => ({ value: c.id, label: c.name })),
          ]}
        />
        <label className="inline-flex h-9 min-w-[150px] shrink-0 items-center gap-[7px] rounded-[11px] border border-line bg-surface px-3.5 text-[13px] text-ink-2 focus-within:border-primary">
          <Search className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar"
            className="w-full bg-transparent text-ink outline-none placeholder:text-ink-2"
          />
        </label>
      </div>

      {groups.length === 0 ? (
        <p className="mt-6 text-center text-sm text-ink-2">
          Nenhum lançamento nesta conta em {range.label}.
        </p>
      ) : (
        <div className="mt-2 flex flex-col gap-[18px]">
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
                  <StatementRow key={tx.id} transaction={tx} accountId={id} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Efeito do lançamento no saldo desta conta — a API devolve os relacionados. */
function deltaFor(tx: Transaction, accountId: string): bigint {
  return accountDeltaCents(
    {
      type: tx.type,
      amountCents: Number(tx.amountCents),
      accountId: tx.account?.id ?? null,
      fromAccountId: tx.fromAccount?.id ?? null,
      toAccountId: tx.toAccount?.id ?? null,
    },
    accountId,
  );
}

function StatementRow({ transaction, accountId }: { transaction: Transaction; accountId: string }) {
  const delta = Number(deltaFor(transaction, accountId));
  const isTransfer = transaction.type === 'TRANSFER';
  const other = delta < 0 ? transaction.toAccount : transaction.fromAccount;
  const subtitle = isTransfer
    ? `Transferência · ${delta < 0 ? 'para' : 'de'} ${other?.name ?? 'outra conta'}`
    : (transaction.category?.name ?? TYPE_LABEL[transaction.type]);

  return (
    <div className="flex items-center gap-3 border-b border-line px-4 py-3.5 last:border-b-0">
      <CategoryBadge
        icon={isTransfer ? 'arrow-left-right' : transaction.category?.icon}
        color={isTransfer ? 'var(--invest)' : transaction.category?.color}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] text-ink">{transaction.description}</div>
        <div className="mt-[3px] text-xs text-ink-2">
          {subtitle}
          {transaction.status === 'FORECAST' ? ' · previsto' : ''}
          {transaction.status === 'PENDING' ? ' · pendente' : ''}
        </div>
      </div>
      <span
        className="shrink-0 whitespace-nowrap font-manrope text-[15px] font-semibold tabular-nums"
        style={{ color: delta > 0 ? 'var(--positive)' : 'var(--ink)' }}
      >
        {delta < 0 ? '− ' : '+ '}
        {brl(Math.abs(delta))}
      </span>
    </div>
  );
}

/** Botão pílula do cabeçalho — o design usa contorno, não o primário. */
function PillButton({
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button
      type="button"
      {...props}
      className="inline-flex h-10 items-center gap-[7px] rounded-full border border-line bg-surface px-[15px] text-[13.5px] font-semibold text-ink transition-colors hover:bg-surface-2"
    >
      {children}
    </button>
  );
}

/** Filtro em forma de chip: um `<select>` nativo com a seta desenhada por fora. */
function ChipSelect({
  icon,
  value,
  onChange,
  options,
}: {
  icon?: ReactNode;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  const active = value !== '' && value !== 'month';
  return (
    <span
      className="relative inline-flex h-9 shrink-0 items-center gap-[7px] rounded-[11px] border bg-surface px-3 text-[13px] font-medium text-ink"
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
      <ChevronDown className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-ink-2" />
    </span>
  );
}
