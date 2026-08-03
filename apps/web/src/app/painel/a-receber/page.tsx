'use client';

import { formatInSaoPaulo } from '@cifrao/shared';
import { CheckCircle2, HandCoins, Info, Undo2 } from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Input, Label, Select } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { type Account, type Receivable, type Receivables, api } from '@/lib/api';
import { brl, centsFromInput } from '@/lib/format';

export default function AReceberPage() {
  const [data, setData] = useState<Receivables | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [rec, accs] = await Promise.all([
        api<Receivables>('/receivables'),
        api<Account[]>('/accounts'),
      ]);
      setData(rec);
      setAccounts(accs);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function desfazer(tx: Receivable) {
    if (!confirm(`Desfazer o recebimento de "${tx.description}"? O valor sai da conta de volta.`)) {
      return;
    }
    try {
      const res = await api<{ removed: number }>(`/transactions/${tx.id}/reimburse`, {
        method: 'DELETE',
      });
      toast.success(`Recebimento desfeito (${res.removed} estorno(s) removido(s)).`);
      void load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">A receber</h1>
        <p className="text-sm text-ink-2">
          Gastos marcados como reembolsáveis, pendentes até o dinheiro voltar.
        </p>
      </div>

      <Card className="flex items-start gap-2 bg-surface-2 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p className="text-xs text-ink-2">
          Ao registrar o recebimento, o Cifrão cria um{' '}
          <strong className="text-ink">estorno vinculado</strong>: credita a conta escolhida e{' '}
          <strong className="text-ink">abate o gasto da categoria</strong> — então o almoço
          reembolsado para de consumir seu orçamento. O estorno nunca conta como receita.
        </p>
      </Card>

      {loading ? (
        <p className="text-sm text-ink-2">Carregando…</p>
      ) : !data ? (
        <p className="text-sm text-ink-2">Não foi possível carregar.</p>
      ) : (
        <>
          <Card className="flex items-center gap-3 bg-primary text-white">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/15">
              <HandCoins className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm text-white/80">Ainda falta receber</p>
              <p className="font-manrope text-3xl font-extrabold tabular-nums">
                {brl(data.pendingTotalCents)}
              </p>
              <p className="text-xs text-white/80">
                {data.pendingCount} {data.pendingCount === 1 ? 'lançamento' : 'lançamentos'}
                {data.pendingTotalCents !== data.pendingGrossCents && (
                  <> · {brl(data.pendingGrossCents)} no total, com parciais já recebidos</>
                )}
              </p>
            </div>
          </Card>

          <Card className="space-y-3">
            <h2 className="font-semibold text-ink">Pendentes</h2>
            {data.pending.length === 0 ? (
              <p className="text-sm text-ink-2">
                Nada a receber. Marque um gasto como reembolsável em{' '}
                <Link href="/painel/lancamentos" className="font-medium text-primary hover:underline">
                  Lançamentos
                </Link>{' '}
                para ele aparecer aqui.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {data.pending.map((tx) => (
                  <li key={tx.id} className="space-y-1.5 py-3 first:pt-0 last:pb-0">
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-ink">{tx.description}</p>
                        <p className="truncate text-xs text-ink-2">
                          {formatInSaoPaulo(new Date(tx.date))}
                          {tx.category ? ` · ${tx.category.name}` : ''}
                          {tx.account ? ` · ${tx.account.name}` : ''}
                        </p>
                      </div>
                      <span className="shrink-0 text-right">
                        <span className="block tabular-nums font-semibold text-ink">
                          {brl(tx.remainingCents)}
                        </span>
                        {tx.partial && (
                          <span className="block text-[11px] text-ink-2">
                            de {brl(tx.amountCents)}
                          </span>
                        )}
                      </span>
                      <ReimburseDialog tx={tx} accounts={accounts} onDone={load}>
                        <Button variant="ghost" size="sm">
                          <CheckCircle2 className="h-4 w-4" />
                          <span className="hidden sm:inline">Recebi</span>
                        </Button>
                      </ReimburseDialog>
                    </div>
                    {tx.partial && (
                      <div className="space-y-1">
                        <Progress
                          value={(Number(tx.reimbursedCents) / Number(tx.amountCents)) * 100}
                          className="h-1.5"
                          barClassName="bg-positive"
                        />
                        <p className="text-[11px] text-ink-2">
                          já voltaram {brl(tx.reimbursedCents)} em {tx.reimbursements.length}{' '}
                          {tx.reimbursements.length === 1 ? 'estorno' : 'estornos'}
                        </p>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {data.received.length > 0 && (
            <Card className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-ink">Já recebidos</h2>
                <span className="text-sm tabular-nums text-ink-2">
                  {brl(data.receivedTotalCents)}
                </span>
              </div>
              <ul className="divide-y divide-line">
                {data.received.map((tx) => (
                  <li key={tx.id} className="flex items-center gap-2 py-2.5 first:pt-0 last:pb-0">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-ink-2 line-through">{tx.description}</p>
                      <p className="truncate text-xs text-ink-2">
                        recebido em{' '}
                        {tx.reimbursedAt ? formatInSaoPaulo(new Date(tx.reimbursedAt)) : '—'}
                        {tx.reimbursements[0]?.account
                          ? ` · ${tx.reimbursements[0].account.name}`
                          : ''}
                      </p>
                    </div>
                    <span className="shrink-0 tabular-nums text-ink-2">
                      {brl(tx.reimbursedCents)}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => desfazer(tx)}
                      title="Desfazer recebimento"
                    >
                      <Undo2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function ReimburseDialog({
  tx,
  accounts,
  onDone,
  children,
}: {
  tx: Receivable;
  accounts: Account[];
  onDone: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const restante = (Number(tx.remainingCents) / 100).toFixed(2).replace('.', ',');
  const [accountId, setAccountId] = useState(tx.account?.id ?? '');
  const [amount, setAmount] = useState(restante);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api<{ settled: boolean; remainingCents: string }>(
        `/transactions/${tx.id}/reimburse`,
        {
          method: 'POST',
          body: JSON.stringify({
            accountId: accountId || accounts[0]?.id,
            amountCents: centsFromInput(amount),
          }),
        },
      );
      toast.success(
        res.settled
          ? 'Reembolso registrado: conta creditada e gasto abatido da categoria.'
          : `Parcial registrado. Ainda faltam ${brl(res.remainingCents)}.`,
      );
      setOpen(false);
      onDone();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent title="Registrar recebimento">
        <p className="text-sm text-ink-2">
          <span className="font-medium text-ink">{tx.description}</span> — gasto de{' '}
          {brl(tx.amountCents)}
          {tx.partial ? `, com ${brl(tx.reimbursedCents)} já recebidos` : ''}. Falta{' '}
          <span className="font-semibold text-ink">{brl(tx.remainingCents)}</span>.
        </p>
        <form className="space-y-3" onSubmit={submit}>
          <div className="space-y-1">
            <Label htmlFor="reimb-account">Conta que recebeu</Label>
            <Select
              id="reimb-account"
              required
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
            >
              <option value="">Selecione…</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {brl(a.balanceCents)}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="reimb-amount">Valor recebido</Label>
            <Input
              id="reimb-amount"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={restante}
            />
            <p className="text-xs text-ink-2">
              Recebeu menos que o total? Informe o valor parcial — o resto continua em &quot;A
              receber&quot;.
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" disabled={saving}>
              {saving ? 'Registrando…' : 'Registrar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
