'use client';

import { formatInSaoPaulo } from '@cifrao/shared';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { type Account, type Paginated, type Transaction, api } from '@/lib/api';
import { brl } from '@/lib/format';

export default function PainelPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [recent, setRecent] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api<Account[]>('/accounts'),
      api<Paginated<Transaction>>('/transactions?pageSize=5'),
    ])
      .then(([a, t]) => {
        setAccounts(a);
        setRecent(t.items);
      })
      .catch((e) => toast.error((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const total = accounts.reduce((acc, a) => acc + Number(a.balanceCents), 0);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold tracking-tight text-ink">Visão geral</h1>

      <Card className="bg-primary text-white">
        <p className="text-sm text-white/80">Patrimônio em contas</p>
        <p className="mt-1 text-3xl font-extrabold tabular-nums">{loading ? '—' : brl(total)}</p>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-ink">Contas</h2>
            <Link href="/painel/contas" className="text-sm font-medium text-primary hover:underline">
              Ver todas
            </Link>
          </div>
          {accounts.length === 0 ? (
            <p className="text-sm text-ink-2">Nenhuma conta.</p>
          ) : (
            <ul className="space-y-2">
              {accounts.map((a) => (
                <li key={a.id} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ background: a.color ?? 'var(--primary)' }}
                    />
                    {a.name}
                  </span>
                  <span className="font-semibold tabular-nums text-ink">{brl(a.balanceCents)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-ink">Últimos lançamentos</h2>
            <Link
              href="/painel/lancamentos"
              className="text-sm font-medium text-primary hover:underline"
            >
              Ver todos
            </Link>
          </div>
          {recent.length === 0 ? (
            <p className="text-sm text-ink-2">Nada ainda.</p>
          ) : (
            <ul className="space-y-2">
              {recent.map((tx) => (
                <li key={tx.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">
                    {tx.description}
                    <span className="text-ink-2"> · {formatInSaoPaulo(new Date(tx.date))}</span>
                  </span>
                  <span className="tabular-nums text-ink-2">{brl(tx.amountCents)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
