'use client';

import { formatInSaoPaulo } from '@cifrao/shared';
import { CheckCircle2, HandCoins, Undo2 } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { type Receivables, type Transaction, api } from '@/lib/api';
import { brl } from '@/lib/format';

export default function AReceberPage() {
  const [data, setData] = useState<Receivables | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setData(await api<Receivables>('/receivables'));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function marcar(tx: Transaction, recebido: boolean) {
    try {
      await api(`/transactions/${tx.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ reimbursedAt: recebido ? new Date().toISOString() : null }),
      });
      toast.success(recebido ? 'Marcado como recebido.' : 'Voltou para pendente.');
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
          Lançamentos marcados como reembolsáveis, pendentes até você confirmar o recebimento.
        </p>
      </div>

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
              <p className="text-sm text-white/80">Pendente de recebimento</p>
              <p className="font-manrope text-3xl font-extrabold tabular-nums">
                {brl(data.pendingTotalCents)}
              </p>
              <p className="text-xs text-white/80">
                {data.pendingCount} {data.pendingCount === 1 ? 'lançamento' : 'lançamentos'}
              </p>
            </div>
          </Card>

          <Card className="space-y-3">
            <h2 className="font-semibold text-ink">Pendentes</h2>
            {data.pending.length === 0 ? (
              <p className="text-sm text-ink-2">
                Nada a receber. Marque um lançamento como reembolsável em{' '}
                <Link href="/painel/lancamentos" className="font-medium text-primary hover:underline">
                  Lançamentos
                </Link>{' '}
                para ele aparecer aqui.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {data.pending.map((tx) => (
                  <li key={tx.id} className="flex items-center gap-2 py-2.5 first:pt-0 last:pb-0">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-ink">{tx.description}</p>
                      <p className="truncate text-xs text-ink-2">
                        {formatInSaoPaulo(new Date(tx.date))}
                        {tx.category ? ` · ${tx.category.name}` : ''}
                        {tx.account ? ` · ${tx.account.name}` : ''}
                      </p>
                    </div>
                    <span className="shrink-0 tabular-nums font-semibold text-ink">
                      {brl(tx.amountCents)}
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => marcar(tx, true)}>
                      <CheckCircle2 className="h-4 w-4" />
                      <span className="hidden sm:inline">Recebi</span>
                    </Button>
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
                      </p>
                    </div>
                    <span className="shrink-0 tabular-nums text-ink-2">{brl(tx.amountCents)}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => marcar(tx, false)}
                      title="Voltar para pendente"
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
