'use client';

import { formatInSaoPaulo } from '@cifrao/shared';
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  CreditCard as CreditCardIcon,
  Lightbulb,
  PiggyBank,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { type Dashboard, type DashboardCategorySpend, api } from '@/lib/api';
import { brl } from '@/lib/format';
import { cn } from '@/lib/utils';

const MONTHS_LONG = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];
function monthLong(ref: string): string {
  const [y, m] = ref.split('-').map(Number);
  return `${MONTHS_LONG[m - 1]} de ${y}`;
}
function monthRange(ref: string): { from: string; to: string } {
  const [y, m] = ref.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${ref}-01`, to: `${ref}-${String(last).padStart(2, '0')}` };
}

const PALETTE = ['#820AD1', '#00A868', '#F5A524', '#E5484D', '#0F9B8E', '#A855F7', '#6B08AD', '#22C3B0'];

export default function PainelPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<Dashboard>('/dashboard')
      .then(setData)
      .catch((e) => toast.error((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-sm text-ink-2">Carregando…</p>;
  if (!data) return <p className="text-sm text-ink-2">Não foi possível carregar o painel.</p>;

  const b = data.balances;
  const bd = data.availableBreakdown;
  const negative = Number(bd.resultCents) < 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">Visão geral</h1>
        <p className="text-sm capitalize text-ink-2">{monthLong(data.month)}</p>
      </div>

      {/* Hero: disponível de verdade até o fim do mês (regra 5.11) */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="bg-primary text-white lg:col-span-2">
          <p className="text-sm text-white/80">Disponível de verdade até o fim do mês</p>
          <p className="mt-1 font-manrope text-4xl font-extrabold tabular-nums">
            {brl(bd.resultCents)}
          </p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/80">
            <span>Saldo hoje {brl(bd.liquidTodayCents)}</span>
            <span>+ previstos {brl(bd.forecastIncomeCents)}</span>
            <span>− previstos {brl(bd.forecastExpenseCents)}</span>
            <span>− cartão {brl(bd.cardCommittedCents)}</span>
          </div>
          {negative && (
            <p className="mt-2 text-xs font-medium text-white">
              Atenção: o previsto para o mês supera o disponível.
            </p>
          )}
        </Card>
        <div className="grid gap-4">
          <Card className="space-y-1">
            <div className="flex items-center gap-2 text-ink-2">
              <Wallet className="h-4 w-4" />
              <span className="text-xs">Disponível hoje</span>
            </div>
            <p className="font-manrope text-2xl font-bold tabular-nums text-ink">
              {brl(b.availableTodayCents)}
            </p>
          </Card>
          <Card className="space-y-1">
            <div className="flex items-center gap-2 text-ink-2">
              <PiggyBank className="h-4 w-4" />
              <span className="text-xs">Patrimônio</span>
            </div>
            <p className="font-manrope text-2xl font-bold tabular-nums text-ink">
              {brl(b.netWorthCents)}
            </p>
          </Card>
        </div>
      </div>

      {/* Totais do mês */}
      <div className="grid grid-cols-3 gap-3">
        <MiniStat label="Receitas" value={brl(data.monthTotals.incomeCents)} tone="positive" icon={<ArrowUpRight className="h-4 w-4" />} />
        <MiniStat label="Despesas" value={brl(data.monthTotals.expenseCents)} tone="negative" icon={<ArrowDownRight className="h-4 w-4" />} />
        <MiniStat
          label="Saldo do mês"
          value={brl(data.monthTotals.netCents)}
          tone={Number(data.monthTotals.netCents) < 0 ? 'negative' : 'positive'}
        />
      </div>

      {/* O que vem por aí */}
      <Card className="space-y-3">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-primary" />
          <h2 className="font-semibold text-ink">O que vem por aí</h2>
        </div>
        {data.timeline.length === 0 ? (
          <p className="text-sm text-ink-2">Nada previsto no horizonte. Cadastre recorrências na Fase 5.</p>
        ) : (
          <ul className="space-y-2">
            {data.timeline.map((e, i) => (
              <li key={i} className="flex items-center justify-between gap-2 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className={cn(
                      'grid h-7 w-7 shrink-0 place-items-center rounded-full',
                      e.kind === 'invoice-due' ? 'bg-primary-soft text-primary' : e.positive ? 'bg-positive/15 text-positive' : 'bg-negative/15 text-negative',
                    )}
                  >
                    {e.kind === 'invoice-due' ? <CreditCardIcon className="h-3.5 w-3.5" /> : e.positive ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-ink">{e.label}</span>
                    <span className="text-xs text-ink-2">{formatInSaoPaulo(new Date(e.date))}</span>
                  </span>
                </span>
                <span className={cn('shrink-0 tabular-nums', e.positive ? 'text-positive' : 'text-ink')}>
                  {e.positive ? '+' : '−'}
                  {brl(e.amountCents)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <CategoryCard categorySpending={data.categorySpending} month={data.month} />
        <OpenInvoicesCard invoices={data.openInvoices} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <InsightCard insight={data.insight} />
        <BudgetEmptyCard />
      </div>

      {/* Últimos lançamentos */}
      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-ink">Últimos lançamentos</h2>
          <Link href="/painel/lancamentos" className="text-sm font-medium text-primary hover:underline">
            Ver todos
          </Link>
        </div>
        {data.recent.length === 0 ? (
          <p className="text-sm text-ink-2">Nada ainda.</p>
        ) : (
          <ul className="space-y-2">
            {data.recent.map((tx) => {
              const isIncome = tx.type === 'INCOME';
              const isExpense = tx.type === 'EXPENSE';
              return (
                <li key={tx.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">
                    {tx.description}
                    <span className="text-ink-2"> · {formatInSaoPaulo(new Date(tx.date))}</span>
                  </span>
                  <span
                    className={cn(
                      'shrink-0 tabular-nums',
                      isIncome ? 'text-positive' : isExpense ? 'text-negative' : 'text-ink-2',
                    )}
                  >
                    {isIncome ? '+' : isExpense ? '−' : ''}
                    {brl(tx.amountCents)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: string;
  tone: 'positive' | 'negative';
  icon?: ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-1.5 text-ink-2">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className={cn('mt-1 font-manrope text-lg font-bold tabular-nums', tone === 'positive' ? 'text-positive' : 'text-negative')}>
        {value}
      </p>
    </Card>
  );
}

function CategoryCard({ categorySpending, month }: { categorySpending: DashboardCategorySpend[]; month: string }) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const top = categorySpending.slice(0, 8);
  const total = top.reduce((acc, c) => acc + Number(c.cents), 0);
  const chartData = top.map((c, i) => ({
    name: c.name,
    value: Number(c.cents) / 100,
    color: c.color ?? PALETTE[i % PALETTE.length],
    categoryId: c.categoryId,
  }));

  function goToCategory(categoryId: string | null) {
    const { from, to } = monthRange(month);
    const q = new URLSearchParams({ type: 'EXPENSE', from, to });
    if (categoryId) q.set('categoryId', categoryId);
    router.push(`/painel/lancamentos?${q.toString()}`);
  }

  return (
    <Card className="space-y-3">
      <h2 className="font-semibold text-ink">Gastos por categoria</h2>
      {top.length === 0 ? (
        <p className="text-sm text-ink-2">Sem despesas neste mês.</p>
      ) : (
        <div className="flex flex-col items-center gap-4 sm:flex-row">
          <div className="h-40 w-40 shrink-0">
            {mounted && (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={44}
                    outerRadius={72}
                    paddingAngle={2}
                    stroke="none"
                    onClick={(_, i) => goToCategory(chartData[i].categoryId)}
                    className="cursor-pointer"
                  >
                    {chartData.map((d) => (
                      <Cell key={d.name} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v) => brl(Number(v) * 100)}
                    contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, fontSize: 13 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
          <ul className="w-full space-y-1.5">
            {top.map((c, i) => (
              <li key={c.categoryId ?? 'null'}>
                <button
                  type="button"
                  onClick={() => goToCategory(c.categoryId)}
                  className="flex w-full items-center gap-2 rounded-[8px] px-1 py-0.5 text-left text-sm hover:bg-surface-2"
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.color ?? PALETTE[i % PALETTE.length] }} />
                  <span className="min-w-0 flex-1 truncate text-ink">{c.name}</span>
                  <span className="tabular-nums text-ink-2">{brl(c.cents)}</span>
                  <span className="w-10 text-right text-xs text-ink-2">
                    {total > 0 ? Math.round((Number(c.cents) / total) * 100) : 0}%
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function OpenInvoicesCard({ invoices }: { invoices: Dashboard['openInvoices'] }) {
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2">
        <CreditCardIcon className="h-4 w-4 text-primary" />
        <h2 className="font-semibold text-ink">Faturas abertas</h2>
      </div>
      {invoices.length === 0 ? (
        <p className="text-sm text-ink-2">Nenhuma fatura em aberto.</p>
      ) : (
        <ul className="space-y-2">
          {invoices.map((inv) => (
            <li key={inv.id}>
              <Link
                href={`/painel/cartoes/${inv.creditCardId}`}
                className="flex items-center gap-2 rounded-[8px] px-1 py-1 text-sm hover:bg-surface-2"
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: inv.cardColor ?? 'var(--primary)' }} />
                <span className="min-w-0 flex-1 truncate text-ink">
                  {inv.cardNickname}
                  <span className="text-ink-2"> · vence {formatInSaoPaulo(new Date(inv.dueDate))}</span>
                </span>
                <span className="shrink-0 tabular-nums font-semibold text-ink">{brl(inv.remainingCents)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function InsightCard({ insight }: { insight: Dashboard['insight'] }) {
  return (
    <Card className="space-y-2">
      <div className="flex items-center gap-2">
        <Lightbulb className="h-4 w-4 text-warn" />
        <h2 className="font-semibold text-ink">Insight do mês</h2>
      </div>
      {!insight ? (
        <p className="text-sm text-ink-2">Nenhuma categoria acima da média dos últimos 3 meses. 👏</p>
      ) : (
        <p className="text-sm text-ink">
          Você gastou <strong className="text-negative">{brl(insight.deltaCents)}</strong> a mais em{' '}
          <strong>{insight.name}</strong> do que a média dos últimos 3 meses ({brl(insight.avgCents)}).
          Neste mês já são {brl(insight.currentCents)}.
        </p>
      )}
    </Card>
  );
}

function BudgetEmptyCard() {
  return (
    <Card className="space-y-2">
      <h2 className="font-semibold text-ink">Orçamento do mês</h2>
      <p className="text-sm text-ink-2">
        Ainda sem limites definidos. O orçamento por categoria (com média diária permitida e sugestão
        de limites) chega na Fase 5.
      </p>
    </Card>
  );
}
