'use client';

import { ACCOUNT_TYPES, type AccountType } from '@cifrao/shared';
import { Pencil, Plus, SlidersHorizontal } from 'lucide-react';
import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Input, Label, Select } from '@/components/ui/input';
import { type Account, api } from '@/lib/api';
import { brl, centsFromInput } from '@/lib/format';

const TYPE_LABEL: Record<AccountType, string> = {
  CHECKING: 'Conta corrente',
  SAVINGS: 'Poupança',
  WALLET: 'Carteira',
  INVESTMENT: 'Investimento',
};

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

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">Contas</h1>
          <p className="text-sm text-ink-2">
            Saldo somado:{' '}
            <span className="font-semibold text-ink tabular-nums">{brl(total)}</span>
          </p>
        </div>
        <AccountDialog onSaved={load}>
          <Button>
            <Plus className="h-4 w-4" /> Nova conta
          </Button>
        </AccountDialog>
      </div>

      {loading ? (
        <p className="text-sm text-ink-2">Carregando…</p>
      ) : accounts.length === 0 ? (
        <Card className="text-center text-sm text-ink-2">
          Nenhuma conta ainda. Crie a primeira.
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {accounts.map((a) => (
            <Card key={a.id} className="space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="mt-1 h-3 w-3 rounded-full"
                    style={{ background: a.color ?? 'var(--primary)' }}
                  />
                  <div>
                    <p className="font-semibold text-ink">{a.name}</p>
                    <p className="text-xs text-ink-2">
                      {TYPE_LABEL[a.type]}
                      {a.institution ? ` · ${a.institution}` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <AdjustDialog account={a} onSaved={load}>
                    <Button variant="ghost" size="icon" title="Ajustar saldo">
                      <SlidersHorizontal className="h-4 w-4" />
                    </Button>
                  </AdjustDialog>
                  <AccountDialog account={a} onSaved={load}>
                    <Button variant="ghost" size="icon" title="Editar">
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </AccountDialog>
                </div>
              </div>
              <p className="font-manrope text-2xl font-bold tabular-nums text-ink">
                {brl(a.balanceCents)}
              </p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function AccountDialog({
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
                  {TYPE_LABEL[t]}
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
          <div className="space-y-1">
            <Label htmlFor="acc-color">Cor</Label>
            <input
              id="acc-color"
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-10 w-16 cursor-pointer rounded-[12px] border border-line bg-surface"
            />
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

function AdjustDialog({
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

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api(`/accounts/${account.id}/adjust`, {
        method: 'POST',
        body: JSON.stringify({ realBalanceCents: centsFromInput(real) }),
      });
      toast.success('Saldo ajustado (lançamento de ajuste criado).');
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
      <DialogContent title={`Ajustar saldo · ${account.name}`}>
        <p className="text-sm text-ink-2">
          Saldo atual no sistema:{' '}
          <span className="font-semibold text-ink tabular-nums">{brl(account.balanceCents)}</span>.
          Informe o saldo real do banco; a diferença vira um lançamento de ajuste.
        </p>
        <form className="space-y-3" onSubmit={submit}>
          <div className="space-y-1">
            <Label htmlFor="adj-real">Saldo real</Label>
            <Input
              id="adj-real"
              required
              value={real}
              onChange={(e) => setReal(e.target.value)}
              placeholder="0,00"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" disabled={saving}>
              {saving ? 'Ajustando…' : 'Ajustar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
