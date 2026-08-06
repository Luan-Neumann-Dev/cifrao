'use client';

import { formatInSaoPaulo, invoiceWindowForPurchase, splitInstallments } from '@cifrao/shared';
import { type FormEvent, type ReactNode, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Input, Label, Select } from '@/components/ui/input';
import { type Category, type CreditCard, api } from '@/lib/api';
import { monthLongLabel } from '@/lib/dates';
import { brl, centsFromInput } from '@/lib/format';

/** Nova compra no cartão, com a prévia de qual fatura vai receber (regra 5.3). */
export function PurchaseDialog({
  card,
  categories,
  onSaved,
  children,
}: {
  card: CreditCard;
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
      await api(`/credit-cards/${card.id}/purchases`, {
        method: 'POST',
        body: JSON.stringify({
          amountCents: centsFromInput(amount),
          // Meio-dia UTC: o dia escolhido não escorrega no fuso de São Paulo.
          date: new Date(`${date}T12:00:00.000Z`).toISOString(),
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
              <Input
                id="pu-amount"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pu-date">Data</Label>
              <Input
                id="pu-date"
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="pu-desc">Descrição</Label>
            <Input
              id="pu-desc"
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
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
                  fatura de <strong>{monthLongLabel(preview.referenceMonth)}</strong>
                </>
              ) : (
                <>
                  Entra na fatura de <strong>{monthLongLabel(preview.referenceMonth)}</strong> (fecha{' '}
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
