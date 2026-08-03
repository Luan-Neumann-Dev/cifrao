'use client';

import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  CreditCard as CreditCardIcon,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { type CalendarDay, type CalendarMonth, api } from '@/lib/api';
import { brl } from '@/lib/format';
import { addMonthKey, dayLabel, monthLong, thisMonthKey } from '@/lib/month';
import { cn } from '@/lib/utils';

export default function CalendarioPage() {
  const [month, setMonth] = useState(thisMonthKey);
  const [data, setData] = useState<CalendarMonth | null>(null);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api<CalendarMonth>(`/calendar?month=${month}`));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

  const chartData = (data?.days ?? []).map((d) => ({
    dia: dayLabel(d.date),
    saldo: Number(d.projectedBalanceCents) / 100,
    isPast: d.isPast,
  }));
  const negativeAhead = (data?.days ?? []).some(
    (d) => !d.isPast && Number(d.projectedBalanceCents) < 0,
  );
  const diasComEventos = (data?.days ?? []).filter((d) => d.events.length > 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">Calendário de contas</h1>
          <p className="text-sm text-ink-2">Saldo projetado dia a dia, com o que ainda vai cair.</p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => setMonth(addMonthKey(month, -1))} title="Mês anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="w-40 text-center text-sm font-medium capitalize text-ink">{monthLong(month)}</span>
          <Button variant="ghost" size="icon" onClick={() => setMonth(addMonthKey(month, 1))} title="Próximo mês">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-ink-2">Carregando…</p>
      ) : !data ? (
        <p className="text-sm text-ink-2">Não foi possível carregar o calendário.</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Card className="p-4">
              <p className="text-xs text-ink-2">Saldo hoje</p>
              <p className="mt-1 font-manrope text-xl font-bold tabular-nums text-ink">
                {brl(data.balanceTodayCents)}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-ink-2">Projeção no fim do mês</p>
              <p
                className={cn(
                  'mt-1 font-manrope text-xl font-bold tabular-nums',
                  Number(data.endOfMonthBalanceCents) < 0 ? 'text-negative' : 'text-ink',
                )}
              >
                {brl(data.endOfMonthBalanceCents)}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-ink-2">Ponto mais baixo</p>
              {data.lowestPoint ? (
                <p
                  className={cn(
                    'mt-1 font-manrope text-xl font-bold tabular-nums',
                    Number(data.lowestPoint.projectedBalanceCents) < 0 ? 'text-negative' : 'text-ink',
                  )}
                >
                  {brl(data.lowestPoint.projectedBalanceCents)}
                  <span className="ml-1 text-xs font-medium text-ink-2">
                    em {dayLabel(data.lowestPoint.date)}
                  </span>
                </p>
              ) : (
                <p className="mt-1 text-sm text-ink-2">—</p>
              )}
            </Card>
          </div>

          {negativeAhead && (
            <Card className="flex items-start gap-2 border-negative/30 bg-negative/10 py-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-negative" />
              <p className="text-sm text-ink">
                O saldo projetado fica negativo em algum dia deste mês. Antecipe uma entrada ou
                adie um pagamento.
              </p>
            </Card>
          )}

          <Card className="space-y-2">
            <h2 className="font-semibold text-ink">Saldo projetado</h2>
            <div className="h-56 w-full">
              {mounted && (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="saldoGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--line)" vertical={false} />
                    <XAxis
                      dataKey="dia"
                      tick={{ fontSize: 11, fill: 'var(--ink-2)' }}
                      interval={Math.max(1, Math.floor(chartData.length / 8))}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: 'var(--ink-2)' }}
                      tickFormatter={(v: number) => `${Math.round(v / 1000)}k`}
                      tickLine={false}
                      axisLine={false}
                      width={40}
                    />
                    <ReferenceLine y={0} stroke="var(--negative)" strokeDasharray="3 3" />
                    <Tooltip
                      formatter={(v) => brl(Number(v) * 100)}
                      labelFormatter={(l) => `Dia ${l}`}
                      contentStyle={{
                        background: 'var(--surface)',
                        border: '1px solid var(--line)',
                        borderRadius: 12,
                        fontSize: 13,
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="saldo"
                      stroke="var(--primary)"
                      strokeWidth={2}
                      fill="url(#saldoGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>

          <Card className="space-y-3">
            <h2 className="font-semibold text-ink">Dias com movimento previsto</h2>
            {diasComEventos.length === 0 ? (
              <p className="text-sm text-ink-2">
                Nenhum vencimento ou previsto neste mês. Cadastre recorrências para preencher o
                calendário.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {diasComEventos.map((day) => (
                  <DayRow key={day.date} day={day} />
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function DayRow({ day }: { day: CalendarDay }) {
  const negative = Number(day.projectedBalanceCents) < 0;
  return (
    <li className="py-2.5 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            'text-sm font-semibold',
            day.isToday ? 'text-primary' : day.isPast ? 'text-ink-2' : 'text-ink',
          )}
        >
          {dayLabel(day.date)}
          {day.isToday && <span className="ml-1 text-xs font-medium">· hoje</span>}
        </span>
        <span
          className={cn(
            'text-xs tabular-nums',
            negative ? 'font-semibold text-negative' : 'text-ink-2',
          )}
        >
          saldo {brl(day.projectedBalanceCents)}
        </span>
      </div>
      <ul className="mt-1 space-y-1">
        {day.events.map((e) => {
          const entra = Number(e.deltaCents) > 0;
          return (
            <li key={`${e.kind}-${e.id}`} className="flex items-center gap-2 text-sm">
              <span
                className={cn(
                  'grid h-6 w-6 shrink-0 place-items-center rounded-full',
                  e.kind === 'invoice-due'
                    ? 'bg-primary-soft text-primary'
                    : entra
                      ? 'bg-positive/15 text-positive'
                      : 'bg-negative/15 text-negative',
                )}
              >
                {e.kind === 'invoice-due' ? (
                  <CreditCardIcon className="h-3 w-3" />
                ) : entra ? (
                  <ArrowUpRight className="h-3 w-3" />
                ) : (
                  <ArrowDownRight className="h-3 w-3" />
                )}
              </span>
              <span className="min-w-0 flex-1 truncate text-ink">
                {e.label}
                {e.kind === 'pending' && <span className="text-ink-2"> · pendente</span>}
                {e.categoryName ? <span className="text-ink-2"> · {e.categoryName}</span> : null}
              </span>
              <span className={cn('shrink-0 tabular-nums', entra ? 'text-positive' : 'text-ink')}>
                {entra ? '+' : '−'}
                {brl(e.amountCents)}
              </span>
            </li>
          );
        })}
      </ul>
    </li>
  );
}
