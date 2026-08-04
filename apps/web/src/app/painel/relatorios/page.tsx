'use client';

import { formatInSaoPaulo } from '@cifrao/shared';
import { ArrowDownRight, ArrowUpRight, Download, Printer, TrendingDown, TrendingUp } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { type Account, type Report, type ReportCategoryRow, api } from '@/lib/api';
import { brl } from '@/lib/format';
import { addMonthKey, monthRange, thisMonthKey } from '@/lib/month';
import { cn } from '@/lib/utils';

type Preset = 'mes' | 'mes-passado' | '3-meses' | 'ano' | 'livre';

function presetRange(preset: Preset): { from: string; to: string } {
  const mes = thisMonthKey();
  if (preset === 'mes') return monthRange(mes);
  if (preset === 'mes-passado') return monthRange(addMonthKey(mes, -1));
  if (preset === '3-meses') {
    return { from: monthRange(addMonthKey(mes, -2)).from, to: monthRange(mes).to };
  }
  const [ano] = mes.split('-');
  return { from: `${ano}-01-01`, to: `${ano}-12-31` };
}

export default function RelatoriosPage() {
  const router = useRouter();
  const [preset, setPreset] = useState<Preset>('mes');
  const [range, setRange] = useState(() => presetRange('mes'));
  const [accountId, setAccountId] = useState('');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    api<Account[]>('/accounts')
      .then(setAccounts)
      .catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ from: range.from, to: range.to });
      if (accountId) query.set('accountId', accountId);
      setReport(await api<Report>(`/reports?${query.toString()}`));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [range, accountId]);

  useEffect(() => {
    void load();
  }, [load]);

  function trocarPreset(value: Preset) {
    setPreset(value);
    if (value !== 'livre') setRange(presetRange(value));
  }

  function exportarCsv(section: string) {
    const query = new URLSearchParams({ from: range.from, to: range.to, section });
    if (accountId) query.set('accountId', accountId);
    // Deixa o navegador baixar: o cookie httpOnly vai junto.
    window.location.href = `/api/reports/export?${query.toString()}`;
  }

  function drillDown(row: ReportCategoryRow) {
    const query = new URLSearchParams({ type: 'EXPENSE', from: range.from, to: range.to });
    if (row.categoryId) query.set('categoryId', row.categoryId);
    if (accountId) query.set('accountId', accountId);
    router.push(`/painel/lancamentos?${query.toString()}`);
  }

  const serie = (report?.series ?? []).map((p) => ({
    nome: p.bucket.length === 7 ? p.bucket : p.bucket.slice(8),
    entradas: Number(p.incomeCents) / 100,
    saidas: Number(p.expenseCents) / 100,
    acumulado: Number(p.cumulativeCents) / 100,
  }));

  const patrimonio = (report?.netWorth ?? []).map((p) => ({
    nome: p.month,
    patrimonio: Number(p.netWorthCents) / 100,
    contas: Number(p.accountsCents) / 100,
    cartao: Number(p.cardDebtCents) / 100,
  }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">Relatórios</h1>
          <p className="text-sm text-ink-2">
            Transferência, ajuste e reembolso já saem da conta — os números batem com os
            lançamentos.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => exportarCsv('categorias')}>
            <Download className="h-4 w-4" /> CSV
          </Button>
          <Button variant="ghost" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> PDF
          </Button>
        </div>
      </div>

      <Card className="space-y-3 print:hidden">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <Label htmlFor="rel-preset">Período</Label>
            <Select
              id="rel-preset"
              value={preset}
              onChange={(e) => trocarPreset(e.target.value as Preset)}
            >
              <option value="mes">Este mês</option>
              <option value="mes-passado">Mês passado</option>
              <option value="3-meses">Últimos 3 meses</option>
              <option value="ano">Este ano</option>
              <option value="livre">Período livre</option>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="rel-from">De</Label>
            <Input
              id="rel-from"
              type="date"
              value={range.from}
              onChange={(e) => {
                setPreset('livre');
                setRange({ ...range, from: e.target.value });
              }}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="rel-to">Até</Label>
            <Input
              id="rel-to"
              type="date"
              value={range.to}
              onChange={(e) => {
                setPreset('livre');
                setRange({ ...range, to: e.target.value });
              }}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="rel-account">Conta</Label>
            <Select id="rel-account" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Todas</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </Card>

      {loading ? (
        <p className="text-sm text-ink-2">Carregando…</p>
      ) : !report ? (
        <p className="text-sm text-ink-2">Não foi possível carregar o relatório.</p>
      ) : (
        <>
          <div className="hidden print:block">
            <h1 className="font-manrope text-xl font-extrabold text-ink">Cifrão · Relatório</h1>
            <p className="text-sm text-ink-2">
              {formatInSaoPaulo(new Date(report.period.from))} a{' '}
              {formatInSaoPaulo(new Date(report.period.to))}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <TotalCard
              label="Entradas"
              cents={report.totals.incomeCents}
              variation={report.totals.income}
              tone="positive"
            />
            <TotalCard
              label="Saídas"
              cents={report.totals.expenseCents}
              variation={report.totals.expense}
              tone="negative"
              invertTone
            />
            <TotalCard
              label="Sobrou"
              cents={report.totals.netCents}
              variation={report.totals.net}
              tone={Number(report.totals.netCents) < 0 ? 'negative' : 'positive'}
              footer={`${report.totals.savingsRate.toFixed(0)}% do que entrou`}
            />
          </div>

          <Card className="space-y-2 break-inside-avoid">
            <h2 className="font-semibold text-ink">Entradas × saídas</h2>
            <div className="h-56 w-full">
              {mounted && (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={serie} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                    <CartesianGrid stroke="var(--line)" vertical={false} />
                    <XAxis
                      dataKey="nome"
                      tick={{ fontSize: 11, fill: 'var(--ink-2)' }}
                      interval={Math.max(0, Math.floor(serie.length / 10))}
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
                    <Tooltip
                      formatter={(v) => brl(Number(v) * 100)}
                      contentStyle={{
                        background: 'var(--surface)',
                        border: '1px solid var(--line)',
                        borderRadius: 12,
                        fontSize: 13,
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="entradas" fill="var(--positive)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="saidas" name="saídas" fill="var(--negative)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>

          <Card className="space-y-2 break-inside-avoid">
            <h2 className="font-semibold text-ink">Saldo acumulado no período</h2>
            <div className="h-48 w-full">
              {mounted && (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={serie} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="acumGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--line)" vertical={false} />
                    <XAxis
                      dataKey="nome"
                      tick={{ fontSize: 11, fill: 'var(--ink-2)' }}
                      interval={Math.max(0, Math.floor(serie.length / 10))}
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
                    <Tooltip
                      formatter={(v) => brl(Number(v) * 100)}
                      contentStyle={{
                        background: 'var(--surface)',
                        border: '1px solid var(--line)',
                        borderRadius: 12,
                        fontSize: 13,
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="acumulado"
                      stroke="var(--primary)"
                      strokeWidth={2}
                      fill="url(#acumGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>

          <Card className="space-y-3 break-inside-avoid">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-ink">Por categoria</h2>
              <Button
                variant="ghost"
                size="sm"
                className="print:hidden"
                onClick={() => exportarCsv('categorias')}
              >
                <Download className="h-3.5 w-3.5" /> CSV
              </Button>
            </div>
            {report.categories.length === 0 ? (
              <p className="text-sm text-ink-2">Nenhuma despesa no período.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs text-ink-2">
                      <th className="py-2 font-medium">Categoria</th>
                      <th className="py-2 text-right font-medium">Total</th>
                      <th className="py-2 text-right font-medium">%</th>
                      <th className="py-2 text-right font-medium">Nº</th>
                      <th className="py-2 text-right font-medium">Média</th>
                      <th className="py-2 text-right font-medium">vs. anterior</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.categories.map((row) => (
                      <tr
                        key={row.categoryId ?? 'sem'}
                        className="cursor-pointer border-b border-line last:border-0 hover:bg-surface-2 print:cursor-auto"
                        onClick={() => drillDown(row)}
                      >
                        <td className="py-2">
                          <span className="flex items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ background: row.color ?? 'var(--primary)' }}
                            />
                            <span className="truncate text-ink">{row.name}</span>
                          </span>
                        </td>
                        <td className="py-2 text-right tabular-nums text-ink">
                          {brl(row.totalCents)}
                        </td>
                        <td className="py-2 text-right tabular-nums text-ink-2">
                          {row.percent.toFixed(1)}%
                        </td>
                        <td className="py-2 text-right tabular-nums text-ink-2">{row.count}</td>
                        <td className="py-2 text-right tabular-nums text-ink-2">
                          {brl(row.averageCents)}
                        </td>
                        <td
                          className={cn(
                            'py-2 text-right tabular-nums',
                            Number(row.deltaCents) > 0 ? 'text-negative' : 'text-positive',
                          )}
                        >
                          {Number(row.deltaCents) > 0 ? '+' : ''}
                          {brl(row.deltaCents)}
                          {row.percentChange !== null && (
                            <span className="ml-1 text-[11px]">
                              ({row.percentChange > 0 ? '+' : ''}
                              {row.percentChange.toFixed(0)}%)
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {report.biggestVariations.length > 0 && (
            <Card className="space-y-3 break-inside-avoid">
              <h2 className="font-semibold text-ink">Maiores variações</h2>
              <ul className="space-y-2">
                {report.biggestVariations.map((row) => {
                  const subiu = Number(row.deltaCents) > 0;
                  return (
                    <li key={row.categoryId ?? 'sem'} className="flex items-center gap-2 text-sm">
                      <span
                        className={cn(
                          'grid h-7 w-7 shrink-0 place-items-center rounded-full',
                          subiu ? 'bg-negative/15 text-negative' : 'bg-positive/15 text-positive',
                        )}
                      >
                        {subiu ? (
                          <TrendingUp className="h-3.5 w-3.5" />
                        ) : (
                          <TrendingDown className="h-3.5 w-3.5" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-ink">{row.name}</span>
                      <span
                        className={cn(
                          'shrink-0 tabular-nums',
                          subiu ? 'text-negative' : 'text-positive',
                        )}
                      >
                        {subiu ? '+' : ''}
                        {brl(row.deltaCents)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="space-y-3 break-inside-avoid">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-ink">20 maiores lançamentos</h2>
                <Button
                  variant="ghost"
                  size="sm"
                  className="print:hidden"
                  onClick={() => exportarCsv('lancamentos')}
                >
                  <Download className="h-3.5 w-3.5" />
                </Button>
              </div>
              {report.topTransactions.length === 0 ? (
                <p className="text-sm text-ink-2">Nada no período.</p>
              ) : (
                <ul className="space-y-1.5">
                  {report.topTransactions.map((tx) => (
                    <li key={tx.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 flex-1 truncate">
                        {tx.description}
                        <span className="text-ink-2">
                          {' '}
                          · {formatInSaoPaulo(new Date(tx.date))}
                          {tx.category ? ` · ${tx.category.name}` : ''}
                        </span>
                      </span>
                      <span className="shrink-0 tabular-nums text-ink">{brl(tx.amountCents)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="space-y-3 break-inside-avoid">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-ink">Onde você mais vai</h2>
                <Button
                  variant="ghost"
                  size="sm"
                  className="print:hidden"
                  onClick={() => exportarCsv('estabelecimentos')}
                >
                  <Download className="h-3.5 w-3.5" />
                </Button>
              </div>
              {report.topMerchants.length === 0 ? (
                <p className="text-sm text-ink-2">Nada no período.</p>
              ) : (
                <ul className="space-y-2">
                  {report.topMerchants.map((m) => (
                    <li key={m.key} className="space-y-1">
                      <div className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="min-w-0 flex-1 truncate text-ink">{m.label}</span>
                        <span className="shrink-0 text-xs text-ink-2">
                          {m.count}× · {brl(m.totalCents)}
                        </span>
                      </div>
                      <Progress
                        value={(m.count / (report.topMerchants[0]?.count || 1)) * 100}
                        className="h-1.5"
                      />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <Card className="space-y-2 break-inside-avoid">
            <h2 className="font-semibold text-ink">Patrimônio líquido</h2>
            <p className="text-xs text-ink-2">
              Contas (incluindo investimento) menos a dívida de cartão em aberto naquele mês.
            </p>
            <div className="h-52 w-full">
              {mounted && (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={patrimonio} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                    <CartesianGrid stroke="var(--line)" vertical={false} />
                    <XAxis
                      dataKey="nome"
                      tick={{ fontSize: 11, fill: 'var(--ink-2)' }}
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
                    <Tooltip
                      formatter={(v) => brl(Number(v) * 100)}
                      contentStyle={{
                        background: 'var(--surface)',
                        border: '1px solid var(--line)',
                        borderRadius: 12,
                        fontSize: 13,
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="patrimonio"
                      name="patrimônio"
                      stroke="var(--primary)"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function TotalCard({
  label,
  cents,
  variation,
  tone,
  invertTone,
  footer,
}: {
  label: string;
  cents: string;
  variation: { deltaCents: string; percentChange: number | null };
  tone: 'positive' | 'negative';
  invertTone?: boolean;
  footer?: string;
}) {
  const subiu = Number(variation.deltaCents) > 0;
  // Em "saídas", subir é ruim; em "entradas", subir é bom.
  const bom = invertTone ? !subiu : subiu;

  return (
    <Card className="space-y-1 break-inside-avoid">
      <p className="text-xs text-ink-2">{label}</p>
      <p
        className={cn(
          'font-manrope text-2xl font-bold tabular-nums',
          tone === 'positive' ? 'text-positive' : 'text-negative',
        )}
      >
        {brl(cents)}
      </p>
      <p className="flex items-center gap-1 text-xs text-ink-2">
        {subiu ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
        <span className={bom ? 'text-positive' : 'text-negative'}>
          {subiu ? '+' : ''}
          {brl(variation.deltaCents)}
          {variation.percentChange !== null && ` (${variation.percentChange.toFixed(0)}%)`}
        </span>
        <span>vs. anterior</span>
      </p>
      {footer && <p className="text-xs text-ink-2">{footer}</p>}
    </Card>
  );
}
