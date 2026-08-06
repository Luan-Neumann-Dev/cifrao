'use client';

import { ArrowLeftRight, ChevronRight, Plus } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { type Account, api } from '@/lib/api';
import { ACCOUNT_TYPE_LABEL, accountBalanceColor, accountMark, accountTypeColor } from '@/lib/accounts';
import { brl, splitBrl } from '@/lib/format';
import { AccountDialog } from './account-dialog';

export default function ContasPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setAccounts(await api<Account[]>('/accounts'));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const total = accounts.reduce((acc, a) => acc + Number(a.balanceCents), 0);
  const parts = splitBrl(total);

  return (
    <div>
      <div className="flex items-center justify-between gap-3 px-0.5 pt-1">
        <h1 className="font-manrope text-[26px] font-bold tracking-[-0.015em] text-ink">Contas</h1>
        <Link
          href="/painel/contas/transferir"
          className="inline-flex h-11 shrink-0 items-center gap-[7px] rounded-full border border-line bg-surface pl-[15px] pr-[18px] text-sm font-semibold text-ink transition-colors hover:bg-surface-2"
        >
          <ArrowLeftRight className="h-[17px] w-[17px]" strokeWidth={1.85} />
          Transferir
        </Link>
      </div>

      {/* Patrimônio consolidado. O degradê sai de --primary para que a cor de
          acento escolhida nas Configurações (Fase 9) valha aqui também. */}
      <div
        className="relative mt-[18px] overflow-hidden rounded-[20px] px-[26px] py-6 text-white"
        style={{
          background:
            'linear-gradient(135deg, var(--primary), color-mix(in srgb, var(--primary) 72%, #000))',
          boxShadow: '0 10px 26px color-mix(in srgb, var(--primary) 28%, transparent)',
        }}
      >
        <span className="pointer-events-none absolute -right-10 -top-[50px] h-[170px] w-[170px] rounded-full bg-white/10" />
        <div className="relative text-[13px] text-white/80">Patrimônio em contas</div>
        <div className="relative mt-1.5 flex items-baseline font-manrope font-bold leading-none tracking-[-0.02em]">
          {parts.sign && <span className="mr-1 text-[26px]">{parts.sign}</span>}
          <span className="mr-[7px] text-[19px] font-semibold text-white/80">{parts.currency}</span>
          <span className="text-[38px] tabular-nums">{parts.whole}</span>
          <span className="text-[22px] tabular-nums opacity-70">{parts.fraction}</span>
        </div>
        <div className="relative mt-2.5 text-[12.5px] text-white/70">
          {loading
            ? 'carregando…'
            : `${accounts.length} ${accounts.length === 1 ? 'conta' : 'contas'} · atualizado agora`}
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2.5">
        {accounts.map((a) => (
          <AccountRow key={a.id} account={a} />
        ))}
      </div>

      {!loading && accounts.length === 0 && (
        <p className="mt-4 px-1 text-center text-sm text-ink-2">
          Nenhuma conta ainda. Crie a primeira para começar a lançar.
        </p>
      )}

      <AccountDialog onSaved={load}>
        <button
          type="button"
          className="mt-3.5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-[14px] border border-dashed border-line bg-transparent text-sm font-semibold text-primary transition-colors hover:border-primary hover:bg-primary-soft"
        >
          <Plus className="h-[17px] w-[17px]" strokeWidth={1.85} />
          Nova conta
        </button>
      </AccountDialog>
    </div>
  );
}

function AccountRow({ account }: { account: Account }) {
  const color = account.color ?? 'var(--primary)';
  return (
    <Link
      href={`/painel/contas/${account.id}`}
      className="flex items-center gap-3.5 rounded-[18px] border border-[var(--card-border)] bg-surface px-[18px] py-4 shadow-[var(--card-shadow)] transition-transform hover:-translate-y-0.5"
    >
      <span
        className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-[13px] font-manrope text-lg font-extrabold text-white"
        style={{ background: color }}
      >
        {accountMark(account.name, account.type)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate font-manrope text-[15.5px] font-bold text-ink">{account.name}</div>
        <div className="mt-[3px] inline-flex items-center gap-1.5 text-[12.5px] text-ink-2">
          <span
            className="h-1.5 w-1.5 rounded-[2px]"
            style={{ background: accountTypeColor(account.type) }}
          />
          {ACCOUNT_TYPE_LABEL[account.type]}
          {account.institution ? ` · ${account.institution}` : ''}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div
          className="font-manrope text-base font-bold tabular-nums"
          style={{ color: accountBalanceColor(account.type, account.balanceCents) }}
        >
          {brl(account.balanceCents)}
        </div>
        <div className="mt-0.5 text-[11.5px] text-ink-2">saldo atual</div>
      </div>
      <ChevronRight className="h-[18px] w-[18px] shrink-0 text-ink-2" />
    </Link>
  );
}
