'use client';

import { formatInSaoPaulo } from '@cifrao/shared';
import { ArrowLeftRight, ChevronDown, ChevronLeft, Info } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { type Account, api } from '@/lib/api';
import { accountMark } from '@/lib/accounts';
import { brl, centsFromInput } from '@/lib/format';

function todayInSp(): string {
  return formatInSaoPaulo(new Date(), 'yyyy-MM-dd');
}

/** Regra 5.7 — move saldo entre contas; não entra em receita nem em despesa. */
export default function TransferirPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState('');
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [date, setDate] = useState(todayInSp());
  const [description, setDescription] = useState('Transferência');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<Account[]>('/accounts')
      .then((list) => {
        setAccounts(list);
        setFromId(list[0]?.id ?? '');
        setToId(list[1]?.id ?? '');
      })
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, []);

  const from = accounts.find((a) => a.id === fromId) ?? null;
  const to = accounts.find((a) => a.id === toId) ?? null;
  const amountCents = useMemo(() => {
    if (!amount.trim()) return 0;
    try {
      const cents = centsFromInput(amount);
      return Number.isFinite(cents) ? cents : 0;
    } catch {
      return 0;
    }
  }, [amount]);

  const ready = amountCents > 0 && from !== null && to !== null && from.id !== to.id;

  function swap() {
    setFromId(toId);
    setToId(fromId);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setSaving(true);
    try {
      await api('/transactions', {
        method: 'POST',
        body: JSON.stringify({
          type: 'TRANSFER',
          fromAccountId: fromId,
          toAccountId: toId,
          amountCents,
          // Meio-dia UTC: o dia escolhido não escorrega no fuso de São Paulo.
          date: new Date(`${date}T12:00:00.000Z`).toISOString(),
          description: description.trim() || 'Transferência',
        }),
      });
      toast.success('Transferência registrada.');
      router.push('/painel/contas');
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-[480px]">
      <Link
        href="/painel/contas"
        className="mb-1.5 inline-flex h-9 items-center gap-[7px] px-1.5 text-[13.5px] font-semibold text-ink-2 transition-colors hover:text-ink"
      >
        <ChevronLeft className="h-[17px] w-[17px]" />
        Contas
      </Link>
      <h1 className="mb-1 font-manrope text-2xl font-bold tracking-[-0.015em] text-ink">
        Nova transferência
      </h1>
      <p className="mb-5 text-sm text-ink-2">
        Entre suas contas. Não conta como gasto nem receita.
      </p>

      {!loading && accounts.length < 2 ? (
        <div className="rounded-[20px] border border-[var(--card-border)] bg-surface p-6 text-center shadow-[var(--card-shadow)]">
          <p className="text-sm text-ink-2">
            Transferência move dinheiro entre duas contas suas, e você tem{' '}
            {accounts.length === 1 ? 'só uma' : 'nenhuma'} cadastrada.
          </p>
          <Link
            href="/painel/contas"
            className="mt-4 inline-flex h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-hover"
          >
            Criar outra conta
          </Link>
        </div>
      ) : (
        <form onSubmit={submit}>
          <div className="rounded-[20px] border border-[var(--card-border)] bg-surface px-6 py-[22px] text-center shadow-[var(--card-shadow)]">
            <label
              htmlFor="tr-amount"
              className="text-xs font-semibold uppercase tracking-[0.04em] text-ink-2"
            >
              Valor
            </label>
            <div className="mt-2 flex items-baseline justify-center gap-2">
              <span className="font-manrope text-[22px] font-semibold text-ink-2">R$</span>
              <input
                id="tr-amount"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0,00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-[min(260px,60vw)] bg-transparent text-center font-manrope text-[40px] font-bold tracking-[-0.02em] tabular-nums text-ink outline-none placeholder:text-ink-2/35"
              />
            </div>
          </div>

          <div className="relative mt-4">
            <AccountPicker
              label="De"
              account={from}
              accounts={accounts}
              value={fromId}
              onChange={(next) => {
                setFromId(next);
                // Origem igual ao destino é recusada pelo schema (5.7): troca.
                if (next === toId) setToId(fromId);
              }}
            />

            <div className="relative z-[2] -my-[13px] flex justify-center">
              <button
                type="button"
                onClick={swap}
                title="Trocar"
                className="flex h-[46px] w-[46px] items-center justify-center rounded-full border-[3px] border-bg bg-primary text-white shadow-[0_6px_16px_color-mix(in_srgb,var(--primary)_32%,transparent)] transition-transform hover:rotate-180 active:scale-95"
              >
                <ArrowLeftRight className="h-5 w-5" />
                <span className="sr-only">Trocar origem e destino</span>
              </button>
            </div>

            <AccountPicker
              label="Para"
              account={to}
              accounts={accounts}
              value={toId}
              onChange={(next) => {
                setToId(next);
                if (next === fromId) setFromId(toId);
              }}
            />
          </div>

          {/* O design não previu estes dois campos, mas a API exige data e
              descrição no lançamento — sem eles a transferência não nasce. */}
          <div className="mt-4 grid grid-cols-[132px_1fr] gap-3 rounded-[16px] border border-[var(--card-border)] bg-surface p-4 shadow-[var(--card-shadow)]">
            <div>
              <label htmlFor="tr-date" className="mb-1.5 block text-[13px] font-medium text-ink-2">
                Data
              </label>
              <input
                id="tr-date"
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-10 w-full rounded-[12px] border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-primary focus:shadow-[var(--ring)]"
              />
            </div>
            <div>
              <label htmlFor="tr-desc" className="mb-1.5 block text-[13px] font-medium text-ink-2">
                Descrição
              </label>
              <input
                id="tr-desc"
                required
                maxLength={200}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="h-10 w-full rounded-[12px] border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-primary focus:shadow-[var(--ring)]"
              />
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2.5 rounded-[12px] bg-surface-2 px-[15px] py-3 text-[12.5px] leading-snug text-ink-2">
            <Info className="h-4 w-4 shrink-0" strokeWidth={1.85} />
            <span>Move saldo entre contas — não entra como gasto nem receita no mês.</span>
          </div>

          <button
            type="submit"
            disabled={!ready || saving}
            className="mt-[18px] h-[54px] w-full rounded-full bg-primary text-base font-semibold text-white transition-colors hover:bg-primary-hover disabled:opacity-50"
          >
            {saving
              ? 'Transferindo…'
              : amountCents > 0
                ? `Transferir ${brl(amountCents)}`
                : 'Transferir'}
          </button>
        </form>
      )}
    </div>
  );
}

/**
 * Cartão "De"/"Para": visual do design com um `<select>` nativo invisível por
 * cima. No celular isso abre o seletor do sistema, que é mais fácil de acertar
 * com o dedo do que uma lista customizada.
 */
function AccountPicker({
  label,
  account,
  accounts,
  value,
  onChange,
}: {
  label: string;
  account: Account | null;
  accounts: Account[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="relative rounded-[16px] border border-[var(--card-border)] bg-surface px-[18px] py-4 shadow-[var(--card-shadow)] focus-within:border-primary">
      <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-2">
        {label}
      </div>
      <div className="flex items-center gap-3">
        <span
          className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px] font-manrope text-[15px] font-extrabold text-white"
          style={{ background: account?.color ?? 'var(--surface-2)' }}
        >
          {account ? accountMark(account.name, account.type) : '?'}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-manrope text-[15px] font-semibold text-ink">
            {account?.name ?? 'Selecione uma conta'}
          </div>
          <div className="text-xs text-ink-2">
            {account ? `saldo ${brl(account.balanceCents)}` : '—'}
          </div>
        </div>
        <ChevronDown className="h-4 w-4 shrink-0 text-ink-2" />
      </div>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      >
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
    </div>
  );
}
