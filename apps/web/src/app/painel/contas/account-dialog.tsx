'use client';

import { ACCOUNT_TYPES, type AccountType } from '@cifrao/shared';
import { type FormEvent, type ReactNode, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Input, Label, Select } from '@/components/ui/input';
import { type Account, api } from '@/lib/api';
import { ACCOUNT_TYPE_LABEL } from '@/lib/accounts';
import { centsFromInput } from '@/lib/format';

/** Paleta de atalho: as cores das instituições que mais aparecem por aqui. */
const SWATCHES = [
  '#820AD1',
  '#FF7A00',
  '#00A868',
  '#0F9B8E',
  '#EC4899',
  '#F5A524',
  '#3B82F6',
  '#6B6577',
];

export function AccountDialog({
  account,
  onSaved,
  children,
}: {
  account?: Account;
  onSaved: () => void;
  children: ReactNode;
}) {
  const editing = Boolean(account);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(account?.name ?? '');
  const [type, setType] = useState<AccountType>(account?.type ?? 'CHECKING');
  const [institution, setInstitution] = useState(account?.institution ?? '');
  const [initial, setInitial] = useState('0');
  const [color, setColor] = useState(account?.color ?? '#820AD1');
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing && account) {
        await api(`/accounts/${account.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ name, type, institution: institution || null, color }),
        });
        toast.success('Conta atualizada.');
      } else {
        await api('/accounts', {
          method: 'POST',
          body: JSON.stringify({
            name,
            type,
            institution: institution || undefined,
            color,
            initialBalanceCents: centsFromInput(initial),
          }),
        });
        toast.success('Conta criada.');
      }
      setOpen(false);
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
      <DialogContent title={editing ? 'Editar conta' : 'Nova conta'}>
        <form className="space-y-3" onSubmit={submit}>
          <div className="space-y-1">
            <Label htmlFor="acc-name">Nome</Label>
            <Input id="acc-name" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="acc-type">Tipo</Label>
            <Select
              id="acc-type"
              value={type}
              onChange={(e) => setType(e.target.value as AccountType)}
            >
              {ACCOUNT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {ACCOUNT_TYPE_LABEL[t]}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="acc-inst">Instituição (opcional)</Label>
            <Input
              id="acc-inst"
              value={institution}
              onChange={(e) => setInstitution(e.target.value)}
            />
          </div>
          {!editing && (
            <div className="space-y-1">
              <Label htmlFor="acc-initial">Saldo inicial</Label>
              <Input
                id="acc-initial"
                value={initial}
                onChange={(e) => setInitial(e.target.value)}
                placeholder="0,00"
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="acc-color">Cor</Label>
            <div className="flex flex-wrap items-center gap-2">
              {SWATCHES.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-label={`Cor ${s}`}
                  aria-pressed={color.toLowerCase() === s.toLowerCase()}
                  onClick={() => setColor(s)}
                  className="h-8 w-8 rounded-[10px] transition-transform hover:scale-110 aria-pressed:shadow-[var(--ring)]"
                  style={{ background: s }}
                />
              ))}
              <input
                id="acc-color"
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                title="Outra cor"
                className="h-8 w-10 cursor-pointer rounded-[10px] border border-line bg-surface"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
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
