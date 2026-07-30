'use client';

import { TRANSACTION_STATUSES, type TransactionStatus, formatInSaoPaulo } from '@cifrao/shared';
import { type FormEvent, type ReactNode, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { type Account, type Category, type Tag, type Transaction, api } from '@/lib/api';
import { centsFromInput } from '@/lib/format';
import { cn } from '@/lib/utils';

type FormType = 'EXPENSE' | 'INCOME' | 'TRANSFER';

const STATUS_LABEL: Record<TransactionStatus, string> = {
  PENDING: 'Pendente',
  CLEARED: 'Efetivado',
  FORECAST: 'Previsto',
};
const TYPE_LABEL: Record<FormType, string> = {
  EXPENSE: 'Despesa',
  INCOME: 'Receita',
  TRANSFER: 'Transferência',
};

function todayInSp(): string {
  return formatInSaoPaulo(new Date(), 'yyyy-MM-dd');
}
function centsToInput(cents: string): string {
  return (Number(cents) / 100).toFixed(2).replace('.', ',');
}

export function TransactionDialog({
  transaction,
  accounts,
  categories,
  tags,
  onSaved,
  children,
}: {
  transaction?: Transaction;
  accounts: Account[];
  categories: Category[];
  tags: Tag[];
  onSaved: () => void;
  children: ReactNode;
}) {
  const editing = Boolean(transaction);
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<FormType>(
    (transaction?.type as FormType) ?? 'EXPENSE',
  );
  const [amount, setAmount] = useState(
    transaction ? centsToInput(transaction.amountCents) : '',
  );
  const [date, setDate] = useState(
    transaction ? formatInSaoPaulo(new Date(transaction.date), 'yyyy-MM-dd') : todayInSp(),
  );
  const [description, setDescription] = useState(transaction?.description ?? '');
  const [status, setStatus] = useState<TransactionStatus>(transaction?.status ?? 'CLEARED');
  const [accountId, setAccountId] = useState(
    transaction?.account?.id ?? accounts[0]?.id ?? '',
  );
  const [fromAccountId, setFromAccountId] = useState(
    transaction?.fromAccount?.id ?? accounts[0]?.id ?? '',
  );
  const [toAccountId, setToAccountId] = useState(
    transaction?.toAccount?.id ?? accounts[1]?.id ?? '',
  );
  const [categoryId, setCategoryId] = useState(transaction?.category?.id ?? '');
  const [notes, setNotes] = useState(transaction?.notes ?? '');
  const [isReimbursable, setIsReimbursable] = useState(transaction?.isReimbursable ?? false);
  const [selectedTags, setSelectedTags] = useState<string[]>(
    transaction?.tags.map((t) => t.tag.id) ?? [],
  );
  const [saving, setSaving] = useState(false);

  function toggleTag(id: string) {
    setSelectedTags((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const amountCents = centsFromInput(amount);
      const isoDate = new Date(`${date}T12:00:00.000Z`).toISOString();
      if (editing && transaction) {
        await api(`/transactions/${transaction.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            amountCents,
            date: isoDate,
            description,
            status,
            notes: notes || null,
            categoryId: type === 'TRANSFER' ? undefined : categoryId || null,
            isReimbursable,
            tagIds: selectedTags,
          }),
        });
        toast.success('Lançamento atualizado.');
      } else if (type === 'TRANSFER') {
        await api('/transactions', {
          method: 'POST',
          body: JSON.stringify({
            type,
            fromAccountId,
            toAccountId,
            amountCents,
            date: isoDate,
            description,
            status,
            notes: notes || undefined,
          }),
        });
        toast.success('Transferência criada.');
      } else {
        await api('/transactions', {
          method: 'POST',
          body: JSON.stringify({
            type,
            accountId,
            amountCents,
            date: isoDate,
            description,
            status,
            notes: notes || undefined,
            categoryId: categoryId || undefined,
            isReimbursable,
            tagIds: selectedTags,
          }),
        });
        toast.success(`${TYPE_LABEL[type]} criada.`);
      }
      setOpen(false);
      onSaved();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const kindCategories = categories.filter(
    (c) => c.kind === 'BOTH' || (type === 'EXPENSE' ? c.kind === 'EXPENSE' : c.kind === 'INCOME'),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent title={editing ? 'Editar lançamento' : 'Novo lançamento'}>
        <form className="max-h-[70vh] space-y-3 overflow-y-auto pr-1" onSubmit={submit}>
          {!editing && (
            <div className="flex gap-1 rounded-[12px] bg-surface-2 p-1">
              {(['EXPENSE', 'INCOME', 'TRANSFER'] as FormType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={cn(
                    'flex-1 rounded-[9px] px-3 py-1.5 text-sm font-medium transition-colors',
                    type === t ? 'bg-surface text-ink shadow-sm' : 'text-ink-2',
                  )}
                >
                  {TYPE_LABEL[t]}
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="tx-amount">Valor</Label>
              <Input
                id="tx-amount"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="tx-date">Data</Label>
              <Input
                id="tx-date"
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="tx-desc">Descrição</Label>
            <Input
              id="tx-desc"
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {type === 'TRANSFER' && !editing ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="tx-from">De</Label>
                <Select id="tx-from" value={fromAccountId} onChange={(e) => setFromAccountId(e.target.value)}>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="tx-to">Para</Label>
                <Select id="tx-to" value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          ) : (
            !editing && (
              <div className="space-y-1">
                <Label htmlFor="tx-account">Conta</Label>
                <Select id="tx-account" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </div>
            )
          )}

          {type !== 'TRANSFER' && (
            <div className="space-y-1">
              <Label htmlFor="tx-cat">Categoria</Label>
              <Select id="tx-cat" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">Sem categoria</option>
                {kindCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor="tx-status">Situação</Label>
            <Select
              id="tx-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as TransactionStatus)}
            >
              {TRANSACTION_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </div>

          {tags.length > 0 && type !== 'TRANSFER' && (
            <div className="space-y-1">
              <Label>Tags</Label>
              <div className="flex flex-wrap gap-2">
                {tags.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggleTag(t.id)}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                      selectedTags.includes(t.id)
                        ? 'border-primary bg-primary-soft text-primary'
                        : 'border-line text-ink-2',
                    )}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {type === 'EXPENSE' && (
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={isReimbursable}
                onChange={(e) => setIsReimbursable(e.target.checked)}
              />
              Reembolsável
            </label>
          )}

          <div className="space-y-1">
            <Label htmlFor="tx-notes">Observações</Label>
            <Textarea
              id="tx-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
