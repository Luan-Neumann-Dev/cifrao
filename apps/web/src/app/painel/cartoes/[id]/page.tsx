'use client';

import {
  type InvoiceStatus,
  formatInSaoPaulo,
  invoiceWindowForPurchase,
  splitInstallments,
} from '@cifrao/shared';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Input, Label, Select } from '@/components/ui/input';
import {
  type Account,
  type Category,
  type CommitmentPoint,
  type CreditCardDetail,
  type InvoiceDetail,
  type InvoiceSummary,
  api,
} from '@/lib/api';
import { brl, centsFromInput } from '@/lib/format';
import { cn } from '@/lib/utils';

const MONTHS = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez',
];
function monthShort(ref: string): string {
  const [y, m] = ref.split('-').map(Number);
  return `${MONTHS[m - 1]}/${String(y).slice(2)}`;
}
function monthLong(ref: string): string {
  const names = [
    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
  ];
  const [y, m] = ref.split('-').map(Number);
  return `${names[m - 1]} de ${y}`;
}

const STATUS: Record<InvoiceStatus, { label: string; cls: string }> = {
  OPEN: { label: 'Aberta', cls: 'bg-primary-soft text-primary' },
  CLOSED: { label: 'Fechada', cls: 'bg-surface-2 text-ink-2' },
  PARTIAL: { label: 'Parcial', cls: 'bg-warn/15 text-warn' },
  PAID: { label: 'Paga', cls: 'bg-positive/15 text-positive' },
};

export default function CartaoDetalhePage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [card, setCard] = useState<CreditCardDetail | null>(null);
  const [commitment, setCommitment] = useState<CommitmentPoint[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const [c, cm] = await Promise.all([
        api<CreditCardDetail>(`/credit-cards/${id}`),
        api<CommitmentPoint[]>(`/credit-cards/${id}/commitment`),
      ]);
      setCard(c);
      setCommitment(cm);
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
      .catch((e) => toast.error((e as Error).message));
  }, [reload]);

  if (loading) return <p className="text-sm text-ink-2">Carregando…</p>;
  if (!card) return <p className="text-sm text-ink-2">Cartão não encontrado.</p>;

  const av = card.availability;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/painel/cartoes" className="text-sm text-ink-2 hover:text-ink">
            ← Cartões
          </Link>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">{card.nickname}</h1>
          <p className="text-sm text-ink-2">
            fecha dia {card.closingDay} · vence dia {card.dueDay}
          </p>
        </div>
        <PurchaseDialog card={card} categories={categories} onSaved={reload}>
          <Button>
            <Plus className="h-4 w-4" /> Nova compra
          </Button>
        </PurchaseDialog>
      </div>

      {/* Regra 5.5 — disponível de verdade, os três números separados */}
      <Card className="space-y-4">
        <div>
          <p className="text-xs text-ink-2">Disponível de verdade</p>
          <p
            className={cn(
              'font-manrope text-3xl font-extrabold tabular-nums',
              Number(av.availableCents) < 0 ? 'text-negative' : 'text-ink',
            )}
          >
            {brl(av.availableCents)}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Limite" value={av.limitCents} />
          <Metric label="Fatura em aberto" value={av.openInvoiceCents} tone="negative" />
          <Metric label="Faturas não quitadas" value={av.closedUnpaidCents} tone="negative" />
          <Metric label="Parcelas futuras" value={av.futureCommittedCents} tone="negative" />
        </div>
        <p className="text-xs text-ink-2">
          Disponível = limite − fatura em aberto − faturas fechadas não quitadas − parcelas futuras
          já comprometidas. Parcela futura consome limite mesmo antes de virar fatura (regra 5.5).
        </p>
      </Card>

      {/* Gráfico de comprometimento nos próximos 12 meses */}
      <Card className="space-y-3">
        <h2 className="font-semibold text-ink">Comprometimento nos próximos 12 meses</h2>
        <CommitmentChart data={commitment} color={card.color ?? '#820AD1'} />
      </Card>

      {/* Faturas */}
      <div className="space-y-2">
        <h2 className="font-semibold text-ink">Faturas</h2>
        {card.invoices.length === 0 ? (
          <Card className="text-center text-sm text-ink-2">
            Nenhuma fatura ainda. Lance uma compra para gerar a primeira.
          </Card>
        ) : (
          card.invoices.map((inv) => (
            <InvoiceRow key={inv.id} invoice={inv} accounts={accounts} defaultAccountId={card.defaultPaymentAccountId} onPaid={reload} />
          ))
        )}
      </div>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'negative' }) {
  const isZero = Number(value) === 0;
  return (
    <div className="rounded-[12px] bg-surface-2 p-3">
      <p className="text-[11px] text-ink-2">{label}</p>
      <p
        className={cn(
          'font-manrope text-lg font-bold tabular-nums',
          tone === 'negative' && !isZero ? 'text-negative' : 'text-ink',
        )}
      >
        {tone === 'negative' && !isZero ? '−' : ''}
        {brl(value)}
      </p>
    </div>
  );
}

