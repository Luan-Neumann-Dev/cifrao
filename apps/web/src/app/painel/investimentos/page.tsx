'use client';

import {
  INVESTMENT_CLASSES,
  INVESTMENT_CLASS_LABELS,
  type InvestmentClass,
  formatInSaoPaulo,
  formatQuantity,
} from '@cifrao/shared';
import { ArrowDownRight, ArrowUpRight, Info, Plus, RefreshCw, Target, Wallet } from 'lucide-react';
import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from 'react';
import {
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  type Account,
  type InvestmentPosition,
  type Portfolio,
  api,
} from '@/lib/api';
import { brl, centsFromInput } from '@/lib/format';
import { cn } from '@/lib/utils';

const PALETTE = ['#820AD1', '#00A868', '#F5A524', '#E5484D', '#0F9B8E', '#A855F7', '#6B08AD', '#22C3B0'];

export default function InvestimentosPage() {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const load = useCallback(async () => {
    try {
      const [p, a] = await Promise.all([api<Portfolio>('/investments'), api<Account[]>('/accounts')]);
      setPortfolio(p);
      setAccounts(a);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <p className="text-sm text-ink-2">Carregando…</p>;
  if (!portfolio) return <p className="text-sm text-ink-2">Não foi possível carregar a carteira.</p>;

  const t = portfolio.totals;
  const ganhou = Number(t.gainCents) >= 0;

  const donut = portfolio.allocation
    .filter((a) => Number(a.marketValueCents) > 0)
    .map((a, i) => ({
      name: INVESTMENT_CLASS_LABELS[a.class],
      value: Number(a.marketValueCents) / 100,
      color: PALETTE[i % PALETTE.length],
    }));

  const evolucao = portfolio.evolution.map((p) => ({
    nome: p.month.slice(5),
    valor: Number(p.marketValueCents) / 100,
  }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">Investimentos</h1>
          <p className="text-sm text-ink-2">
            {t.positionCount} {t.positionCount === 1 ? 'posição' : 'posições'} · cotação atualizada
            à mão
          </p>
        </div>
        <div className="flex gap-2">
          <TargetsDialog allocation={portfolio.allocation} onSaved={load}>
            <Button variant="ghost">
              <Target className="h-4 w-4" /> Alvos
            </Button>
          </TargetsDialog>
          <InvestmentDialog onSaved={load}>
            <Button>
              <Plus className="h-4 w-4" /> Nova posição
            </Button>
          </InvestmentDialog>
        </div>
      </div>

      <Card className="flex items-start gap-2 bg-surface-2 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p className="text-xs text-ink-2">
          Aportar <strong className="text-ink">tira o dinheiro da conta</strong> escolhida e o
          transforma em posição — por isso o patrimônio soma contas + carteira sem contar o mesmo
          real duas vezes. Aporte sem conta serve para cadastrar carteira antiga.
        </p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="bg-primary text-white lg:col-span-2">
          <div className="flex items-center gap-2 text-white/80">
            <Wallet className="h-4 w-4" />
            <span className="text-sm">Valor da carteira</span>
          </div>
          <p className="mt-1 font-manrope text-4xl font-extrabold tabular-nums">
            {brl(t.marketValueCents)}
          </p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/80">
            <span>Investido {brl(t.investedCents)}</span>
            <span>
              {ganhou ? '+' : ''}
              {brl(t.gainCents)}
              {t.gainPercent !== null && ` (${t.gainPercent.toFixed(2)}%)`}
            </span>
            {Number(t.realizedGainCents) !== 0 && (
              <span>Realizado {brl(t.realizedGainCents)}</span>
            )}
          </div>
        </Card>

        <Card className="space-y-2">
          <h2 className="text-sm font-semibold text-ink">Alocação</h2>
          {donut.length === 0 ? (
            <p className="text-sm text-ink-2">Sem posições ainda.</p>
          ) : (
            <div className="h-36 w-full">
              {mounted && (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={donut}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={38}
                      outerRadius={62}
                      paddingAngle={2}
                      stroke="none"
                    >
                      {donut.map((d) => (
                        <Cell key={d.name} fill={d.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v) => brl(Number(v) * 100)}
                      contentStyle={{
                        background: 'var(--surface)',
                        border: '1px solid var(--line)',
                        borderRadius: 12,
                        fontSize: 13,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          )}
        </Card>
      </div>

      {portfolio.allocation.length > 0 && (
        <Card className="space-y-3">
          <h2 className="font-semibold text-ink">Por classe, contra o alvo</h2>
          <ul className="space-y-3">
            {portfolio.allocation.map((slice, i) => (
              <li key={slice.class} className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: PALETTE[i % PALETTE.length] }}
                    />
                    <span className="truncate text-ink">{INVESTMENT_CLASS_LABELS[slice.class]}</span>
                  </span>
                  <span className="shrink-0 tabular-nums text-ink-2">
                    {brl(slice.marketValueCents)} · {slice.percent.toFixed(1)}%
                    {slice.targetPercent !== null && ` de ${slice.targetPercent}%`}
                  </span>
                </div>
                <Progress value={slice.percent} color={PALETTE[i % PALETTE.length]} className="h-1.5" />
                {slice.adjustmentCents !== null && Number(slice.adjustmentCents) !== 0 && (
                  <p className="text-[11px] text-ink-2">
                    {Number(slice.adjustmentCents) > 0 ? (
                      <>
                        faltam <strong className="text-ink">{brl(slice.adjustmentCents)}</strong> para
                        bater o alvo
                      </>
                    ) : (
                      <>
                        está <strong className="text-ink">{brl(-Number(slice.adjustmentCents))}</strong>{' '}
                        acima do alvo
                      </>
                    )}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="space-y-3">
        <h2 className="font-semibold text-ink">Posições</h2>
        {portfolio.positions.length === 0 ? (
          <p className="text-sm text-ink-2">
            Nenhuma posição ainda. Crie a primeira e registre o aporte.
          </p>
        ) : (
          <div className="space-y-3">
            {portfolio.positions.map((position) => (
              <PositionCard
                key={position.id}
                position={position}
                accounts={accounts}
                onChanged={load}
              />
            ))}
          </div>
        )}
      </Card>

      {evolucao.some((p) => p.valor > 0) && (
        <Card className="space-y-2">
          <h2 className="font-semibold text-ink">Evolução da carteira</h2>
          <p className="text-xs text-ink-2">
            Quantidade que existia em cada mês × a cotação registrada até então.
          </p>
          <div className="h-48 w-full">
            {mounted && (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={evolucao} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
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
                    dataKey="valor"
                    stroke="var(--invest)"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

function PositionCard({
  position,
  accounts,
  onChanged,
}: {
  position: InvestmentPosition;
  accounts: Account[];
  onChanged: () => void;
}) {
  const ganhou = Number(position.gainCents) >= 0;

  return (
    <div className="rounded-[14px] border border-line p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink">
            {position.ticker}
            <span className="ml-2 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-ink-2">
              {INVESTMENT_CLASS_LABELS[position.class]}
            </span>
          </p>
          <p className="truncate text-xs text-ink-2">
            {formatQuantity(BigInt(position.quantity))} un · médio {brl(position.avgPriceCents)} ·
            atual {brl(position.currentPriceCents)}
          </p>
        </div>
        <div className="text-right">
          <p className="font-manrope text-lg font-bold tabular-nums text-ink">
            {brl(position.marketValueCents)}
          </p>
          <p
            className={cn(
              'flex items-center justify-end gap-0.5 text-xs tabular-nums',
              ganhou ? 'text-positive' : 'text-negative',
            )}
          >
            {ganhou ? (
              <ArrowUpRight className="h-3 w-3" />
            ) : (
              <ArrowDownRight className="h-3 w-3" />
            )}
            {brl(position.gainCents)}
            {position.gainPercent !== null && ` (${position.gainPercent.toFixed(1)}%)`}
          </p>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <TradeDialog position={position} accounts={accounts} type="BUY" onSaved={onChanged}>
          <Button variant="ghost" size="sm">
            Aportar
          </Button>
        </TradeDialog>
        <TradeDialog position={position} accounts={accounts} type="SELL" onSaved={onChanged}>
          <Button variant="ghost" size="sm">
            Resgatar
          </Button>
        </TradeDialog>
        <PriceDialog position={position} onSaved={onChanged}>
          <Button variant="ghost" size="sm">
            <RefreshCw className="h-3.5 w-3.5" /> Cotação
          </Button>
        </PriceDialog>
        {position.priceUpdatedAt && (
          <span className="self-center text-[11px] text-ink-2">
            atualizada em {formatInSaoPaulo(new Date(position.priceUpdatedAt))}
          </span>
        )}
      </div>
    </div>
  );
}

function InvestmentDialog({ onSaved, children }: { onSaved: () => void; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [ticker, setTicker] = useState('');
  const [name, setName] = useState('');
  const [assetClass, setAssetClass] = useState<InvestmentClass>('STOCKS');
  const [price, setPrice] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api('/investments', {
        method: 'POST',
        body: JSON.stringify({
          ticker,
          name: name || undefined,
          class: assetClass,
          currentPriceCents: price ? centsFromInput(price) : undefined,
          notes: notes || undefined,
        }),
      });
      toast.success('Posição criada. Agora registre o aporte.');
      setOpen(false);
      onSaved();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent title="Nova posição">
        <form className="space-y-3" onSubmit={submit}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="inv-ticker">Ticker</Label>
              <Input
                id="inv-ticker"
                required
                value={ticker}
                onChange={(e) => setTicker(e.target.value)}
                placeholder="PETR4"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="inv-class">Classe</Label>
              <Select
                id="inv-class"
                value={assetClass}
                onChange={(e) => setAssetClass(e.target.value as InvestmentClass)}
              >
                {INVESTMENT_CLASSES.map((c) => (
                  <option key={c} value={c}>
                    {INVESTMENT_CLASS_LABELS[c]}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="inv-name">Nome (opcional)</Label>
            <Input id="inv-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="inv-price">Cotação atual (opcional)</Label>
            <Input
              id="inv-price"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0,00"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="inv-notes">Observações (opcional)</Label>
            <Textarea id="inv-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" disabled={saving}>
              {saving ? 'Salvando…' : 'Criar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TradeDialog({
  position,
  accounts,
  type,
  onSaved,
  children,
}: {
  position: InvestmentPosition;
  accounts: Account[];
  type: 'BUY' | 'SELL';
  onSaved: () => void;
  children: ReactNode;
}) {
  const comprando = type === 'BUY';
  const [open, setOpen] = useState(false);
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [fees, setFees] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [accountId, setAccountId] = useState('');
  const [saving, setSaving] = useState(false);

  const total = (() => {
    try {
      const q = Number(quantity.replace(',', '.'));
      const p = centsFromInput(price || '0');
      const f = fees ? centsFromInput(fees) : 0;
      if (!Number.isFinite(q) || q <= 0) return null;
      return Math.round(q * p) + (comprando ? f : -f);
    } catch {
      return null;
    }
  })();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api(`/investments/${position.id}/${comprando ? 'contribute' : 'redeem'}`, {
        method: 'POST',
        body: JSON.stringify({
          quantity,
          priceCents: centsFromInput(price),
          feesCents: fees ? centsFromInput(fees) : 0,
          date: `${date}T12:00:00`,
          accountId: accountId || null,
        }),
      });
      toast.success(
        comprando
          ? accountId
            ? 'Aporte registrado — o valor saiu da conta.'
            : 'Aporte registrado (sem movimentar conta).'
          : 'Resgate registrado.',
      );
      setOpen(false);
      onSaved();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent title={`${comprando ? 'Aportar' : 'Resgatar'} · ${position.ticker}`}>
        <form className="space-y-3" onSubmit={submit}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="trade-qty">Quantidade</Label>
              <Input
                id="trade-qty"
                required
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="10"
              />
              {!comprando && (
                <p className="text-xs text-ink-2">
                  em carteira: {formatQuantity(BigInt(position.quantity))}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="trade-price">Preço unitário</Label>
              <Input
                id="trade-price"
                required
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0,00"
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="trade-fees">Taxas (opcional)</Label>
              <Input id="trade-fees" value={fees} onChange={(e) => setFees(e.target.value)} placeholder="0,00" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="trade-date">Data</Label>
              <Input
                id="trade-date"
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="trade-account">
              Conta {comprando ? 'que paga' : 'que recebe'} (opcional)
            </Label>
            <Select id="trade-account" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Não movimentar conta</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {brl(a.balanceCents)}
                </option>
              ))}
            </Select>
            <p className="text-xs text-ink-2">
              {comprando
                ? 'Com conta, o valor sai dela e vira posição — sem contar duas vezes.'
                : 'Com conta, o valor do resgate entra nela.'}
            </p>
          </div>

          {total !== null && (
            <p className="rounded-[12px] bg-surface-2 px-3 py-2 text-sm text-ink">
              {comprando ? 'Sai da conta' : 'Entra na conta'}:{' '}
              <strong className="tabular-nums">{brl(total)}</strong>
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" disabled={saving}>
              {saving ? 'Registrando…' : comprando ? 'Aportar' : 'Resgatar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PriceDialog({
  position,
  onSaved,
  children,
}: {
  position: InvestmentPosition;
  onSaved: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState((Number(position.currentPriceCents) / 100).toFixed(2).replace('.', ','));
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api(`/investments/${position.id}/price`, {
        method: 'PATCH',
        body: JSON.stringify({ priceCents: centsFromInput(price), date: `${date}T12:00:00` }),
      });
      toast.success('Cotação atualizada.');
      setOpen(false);
      onSaved();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent title={`Cotação · ${position.ticker}`}>
        <form className="space-y-3" onSubmit={submit}>
          <div className="space-y-1">
            <Label htmlFor="price-value">Preço unitário</Label>
            <Input id="price-value" required value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="price-date">Data da cotação</Label>
            <Input
              id="price-date"
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            <p className="text-xs text-ink-2">
              Cada atualização vira um ponto no histórico, que alimenta a evolução da carteira.
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" disabled={saving}>
              {saving ? 'Salvando…' : 'Atualizar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TargetsDialog({
  allocation,
  onSaved,
  children,
}: {
  allocation: Portfolio['allocation'];
  onSaved: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const current: Record<string, string> = {};
    for (const slice of allocation) {
      if (slice.targetPercent !== null) current[slice.class] = String(slice.targetPercent);
    }
    setValues(current);
  }, [open, allocation]);

  const total = Object.values(values).reduce((acc, v) => acc + (Number(v) || 0), 0);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api('/investments/targets', {
        method: 'PUT',
        body: JSON.stringify({
          targets: Object.entries(values)
            .filter(([, v]) => Number(v) > 0)
            .map(([className, v]) => ({ class: className, targetPercent: Number(v) })),
        }),
      });
      toast.success('Alvos salvos.');
      setOpen(false);
      onSaved();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent title="Alvo de alocação">
        <p className="text-sm text-ink-2">
          Quanto você quer em cada classe. A tela mostra o desvio e quanto falta comprar.
        </p>
        <form className="space-y-3" onSubmit={submit}>
          <div className="grid gap-2 sm:grid-cols-2">
            {INVESTMENT_CLASSES.map((className) => (
              <div key={className} className="space-y-1">
                <Label htmlFor={`target-${className}`}>{INVESTMENT_CLASS_LABELS[className]}</Label>
                <Input
                  id={`target-${className}`}
                  type="number"
                  min={0}
                  max={100}
                  value={values[className] ?? ''}
                  onChange={(e) => setValues({ ...values, [className]: e.target.value })}
                  placeholder="0"
                />
              </div>
            ))}
          </div>
          <p className={cn('text-sm', total > 100 ? 'text-negative' : 'text-ink-2')}>
            Somando {total}% {total > 100 && '— não pode passar de 100%'}
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" disabled={saving || total > 100}>
              {saving ? 'Salvando…' : 'Salvar alvos'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
