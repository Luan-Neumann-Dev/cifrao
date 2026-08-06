'use client';

import { SlidersVertical, X } from 'lucide-react';
import { type FormEvent, type ReactNode, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { type Account, api } from '@/lib/api';
import { adjustmentPreview } from '@/lib/accounts';
import { brl, centsFromInput } from '@/lib/format';

/** Texto livre -> centavos. Vazio ou impossível de ler vira `null`. */
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
 * Regra 5.8 — o usuário informa o saldo real do banco e o sistema lança a
 * diferença. A prévia mostra o lançamento que vai nascer antes de confirmar.
 */
export function AdjustDialog({
  account,
  onSaved,
  children,
}: {
  account: Account;
  onSaved: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [real, setReal] = useState('');
  const [saving, setSaving] = useState(false);

  const realCents = useMemo(() => parseCents(real), [real]);
  const preview = adjustmentPreview(account.balanceCents, realCents);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (preview.none || realCents === null) return;
    setSaving(true);
    try {
      await api(`/accounts/${account.id}/adjust`, {
        method: 'POST',
        body: JSON.stringify({ realBalanceCents: realCents }),
      });
      toast.success('Saldo ajustado com um lançamento.');
      setOpen(false);
      setReal('');
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
      <DialogContent sheet hideClose className="p-0">
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          {/* Puxador do sheet: só existe enquanto o modal vem de baixo. */}
          <div className="flex justify-center pt-2.5 sm:hidden">
            <span className="h-[5px] w-[38px] rounded-full bg-line" />
          </div>

          <div className="flex items-center justify-between px-[22px] pb-1.5 pt-[18px]">
            <DialogTitle className="font-manrope text-[19px] font-bold text-ink">
              Ajustar saldo
            </DialogTitle>
            <DialogClose className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] bg-surface-2 text-ink-2 transition-colors hover:text-ink">
              <X className="h-[17px] w-[17px]" />
              <span className="sr-only">Fechar</span>
            </DialogClose>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-[22px] pt-1.5">
            <p className="mb-[18px] text-sm leading-relaxed text-ink-2">
              Diga o saldo que aparece no banco. O Cifrão cria um lançamento de ajuste pra bater —
              sem apagar seu histórico.
            </p>

            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between rounded-[14px] bg-surface-2 px-4 py-3.5">
                <span className="text-[13.5px] text-ink-2">Saldo no app · {account.name}</span>
                <span className="font-manrope text-[15px] font-semibold tabular-nums text-ink">
                  {brl(account.balanceCents)}
                </span>
              </div>

              <div>
                <label
                  htmlFor="adj-real"
                  className="mb-[7px] block text-[13px] font-medium text-ink-2"
                >
                  Saldo real no banco
                </label>
                <div className="flex h-14 items-center gap-2 rounded-[14px] border-[1.5px] border-line bg-surface px-4 transition-colors focus-within:border-primary focus-within:shadow-[var(--ring)]">
                  <span className="font-manrope text-xl font-semibold text-ink-2">R$</span>
                  <input
                    id="adj-real"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0,00"
                    value={real}
                    onChange={(e) => setReal(e.target.value)}
                    className="w-full bg-transparent font-manrope text-[26px] font-bold tabular-nums text-ink outline-none placeholder:text-ink-2/40"
                  />
                </div>
              </div>

              {/* Prévia do lançamento que a diferença vai criar. */}
              <div
                className="flex items-center gap-3 rounded-[14px] px-4 py-[15px]"
                style={{ background: preview.soft }}
              >
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] text-white"
                  style={{ background: preview.color }}
                >
                  <SlidersVertical className="h-5 w-5" strokeWidth={1.85} />
                </span>
                <div className="flex-1">
                  <div className="text-[12.5px] text-ink-2">Lançamento de ajuste</div>
                  <div
                    className="mt-px font-manrope text-lg font-bold tabular-nums"
                    style={{ color: preview.color }}
                  >
                    {preview.none
                      ? brl(0)
                      : `${preview.diffCents > 0 ? '+ ' : '− '}${brl(Math.abs(preview.diffCents))}`}
                  </div>
                </div>
                <span className="max-w-[120px] text-right text-xs text-ink-2">{preview.note}</span>
              </div>
            </div>
          </div>

          <div className="sticky bottom-0 mt-[18px] border-t border-line bg-surface px-[22px] pb-[calc(16px+env(safe-area-inset-bottom))] pt-4">
            <button
              type="submit"
              disabled={preview.none || saving}
              className="h-[52px] w-full rounded-full bg-primary text-base font-semibold text-white transition-colors hover:bg-primary-hover disabled:opacity-50"
            >
              {saving ? 'Ajustando…' : preview.buttonLabel}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