function CommitmentChart({ data, color }: { data: CommitmentPoint[]; color: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const chartData = data.map((p) => ({
    month: monthShort(p.month),
    reais: Number(p.remainingCents) / 100,
  }));
  const hasData = chartData.some((d) => d.reais > 0);

  if (!mounted) return <div className="h-56" />;
  if (!hasData) {
    return <p className="py-8 text-center text-sm text-ink-2">Sem parcelas comprometidas à frente.</p>;
  }

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--ink-2)' }} tickLine={false} axisLine={false} />
          <YAxis
            tick={{ fontSize: 11, fill: 'var(--ink-2)' }}
            tickLine={false}
            axisLine={false}
            width={54}
            tickFormatter={(v: number) => brl(v * 100)}
          />
          <Tooltip
            formatter={(v) => [brl(Number(v) * 100), 'A pagar']}
            contentStyle={{
              background: 'var(--surface)',
              border: '1px solid var(--line)',
              borderRadius: 12,
              fontSize: 13,
            }}
            cursor={{ fill: 'var(--overlay)' }}
          />
          <Bar dataKey="reais" fill={color} radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function InvoiceRow({
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
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const status = STATUS[invoice.status];
  const remaining = Number(invoice.remainingCents);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !detail) {
      try {
        setDetail(await api<InvoiceDetail>(`/invoices/${invoice.id}`));
      } catch (e) {
        toast.error((e as Error).message);
      }
    }
  }

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center gap-3">
        <button onClick={toggle} className="flex flex-1 items-center gap-2 text-left" type="button">
          {open ? <ChevronDown className="h-4 w-4 text-ink-2" /> : <ChevronRight className="h-4 w-4 text-ink-2" />}
          <div>
            <p className="font-semibold capitalize text-ink">{monthLong(invoice.referenceMonth)}</p>
            <p className="text-xs text-ink-2">
              fecha {formatInSaoPaulo(new Date(invoice.closingDate))} · vence{' '}
              {formatInSaoPaulo(new Date(invoice.dueDate))}
            </p>
          </div>
        </button>
        <span className={cn('rounded-full px-2.5 py-1 text-xs font-medium', status.cls)}>
          {status.label}
        </span>
        <div className="text-right">
          <p className="font-manrope font-bold tabular-nums text-ink">{brl(invoice.totalCents)}</p>
          {remaining > 0 && Number(invoice.paidCents) > 0 && (
            <p className="text-xs text-ink-2">restam {brl(invoice.remainingCents)}</p>
          )}
        </div>
      </div>

      {open && (
        <div className="space-y-2 border-t border-line pt-3">
          {!detail ? (
            <p className="text-sm text-ink-2">Carregando lançamentos…</p>
          ) : detail.transactions.length === 0 ? (
            <p className="text-sm text-ink-2">Sem lançamentos nesta fatura.</p>
          ) : (
            <ul className="space-y-1.5">
              {detail.transactions.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">
                    {t.type === 'TRANSFER' ? '💸 ' : ''}
                    {t.description}
                    {t.installmentNumber ? (
                      <span className="text-ink-2"> · {t.installmentNumber}/{t.installmentTotal}</span>
                    ) : null}
                    <span className="text-ink-2"> · {formatInSaoPaulo(new Date(t.date))}</span>
                  </span>
                  <span
                    className={cn(
                      'tabular-nums',
                      t.type === 'TRANSFER' ? 'text-positive' : 'text-ink',
                    )}
                  >
                    {t.type === 'TRANSFER' ? '−' : ''}
                    {brl(t.amountCents)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {remaining > 0 && (
            <div className="flex justify-end pt-1">
              <PayInvoiceDialog
                invoice={invoice}
                accounts={accounts}
                defaultAccountId={defaultAccountId}
                onPaid={onPaid}
              >
                <Button size="sm">Pagar fatura</Button>
              </PayInvoiceDialog>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function PayInvoiceDialog({
  invoice,
  accounts,
  defaultAccountId,
  onPaid,
  children,
}: {
  invoice: InvoiceSummary;
  accounts: Account[];
  defaultAccountId: string | null;
  onPaid: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState(defaultAccountId ?? accounts[0]?.id ?? '');
  const [amount, setAmount] = useState((Number(invoice.remainingCents) / 100).toFixed(2).replace('.', ','));
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api(`/invoices/${invoice.id}/pay`, {
        method: 'POST',
        body: JSON.stringify({ accountId, amountCents: centsFromInput(amount) }),
      });
      toast.success('Pagamento registrado (transferência, não é despesa).');
      setOpen(false);
      onPaid();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent title="Pagar fatura">
        <p className="text-sm text-ink-2">
          Pagar fatura move dinheiro da conta para o cartão — não cria despesa nova (os gastos já
          foram contados quando lançados). Total em aberto: {brl(invoice.remainingCents)}.
        </p>
        <form className="space-y-3" onSubmit={submit}>
          <div className="space-y-1">
            <Label htmlFor="pay-acc">Conta de origem</Label>
            <Select id="pay-acc" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="pay-amount">Valor</Label>
            <Input id="pay-amount" required value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" disabled={saving}>
              {saving ? 'Pagando…' : 'Pagar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PurchaseDialog({
  card,
  categories,
  onSaved,
  children,
}: {
  card: CreditCardDetail;
  categories: Category[];
  onSaved: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(formatInSaoPaulo(new Date(), 'yyyy-MM-dd'));
  const [description, setDescription] = useState('');
  const [installments, setInstallments] = useState('1');
  const [categoryId, setCategoryId] = useState('');
  const [saving, setSaving] = useState(false);

  const expenseCategories = categories.filter((c) => c.kind === 'EXPENSE' || c.kind === 'BOTH');
  const n = Math.max(1, Number(installments) || 1);
  const totalCents = amount ? centsFromInput(amount) : 0;

  // Prévia da fatura: em qual fatura cai a 1ª parcela (regra 5.3).
  const preview = useMemo(() => {
    if (!date) return null;
    const [y, m, d] = date.split('-').map(Number);
    if (!y || !m || !d) return null;
    const w = invoiceWindowForPurchase({ year: y, month: m, day: d }, card.closingDay, card.dueDay);
    const parts = totalCents > 0 ? splitInstallments(BigInt(totalCents), n) : [];
    return { referenceMonth: w.referenceMonth, closing: w.closing, firstPart: parts[0] };
  }, [date, card.closingDay, card.dueDay, totalCents, n]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const isoDate = new Date(`${date}T12:00:00.000Z`).toISOString();
      await api(`/credit-cards/${card.id}/purchases`, {
        method: 'POST',
        body: JSON.stringify({
          amountCents: centsFromInput(amount),
          date: isoDate,
          description,
          installments: n,
          categoryId: categoryId || undefined,
        }),
      });
      toast.success(n > 1 ? `Compra em ${n}x lançada.` : 'Compra lançada.');
      setOpen(false);
      setAmount('');
      setDescription('');
      setInstallments('1');
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
      <DialogContent title="Nova compra no cartão">
        <form className="space-y-3" onSubmit={submit}>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="pu-amount">Valor total</Label>
              <Input id="pu-amount" required value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pu-date">Data</Label>
              <Input id="pu-date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="pu-desc">Descrição</Label>
            <Input id="pu-desc" required value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="pu-inst">Parcelas</Label>
              <Input
                id="pu-inst"
                type="number"
                min={1}
                max={72}
                value={installments}
                onChange={(e) => setInstallments(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pu-cat">Categoria</Label>
              <Select id="pu-cat" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">Sem categoria</option>
                {expenseCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {preview && (
            <div className="rounded-[12px] bg-primary-soft px-3 py-2 text-sm text-primary">
              {n > 1 && preview.firstPart !== undefined ? (
                <>
                  {n}× de <strong>{brl(preview.firstPart.toString())}</strong> — 1ª parcela entra na
                  fatura de <strong>{monthLong(preview.referenceMonth)}</strong>
                </>
              ) : (
                <>
                  Entra na fatura de <strong>{monthLong(preview.referenceMonth)}</strong> (fecha{' '}
                  {String(preview.closing.day).padStart(2, '0')}/
                  {String(preview.closing.month).padStart(2, '0')})
                </>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" disabled={saving}>
              {saving ? 'Lançando…' : 'Lançar compra'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
