'use client';

import { ArrowLeftRight, Check, X } from 'lucide-react';
import { type FormEvent, type ReactNode, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { type Account, type InvoiceSummary, api } from '@/lib/api';
import { accountMark } from '@/lib/accounts';
import { monthLongLabel } from '@/lib/dates';
import { brl, centsFromInput } from '@/lib/format';

function parseCents(input: string): number | null {
  if (!input.trim()) return null;
  try {
    const cents = centsFromInput(input);
    return Number.isFinite(cents) ? cents : null;
  } catch {
    return null;
  }
}

/**
 * Regra 5.6 — pagar fatura move dinheiro da conta para o cartão. Não cria
 * despesa nova: os gastos já foram contados quando lançados. O modal insiste
 * nisso porque é o ponto onde todo app de finanças costuma contar em dobro.
 */
export function PayInvoiceDialog({
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
  const [mode, setMode] = useState<'total' | 'partial'>('total');
  const [partial, setPartial] = useState('');
  const [saving, setSaving] = useState(false);

  const remainingCents = Number(invoice.remainingCents);
  const partialCents = useMemo(() => parseCents(partial), [partial]);
  const amountCents = mode === 'total' ? remainingCents : (partialCents ?? 0);
  const excede = amountCents > remainingCents;
  const ready = amountCents > 0 && !excede && accountId !== '';

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setSaving(true);
    try {
      await api(`/invoices/${invoice.id}/pay`, {
        method: 'POST',
        body: JSON.stringify({ accountId, amountCents }),
      });
      toast.success(
        amountCents >= remainingCents
          ? 'Fatura quitada com uma transferência.'
          : 'Pagamento parcial registrado — o resto rola para a próxima.',
      );
      setOpen(false);
      setPartial('');
      setMode('total');
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
      <DialogContent sheet hideClose className="p-0">
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex justify-center pt-2.5 sm:hidden">
            <span className="h-[5px] w-[38px] rounded-full bg-line" />
          </div>

          <div className="flex items-center justify-between px-[22px] pb-1.5 pt-[18px]">
            <DialogTitle className="font-manrope text-[19px] font-bold text-ink">
              Pagar fatura
            </DialogTitle>
            <DialogClose className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] bg-surface-2 text-ink-2 transition-colors hover:text-ink">
              <X className="h-[17px] w-[17px]" />
              <span className="sr-only">Fechar</span>
            </DialogClose>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-[22px] pt-1.5">
            <div className="px-0 pb-1 pt-2 text-center">
              <div className="text-[13px] text-ink-2">
                Fatura de {monthLongLabel(invoice.referenceMonth)}
              </div>
              <div className="mt-1 font-manrope text-[34px] font-bold tracking-[-0.02em] tabular-nums text-ink">
                {brl(amountCents)}
              </div>
            </div>

            <div className="mt-3.5 flex items-center gap-2.5 rounded-[12px] bg-surface-2 px-3.5 py-[11px] text-[12.5px] leading-snug text-ink-2">
              <ArrowLeftRight className="h-[17px] w-[17px] shrink-0" strokeWidth={1.85} />
              <span>
                Isto é uma <b className="font-semibold text-ink">transferência</b> da sua conta pro
                cartão — não uma despesa nova. Os gastos já foram contados quando lançados.
              </span>
            </div>

            <div className="mb-2.5 mt-5 text-xs font-semibold uppercase tracking-[0.04em] text-ink-2">
              Pagar de
            </div>
            {accounts.length === 0 ? (
              <p className="text-[13px] text-ink-2">Cadastre uma conta para poder pagar.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {accounts.map((a) => {
                  const selected = a.id === accountId;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setAccountId(a.id)}
                      className="flex items-center gap-3 rounded-[14px] border-[1.5px] px-3.5 py-[13px] text-left transition-colors"
                      style={{
                        borderColor: selected ? 'var(--primary)' : 'var(--line)',
                        background: selected ? 'var(--primary-soft)' : 'var(--surface)',
                      }}
                    >
                      <span
                        className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] font-manrope text-[13px] font-bold text-white"
                        style={{ background: a.color ?? 'var(--primary)' }}
                      >
                        {accountMark(a.name, a.type)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-manrope text-[14.5px] font-semibold text-ink">
                          {a.name}
                        </div>
                        <div className="text-xs text-ink-2">saldo {brl(a.balanceCents)}</div>
                      </div>
                      {selected && (
                        <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-primary">
                          <Check className="h-[13px] w-[13px] text-white" strokeWidth={3} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="mb-2.5 mt-5 text-xs font-semibold uppercase tracking-[0.04em] text-ink-2">
              Valor
            </div>
            <div className="flex gap-2">
              <ModeButton active={mode === 'total'} onClick={() => setMode('total')}>
                Total · {brl(remainingCents)}
              </ModeButton>
              <ModeButton active={mode === 'partial'} onClick={() => setMode('partial')}>
                Parcial
              </ModeButton>
            </div>
            {mode === 'partial' && (
              <div className="mt-2">
                <div className="flex h-[46px] items-center gap-2 rounded-[12px] border border-line bg-surface px-3.5 transition-colors focus-within:border-primary focus-within:shadow-[var(--ring)]">
                  <span className="font-manrope font-semibold text-ink-2">R$</span>
                  <input
                    autoFocus
                    inputMode="decimal"
                    placeholder="0,00"
                    value={partial}
                    onChange={(e) => setPartial(e.target.value)}
                    className="w-full bg-transparent font-manrope text-[15px] font-bold tabular-nums text-ink outline-none placeholder:font-normal placeholder:text-ink-2/50"
                  />
                </div>
                {excede && (
                  <p className="mt-1.5 text-xs text-negative">
                    Acima do que resta da fatura ({brl(remainingCents)}).
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="sticky bottom-0 mt-[18px] border-t border-line bg-surface px-[22px] pb-[calc(16px+env(safe-area-inset-bottom))] pt-4">
            <button
              type="submit"
              disabled={!ready || saving}
              className="h-[52px] w-full rounded-full bg-primary text-base font-semibold text-white transition-colors hover:bg-primary-hover disabled:opacity-50"
            >
              {saving ? 'Transferindo…' : `Transferir ${brl(amountCents)}`}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-[46px] flex-1 rounded-[12px] border-[1.5px] text-sm font-semibold transition-colors"
      style={{
        borderColor: active ? 'var(--primary)' : 'var(--line)',
        background: active ? 'var(--primary-soft)' : 'var(--surface)',
        color: active ? 'var(--primary)' : 'var(--ink)',
      }}
    >
      {children}
    </button>
  );
}
