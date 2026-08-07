'use client';

import { formatInSaoPaulo } from '@cifrao/shared';
import {
  ChevronLeft,
  ChevronRight,
  CircleCheckBig,
  Eye,
  EyeOff,
  Lightbulb,
  Plus,
  TrendingUp,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CategoryBadge } from '@/components/category-icon';
import { type Dashboard, type DashboardCategorySpend, api } from '@/lib/api';
import { monthShortLabel } from '@/lib/dates';
import { brl, brlShort, splitBrl } from '@/lib/format';
import { maskMoney, usePrivacy } from '@/lib/privacy';
import { monthLong } from '@/lib/month';
import { amountDisplay, sourceLabel } from '@/lib/transactions';
import { cn } from '@/lib/utils';
import { MonthRuler } from './month-ruler';
import { ReviewNudge } from './review-nudge';

const PALETTE = ['#820AD1', '#00A868', '#F5A524', '#E5484D', '#0F9B8E', '#A855F7', '#6B08AD', '#22C3B0'];

/** Mês vizinho de "yyyy-MM". */
function shiftMonth(monthKey: string, delta: number): string {
  const [year, month] = monthKey.split('-').map(Number);
  const total = (year * 12 + (month - 1)) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

export default function PainelPage() {
  const [month, setMonth] = useState<string | null>(null);
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const { hidden, toggle } = usePrivacy();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = month ? `?month=${month}` : '';
      const next = await api<Dashboard>(`/dashboard${query}`);
      setData(next);
      setMonth(next.month);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [month]);

  // Depende de `month` (e não de `load`) de propósito: `load` guarda o mês que
  // o servidor devolveu, e reagir a ela pediria a mesma coisa duas vezes.
  useEffect(() => {
    void load();
  }, [month]);

  const money = (cents: string | number) => maskMoney(hidden, brl(cents));
  const moneyShort = (cents: string | number) => maskMoney(hidden, brlShort(cents));

  if (loading && !data) return <p className="text-sm text-ink-2">Carregando…</p>;
  if (!data) return <p className="text-sm text-ink-2">Não foi possível carregar o painel.</p>;

  const bd = data.availableBreakdown;
  const today = splitBrl(data.balances.availableTodayCents);
  const negative = Number(bd.resultCents) < 0;
  const spendTotal = data.categorySpending.reduce((sum, c) => sum + Number(c.cents), 0);
  const trend = data.monthlyTrend ?? [];
  const previous = trend.length > 1 ? trend[trend.length - 2] : null;

  return (
    <div className="space-y-4 pb-20">
      <header className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm text-ink-2">{greeting()}</div>
          <div className="mt-1 flex items-center gap-2">
            <StepButton label="Mês anterior" onClick={() => setMonth(shiftMonth(data.month, -1))}>
              <ChevronLeft className="h-4 w-4" />
            </StepButton>
            <span className="min-w-[118px] text-center font-manrope text-lg font-bold capitalize text-ink">
              {monthLong(data.month)}
            </span>
            <StepButton label="Próximo mês" onClick={() => setMonth(shiftMonth(data.month, 1))}>
              <ChevronRight className="h-4 w-4" />
            </StepButton>
          </div>
        </div>
        <button
          type="button"
          onClick={toggle}
          title={hidden ? 'Mostrar valores' : 'Esconder valores'}
          aria-pressed={hidden}
          className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[13px] border border-line bg-surface text-ink transition-colors hover:bg-surface-2"
        >
          {hidden ? (
            <EyeOff className="h-[19px] w-[19px]" strokeWidth={1.75} />
          ) : (
            <Eye className="h-[19px] w-[19px]" strokeWidth={1.75} />
          )}
          <span className="sr-only">{hidden ? 'Mostrar valores' : 'Esconder valores'}</span>
        </button>
      </header>

      <ReviewNudge />

      {/* Saldo de hoje, e dentro dele a resposta que importa (regra 5.11). */}
      <section className="rounded-[20px] border border-[var(--card-border)] bg-surface px-7 py-[26px] shadow-[var(--card-shadow)]">
        <div className="text-sm text-ink-2">Saldo disponível hoje</div>
        <div className="mt-1.5 flex items-baseline font-manrope font-bold leading-none tracking-[-0.02em] text-ink">
          <span className="mr-2 text-xl font-semibold text-ink-2">{today.currency}</span>
          <span className="text-[40px] tabular-nums">{hidden ? '••••' : today.whole}</span>
          {!hidden && <span className="text-[22px] tabular-nums opacity-60">{today.fraction}</span>}
        </div>

        <div className="mt-[18px] flex items-center gap-3.5 rounded-[16px] bg-primary-soft px-[18px] py-[15px]">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-primary text-white">
            <TrendingUp className="h-5 w-5" strokeWidth={1.9} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[12.5px] font-semibold text-primary">
              Disponível de verdade até o fim do mês
            </div>
            <div className="mt-0.5 flex flex-wrap items-baseline gap-2.5">
              <span
                className="font-manrope text-[26px] font-bold tabular-nums"
                style={{ color: negative ? 'var(--negative)' : 'var(--ink)' }}
              >
                {money(bd.resultCents)}
              </span>
              <span className="text-[12.5px] text-ink-2">
                {money(Number(bd.forecastExpenseCents) + Number(bd.cardCommittedCents))} já
                comprometidos
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* O mês inteiro numa régua: o que passou embaixo, o que vem em cima. */}
      <section className="overflow-hidden rounded-[20px] border border-[var(--card-border)] bg-surface pb-3.5 pt-[22px] shadow-[var(--card-shadow)]">
        <div className="mb-1 flex items-baseline justify-between gap-3 px-[18px]">
          <span className="font-manrope text-base font-bold text-ink">O que vem por aí</span>
          {data.openInvoices[0] && (
            <span className="whitespace-nowrap text-[13px] text-ink-2">
              Fatura vence{' '}
              <span className="font-semibold text-warn">
                {formatInSaoPaulo(new Date(data.openInvoices[0].dueDate), 'dd/MM')}
              </span>
            </span>
          )}
        </div>
        <MonthRuler month={data.month} events={data.timeline} />
      </section>

      <div className="grid grid-cols-3 gap-3">
        <StatCard
          label="Entradas"
          value={moneyShort(data.monthTotals.incomeCents)}
          current={Number(data.monthTotals.incomeCents)}
          previous={previous ? Number(previous.incomeCents) : null}
          series={trend.map((t) => Number(t.incomeCents))}
          upIsGood
        />
        <StatCard
          label="Saídas"
          value={moneyShort(data.monthTotals.expenseCents)}
          current={Number(data.monthTotals.expenseCents)}
          previous={previous ? Number(previous.expenseCents) : null}
          series={trend.map((t) => Number(t.expenseCents))}
        />
        <StatCard
          label="Sobrou"
          value={moneyShort(data.monthTotals.netCents)}
          current={Number(data.monthTotals.netCents)}
          previous={previous ? Number(previous.netCents) : null}
          series={trend.map((t) => Number(t.netCents))}
          upIsGood
        />
      </div>

      {data.pendingCount > 0 && (
        <Link
          href="/painel/lancamentos?status=PENDING"
          className="flex items-center gap-3.5 rounded-[18px] bg-primary px-[18px] py-4 text-white transition-transform hover:-translate-y-px"
        >
          <span className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[12px] bg-white/20">
            <CircleCheckBig className="h-[21px] w-[21px]" strokeWidth={1.85} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-manrope text-[15px] font-bold">
              {data.pendingCount}{' '}
              {data.pendingCount === 1 ? 'lançamento aguardando' : 'lançamentos aguardando'} revisão
            </div>
            <div className="mt-px text-[13px] text-white/80">Confira e marque como efetivado.</div>
          </div>
          <span className="hidden h-10 shrink-0 items-center rounded-full bg-white px-[18px] text-sm font-semibold text-primary sm:inline-flex">
            Revisar
          </span>
        </Link>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="flex min-w-0 flex-col gap-4">
          {data.openInvoices.length > 0 && (
            <section className="min-w-0">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-manrope text-base font-bold text-ink">Faturas abertas</h2>
                <Link href="/painel/cartoes" className="text-[13px] font-semibold text-primary">
                  Ver cartões
                </Link>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-1.5">
                {data.openInvoices.map((inv) => {
                  const color = inv.cardColor ?? 'var(--primary)';
                  const pct =
                    Number(inv.totalCents) > 0
                      ? Math.min(100, (Number(inv.paidCents) / Number(inv.totalCents)) * 100)
                      : 0;
                  return (
                    <Link
                      key={inv.id}
                      href={`/painel/cartoes/${inv.creditCardId}`}
                      className="relative w-[262px] shrink-0 overflow-hidden rounded-[20px] border border-[var(--card-border)] bg-surface p-[18px] shadow-[var(--card-shadow)]"
                    >
                      <span
                        className="absolute inset-x-0 top-0 h-[5px]"
                        style={{ background: color }}
                      />
                      <div className="mt-1 flex items-center gap-2.5">
                        <span
                          className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] font-manrope text-[15px] font-bold text-white"
                          style={{ background: color }}
                        >
                          {inv.cardNickname[0]?.toUpperCase()}
                        </span>
                        <span className="truncate font-manrope text-[15px] font-bold text-ink">
                          {inv.cardNickname}
                        </span>
                      </div>
                      <div className="mt-3.5 font-manrope text-2xl font-bold tabular-nums text-ink">
                        {money(inv.remainingCents)}
                      </div>
                      <div className="mt-0.5 text-xs text-ink-2">
                        {Number(inv.paidCents) > 0 ? 'ainda em aberto' : 'fatura atual'}
                      </div>
                      <div className="mt-3.5 h-[7px] overflow-hidden rounded-full bg-[var(--track)]">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                      </div>
                      <div className="mt-2 flex items-center justify-between text-xs text-ink-2">
                        <span>de {money(inv.totalCents)}</span>
                        <span className="font-semibold text-warn">
                          vence {formatInSaoPaulo(new Date(inv.dueDate), 'dd/MM')}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          <section className="rounded-[20px] border border-[var(--card-border)] bg-surface px-6 py-[22px] shadow-[var(--card-shadow)]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="font-manrope text-base font-bold text-ink">Gastos por categoria</h2>
              {activeCategory && (
                <button
                  type="button"
                  onClick={() => setActiveCategory(null)}
                  className="inline-flex h-7 items-center gap-1.5 rounded-full bg-primary-soft px-2.5 text-xs font-semibold text-primary"
                >
                  Destacando{' '}
                  {data.categorySpending.find((c) => c.categoryId === activeCategory)?.name} ✕
                </button>
              )}
            </div>
            {data.categorySpending.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-2">Nenhum gasto neste mês.</p>
            ) : (
              <div className="flex flex-wrap items-center gap-6">
                <Donut
                  data={data.categorySpending}
                  total={spendTotal}
                  active={activeCategory}
                  onPick={setActiveCategory}
                  centerLabel={`gasto em ${monthShortLabel(data.month).split('/')[0]}`}
                  centerValue={moneyShort(spendTotal)}
                />
                <div className="flex min-w-[190px] flex-1 flex-col gap-0.5">
                  {data.categorySpending.slice(0, 6).map((c, i) => {
                    const on = activeCategory === c.categoryId;
                    const pct = spendTotal > 0 ? Math.round((Number(c.cents) / spendTotal) * 100) : 0;
                    return (
                      <button
                        key={c.categoryId ?? 'sem'}
                        type="button"
                        onClick={() => setActiveCategory(on ? null : c.categoryId)}
                        className={cn(
                          'flex w-full items-center gap-2.5 rounded-[10px] px-2 py-1.5 text-left transition-colors',
                          on ? 'bg-surface-2' : 'hover:bg-surface-2',
                        )}
                      >
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                          style={{ background: c.color ?? PALETTE[i % PALETTE.length] }}
                        />
                        <span
                          className={cn(
                            'min-w-0 flex-1 truncate text-[13.5px] text-ink',
                            on && 'font-semibold',
                          )}
                        >
                          {c.name}
                        </span>
                        <span className="shrink-0 font-manrope text-[13px] tabular-nums text-ink-2">
                          {pct}%
                        </span>
                        <span className="min-w-[74px] shrink-0 text-right font-manrope text-[13px] font-semibold tabular-nums text-ink">
                          {moneyShort(c.cents)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          {data.budgetSummary.items.length > 0 && (
            <section className="rounded-[20px] border border-[var(--card-border)] bg-surface px-6 py-[22px] shadow-[var(--card-shadow)]">
              <div className="mb-[18px] flex items-center justify-between">
                <h2 className="font-manrope text-base font-bold text-ink">Orçamento</h2>
                <Link href="/painel/orcamento" className="text-[13px] text-ink-2 hover:text-ink">
                  {data.budgetSummary.count} categorias
                </Link>
              </div>
              <div className="flex flex-col gap-4">
                {data.budgetSummary.items.slice(0, 5).map((b) => {
                  const color = b.over ? 'var(--negative)' : (b.category.color ?? 'var(--primary)');
                  return (
                    <div key={b.id}>
                      <div className="mb-[7px] flex items-center justify-between gap-3">
                        <span className="inline-flex min-w-0 items-center gap-2 text-sm text-ink">
                          <span
                            className="h-[9px] w-[9px] shrink-0 rounded-full"
                            style={{ background: color }}
                          />
                          <span className="truncate">{b.category.name}</span>
                        </span>
                        <span className="shrink-0 whitespace-nowrap font-manrope text-[13px] tabular-nums text-ink-2">
                          <span className="font-semibold" style={{ color }}>
                            {moneyShort(b.spentCents)}
                          </span>{' '}
                          / {moneyShort(b.limitCents)}
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-[var(--track)]">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${Math.min(100, b.percentUsed)}%`, background: color }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <section className="rounded-[20px] border border-[var(--card-border)] bg-surface px-6 py-[22px] shadow-[var(--card-shadow)]">
            <div className="mb-1.5 flex items-center justify-between">
              <h2 className="font-manrope text-base font-bold text-ink">Últimos lançamentos</h2>
              <Link href="/painel/lancamentos" className="text-[13px] font-semibold text-primary">
                Ver todos
              </Link>
            </div>
            {data.recent.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-2">Nada lançado ainda.</p>
            ) : (
              data.recent.map((t) => {
                const amount = amountDisplay(t);
                return (
                  <div
                    key={t.id}
                    className="flex items-center gap-3 border-b border-line py-3 last:border-b-0"
                  >
                    <CategoryBadge
                      icon={t.type === 'TRANSFER' ? 'arrow-left-right' : t.category?.icon}
                      color={t.type === 'TRANSFER' ? 'var(--ink-2)' : t.category?.color}
                      className="!h-9 !w-9"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14.5px] text-ink">{t.description}</div>
                      <div className="truncate text-xs text-ink-2">
                        {t.category?.name ?? sourceLabel(t)} ·{' '}
                        {formatInSaoPaulo(new Date(t.date), 'dd/MM')}
                      </div>
                    </div>
                    <span
                      className="shrink-0 whitespace-nowrap font-manrope text-[14.5px] font-semibold tabular-nums"
                      style={{ color: amount.color }}
                    >
                      {amount.text} {money(t.amountCents)}
                    </span>
                  </div>
                );
              })
            )}
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <section className="rounded-[20px] border border-[var(--card-border)] bg-surface px-6 py-[22px] shadow-[var(--card-shadow)]">
            <div className="mb-3.5 flex items-center justify-between">
              <h2 className="font-manrope text-base font-bold text-ink">Patrimônio</h2>
              <Link href="/painel/investimentos" className="text-[13px] text-ink-2 hover:text-ink">
                detalhes
              </Link>
            </div>
            <div className="font-manrope text-[30px] font-bold tabular-nums text-ink">
              {money(data.balances.netWorthCents)}
            </div>
            <div className="mt-0.5 text-[12.5px] text-ink-2">total · contas + investimentos</div>
            <div className="mt-[18px] flex flex-col gap-2.5">
              <PatrimonioRow
                color="var(--primary)"
                label="Saldo em contas"
                value={money(
                  data.balances.accounts.reduce((sum, a) => sum + Number(a.balanceCents), 0),
                )}
              />
              <PatrimonioRow
                color="var(--invest)"
                label="Investimentos"
                value={money(data.balances.portfolioValueCents ?? 0)}
                valueColor="var(--invest)"
              />
            </div>
          </section>

          {data.insight && (
            <section className="rounded-[20px] border border-[var(--card-border)] bg-primary-soft px-6 py-[22px]">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.05em] text-primary">
                <Lightbulb className="h-4 w-4" strokeWidth={1.85} />
                Insight do mês
              </div>
              <p className="mt-3.5 text-[17px] leading-relaxed text-ink">
                Você gastou{' '}
                <b className="font-manrope font-bold">{money(data.insight.currentCents)}</b> em{' '}
                {data.insight.name} —{' '}
                <b className="font-manrope font-bold text-warn">
                  {Math.abs(
                    Math.round(
                      (Number(data.insight.deltaCents) / Math.max(1, Number(data.insight.avgCents))) *
                        100,
                    ),
                  )}
                  % {Number(data.insight.deltaCents) >= 0 ? 'acima' : 'abaixo'}
                </b>{' '}
                da sua média de {money(data.insight.avgCents)}.
              </p>
              <Link
                href={`/painel/lancamentos?categoryId=${data.insight.categoryId}`}
                className="mt-[18px] inline-flex h-10 items-center rounded-full bg-primary px-[18px] text-[13.5px] font-semibold text-white transition-colors hover:bg-primary-hover"
              >
                Ver {data.insight.name}
              </Link>
            </section>
          )}
        </div>
      </div>

      <Link
        href="/painel/lancamentos"
        title="Novo lançamento"
        className="fixed bottom-7 right-7 z-40 flex items-center justify-center rounded-full bg-primary text-white shadow-[var(--fab-shadow)] transition-transform hover:-translate-y-0.5 active:scale-95 lg:hidden"
        style={{ height: 60, width: 60 }}
      >
        <Plus className="h-[26px] w-[26px]" />
        <span className="sr-only">Novo lançamento</span>
      </Link>
    </div>
  );
}

function StepButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] border border-line bg-surface text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
    >
      {children}
    </button>
  );
}

function PatrimonioRow({
  color,
  label,
  value,
  valueColor,
}: {
  color: string;
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="inline-flex min-w-0 items-center gap-2 text-[13.5px] text-ink">
        <span className="h-[9px] w-[9px] shrink-0 rounded-full" style={{ background: color }} />
        <span className="truncate">{label}</span>
      </span>
      <span
        className="shrink-0 font-manrope text-sm font-semibold tabular-nums"
        style={{ color: valueColor ?? 'var(--ink)' }}
      >
        {value}
      </span>
    </div>
  );
}

/** Cartão de estatística com variação contra o mês anterior e faísca. */
function StatCard({
  label,
  value,
  current,
  previous,
  series,
  upIsGood,
}: {
  label: string;
  value: string;
  current: number;
  previous: number | null;
  series: number[];
  upIsGood?: boolean;
}) {
  const delta =
    previous !== null && previous !== 0 ? Math.round(((current - previous) / Math.abs(previous)) * 100) : null;
  const up = (delta ?? 0) >= 0;
  // "Melhor" depende do que se mede: subir entrada é bom, subir saída não.
  const good = upIsGood ? up : !up;
  const color = delta === null ? 'var(--ink-2)' : good ? 'var(--positive)' : 'var(--negative)';

  return (
    <div className="min-w-0 rounded-[20px] border border-[var(--card-border)] bg-surface px-4 pb-3.5 pt-4 shadow-[var(--card-shadow)]">
      <div className="truncate text-[12.5px] text-ink-2">{label}</div>
      <div className="mt-1.5 truncate font-manrope text-[19px] font-bold tabular-nums text-ink">
        {value}
      </div>
      <div className="mt-2 flex flex-col gap-2">
        <span className="whitespace-nowrap text-xs font-semibold" style={{ color }}>
          {delta === null ? 'sem base' : `${up ? '+' : ''}${delta}% vs. mês passado`}
        </span>
        <Sparkline values={series} color={color} />
      </div>
    </div>
  );
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return <div className="h-5" />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * 72;
      const y = 22 - ((v - min) / span) * 20;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg width="100%" height="20" viewBox="0 0 72 24" preserveAspectRatio="none" className="block w-full">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** Rosca desenhada à mão: seis fatias não justificam o peso de um gráfico. */
function Donut({
  data,
  total,
  active,
  onPick,
  centerLabel,
  centerValue,
}: {
  data: DashboardCategorySpend[];
  total: number;
  active: string | null;
  onPick: (id: string | null) => void;
  centerLabel: string;
  centerValue: string;
}) {
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="relative h-[168px] w-[168px] shrink-0">
      <svg width="168" height="168" viewBox="0 0 168 168" className="-rotate-90">
        {data.slice(0, 6).map((c, i) => {
          const share = total > 0 ? Number(c.cents) / total : 0;
          const dash = share * circumference;
          const on = active === c.categoryId;
          const circle = (
            <circle
              key={c.categoryId ?? `sem-${i}`}
              cx="84"
              cy="84"
              r={radius}
              fill="none"
              stroke={c.color ?? PALETTE[i % PALETTE.length]}
              strokeWidth={on ? 26 : 20}
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
              opacity={active && !on ? 0.35 : 1}
              className="cursor-pointer transition-all"
              onClick={() => onPick(on ? null : c.categoryId)}
            />
          );
          offset += dash;
          return circle;
        })}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="whitespace-nowrap text-[11px] text-ink-2">{centerLabel}</span>
        <span className="mt-0.5 font-manrope text-[22px] font-bold tabular-nums text-ink">
          {centerValue}
        </span>
      </div>
    </div>
  );
}
