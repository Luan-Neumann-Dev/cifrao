'use client';

import { Plus, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { type Category, type SplitsResponse, type Transaction, api } from '@/lib/api';
import { brl, centsFromInput } from '@/lib/format';

interface Part {
  categoryId: string;
  /** Texto do campo; vira centavos só na hora de salvar. */
  amount: string;
}

function parseCents(input: string): number {
  if (!input.trim()) return 0;
  try {
    const cents = centsFromInput(input);
    return Number.isFinite(cents) ? cents : 0;
  } catch {
    return 0;
  }
}
function centsToInput(cents: string | number): string {
  return (Number(cents) / 100).toFixed(2).replace('.', ',');
}

/**
 * Divide um lançamento entre categorias. A soma das partes tem que fechar com o
 * valor: o restante aparece o tempo todo, e o botão só libera quando zera.
 */
export function SplitEditor({
  transaction,
  categories,
  onClose,
  onSaved,
}: {
  transaction: Transaction;
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const totalCents = Number(transaction.amountCents);
  const [parts, setParts] = useState<Part[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<SplitsResponse>(`/transactions/${transaction.id}/splits`)
      .then((r) => {
        setParts(
          r.splits.length > 0
            ? r.splits.map((s) => ({
                categoryId: s.category.id,
                amount: centsToInput(s.amountCents),
              }))
            : // Começa com duas linhas: a categoria atual com tudo e uma vazia.
              [
                { categoryId: transaction.category?.id ?? '', amount: centsToInput(totalCents) },
                { categoryId: '', amount: '' },
              ],
        );
      })
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [transaction.id, transaction.category?.id, totalCents]);

  const somaCents = useMemo(
    () => parts.reduce((sum, p) => sum + parseCents(p.amount), 0),
    [parts],
  );
  const restanteCents = totalCents - somaCents;
  const preenchidas = parts.filter((p) => p.categoryId && parseCents(p.amount) > 0);
  const podeSalvar = restanteCents === 0 && preenchidas.length >= 2;

  function update(index: number, patch: Partial<Part>) {
    setParts((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  /** Joga o que falta na linha, para não obrigar a fechar a conta de cabeça. */
  function fillRest(index: number) {
    const outras = parts.reduce(
      (sum, p, i) => (i === index ? sum : sum + parseCents(p.amount)),
      0,
    );
    update(index, { amount: centsToInput(Math.max(0, totalCents - outras)) });
  }

  async function save() {
    setSaving(true);
    try {
      await api(`/transactions/${transaction.id}/splits`, {
        method: 'PUT',
        body: JSON.stringify({
          splits: preenchidas.map((p) => ({
            categoryId: p.categoryId,
            amountCents: parseCents(p.amount),
          })),
        }),
      });
      toast.success('Lançamento dividido entre categorias.');
      onSaved();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function undoSplit() {
    setSaving(true);
    try {
      await api(`/transactions/${transaction.id}/splits`, {
        method: 'PUT',
        body: JSON.stringify({ splits: [] }),
      });
      toast.success('Divisão desfeita.');
      onSaved();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent sheet hideClose className="z-[60] p-0">
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex justify-center pt-2.5 sm:hidden">
            <span className="h-[5px] w-[38px] rounded-full bg-line" />
          </div>

          <div className="flex items-center justify-between px-[22px] pb-1.5 pt-[18px]">
            <DialogTitle className="font-manrope text-[19px] font-bold text-ink">
              Dividir entre categorias
            </DialogTitle>
            <button
              type="button"
              onClick={onClose}
              className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] bg-surface-2 text-ink-2 transition-colors hover:text-ink"
            >
              <X className="h-[17px] w-[17px]" />
              <span className="sr-only">Fechar</span>
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-[22px] pt-1.5">
            <p className="mb-4 text-sm leading-relaxed text-ink-2">
              {transaction.description} · {brl(totalCents)}. As partes precisam somar exatamente
              esse valor.
            </p>

            {loading ? (
              <p className="text-sm text-ink-2">Carregando…</p>
            ) : (
              <div className="flex flex-col gap-2">
                {parts.map((part, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <select
                      aria-label={`Categoria da parte ${index + 1}`}
                      value={part.categoryId}
                      onChange={(e) => update(index, { categoryId: e.target.value })}
                      className="h-11 min-w-0 flex-1 rounded-[12px] border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-primary"
                    >
                      <option value="">Categoria…</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <div className="flex h-11 w-[130px] shrink-0 items-center gap-1.5 rounded-[12px] border border-line bg-surface px-3 focus-within:border-primary">
                      <span className="text-[13px] text-ink-2">R$</span>
                      <input
                        aria-label={`Valor da parte ${index + 1}`}
                        inputMode="decimal"
                        value={part.amount}
                        onChange={(e) => update(index, { amount: e.target.value })}
                        onDoubleClick={() => fillRest(index)}
                        placeholder="0,00"
                        className="w-full bg-transparent font-manrope text-sm font-semibold tabular-nums text-ink outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      aria-label={`Remover parte ${index + 1}`}
                      onClick={() => setParts((prev) => prev.filter((_, i) => i !== index))}
                      disabled={parts.length <= 2}
                      className="flex h-11 w-9 shrink-0 items-center justify-center rounded-[12px] text-ink-2 transition-colors hover:text-negative disabled:opacity-30"
                    >
                      <Trash2 className="h-4 w-4" strokeWidth={1.85} />
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => setParts((prev) => [...prev, { categoryId: '', amount: '' }])}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-[12px] border border-dashed border-line text-sm font-semibold text-primary transition-colors hover:border-primary hover:bg-primary-soft"
                >
                  <Plus className="h-4 w-4" />
                  Outra categoria
                </button>

                <div
                  className="mt-1 flex items-center justify-between rounded-[12px] px-4 py-3 text-sm"
                  style={{
                    background:
                      restanteCents === 0
                        ? 'color-mix(in srgb, var(--positive) 12%, transparent)'
                        : 'var(--surface-2)',
                  }}
                >
                  <span className="text-ink-2">
                    {restanteCents === 0
                      ? 'Fecha certinho'
                      : restanteCents > 0
                        ? 'Falta distribuir'
                        : 'Passou do valor'}
                  </span>
                  <span
                    className="font-manrope font-bold tabular-nums"
                    style={{
                      color: restanteCents === 0 ? 'var(--positive)' : 'var(--ink)',
                    }}
                  >
                    {restanteCents < 0 ? '−' : ''} {brl(Math.abs(restanteCents))}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="sticky bottom-0 mt-4 flex gap-2.5 border-t border-line bg-surface px-[22px] pb-[calc(16px+env(safe-area-inset-bottom))] pt-4">
            <button
              type="button"
              onClick={undoSplit}
              disabled={saving}
              className="h-[52px] rounded-full border border-line px-5 text-sm font-semibold text-ink transition-colors hover:bg-surface-2 disabled:opacity-50"
            >
              Desfazer divisão
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!podeSalvar || saving}
              className="h-[52px] flex-1 rounded-full bg-primary text-base font-semibold text-white transition-colors hover:bg-primary-hover disabled:opacity-50"
            >
              {saving ? 'Salvando…' : 'Salvar divisão'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
