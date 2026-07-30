'use client';

import { CreditCard as CreditCardIcon, Pencil, Plus } from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Input, Label, Select } from '@/components/ui/input';
import { type Account, type CreditCard, type CreditCardWithAvailability, api } from '@/lib/api';
import { brl, centsFromInput } from '@/lib/format';

export default function CartoesPage() {
  const [cards, setCards] = useState<CreditCardWithAvailability[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [c, a] = await Promise.all([
        api<CreditCardWithAvailability[]>('/credit-cards'),
        api<Account[]>('/accounts'),
      ]);
      setCards(c);
      setAccounts(a);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">Cartões</h1>
          <p className="text-sm text-ink-2">Faturas, limites e parcelas comprometidas.</p>
        </div>
        <CreditCardDialog accounts={accounts} onSaved={load}>
          <Button>
            <Plus className="h-4 w-4" /> Novo cartão
          </Button>
        </CreditCardDialog>
      </div>

      {loading ? (
        <p className="text-sm text-ink-2">Carregando…</p>
      ) : cards.length === 0 ? (
        <Card className="text-center text-sm text-ink-2">
          Nenhum cartão ainda. Cadastre o primeiro para lançar compras e faturas.
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {cards.map((c) => (
            <Card key={c.id} className="space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="grid h-9 w-9 place-items-center rounded-[11px] text-white"
                    style={{ background: c.color ?? 'var(--primary)' }}
                  >
                    <CreditCardIcon className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="font-semibold text-ink">{c.nickname}</p>
                    <p className="text-xs text-ink-2">
                      {[c.brand, c.last4 ? `•••• ${c.last4}` : null].filter(Boolean).join(' · ') ||
                        'Cartão de crédito'}
                    </p>
                  </div>
                </div>
                <CreditCardDialog card={c} accounts={accounts} onSaved={load}>
                  <Button variant="ghost" size="icon" title="Editar">
                    <Pencil className="h-4 w-4" />
                  </Button>
                </CreditCardDialog>
              </div>

              <div>
                <p className="text-xs text-ink-2">Disponível de verdade</p>
                <p className="font-manrope text-2xl font-bold tabular-nums text-ink">
                  {brl(c.availability.availableCents)}
                </p>
                <p className="text-xs text-ink-2">
                  de {brl(c.limitCents)} · fecha dia {c.closingDay} · vence dia {c.dueDay}
                </p>
              </div>

              <Link
                href={`/painel/cartoes/${c.id}`}
                className="inline-block text-sm font-medium text-primary hover:underline"
              >
                Ver faturas e lançar compra →
              </Link>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function CreditCardDialog({
  card,
  accounts,
  onSaved,
  children,
}: {
  card?: CreditCard;
  accounts: Account[];
  onSaved: () => void;
  children: ReactNode;
}) {
  const editing = Boolean(card);
  const [open, setOpen] = useState(false);
  const [nickname, setNickname] = useState(card?.nickname ?? '');
  const [brand, setBrand] = useState(card?.brand ?? '');
  const [last4, setLast4] = useState(card?.last4 ?? '');
  const [limit, setLimit] = useState(card ? (Number(card.limitCents) / 100).toFixed(2).replace('.', ',') : '');
  const [closingDay, setClosingDay] = useState(String(card?.closingDay ?? 28));
  const [dueDay, setDueDay] = useState(String(card?.dueDay ?? 5));
  const [color, setColor] = useState(card?.color ?? '#820AD1');
  const [paymentAccount, setPaymentAccount] = useState(card?.defaultPaymentAccountId ?? '');
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        nickname,
        brand: brand || (editing ? null : undefined),
        last4: last4 || (editing ? null : undefined),
        limitCents: centsFromInput(limit),
        closingDay: Number(closingDay),
        dueDay: Number(dueDay),
        color,
        defaultPaymentAccountId: paymentAccount || (editing ? null : undefined),
      };
      if (editing && card) {
        await api(`/credit-cards/${card.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
        toast.success('Cartão atualizado.');
      } else {
        await api('/credit-cards', { method: 'POST', body: JSON.stringify(payload) });
        toast.success('Cartão criado.');
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
      <DialogContent title={editing ? 'Editar cartão' : 'Novo cartão'}>
        <form className="space-y-3" onSubmit={submit}>
          <div className="space-y-1">
            <Label htmlFor="cc-nick">Apelido</Label>
            <Input id="cc-nick" required value={nickname} onChange={(e) => setNickname(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="cc-brand">Bandeira</Label>
              <Input id="cc-brand" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Visa" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cc-last4">Final</Label>
              <Input
                id="cc-last4"
                value={last4}
                onChange={(e) => setLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="1234"
                inputMode="numeric"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="cc-limit">Limite</Label>
            <Input id="cc-limit" required value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="0,00" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="cc-closing">Dia de fechamento</Label>
              <Input
                id="cc-closing"
                type="number"
                min={1}
                max={31}
                required
                value={closingDay}
                onChange={(e) => setClosingDay(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cc-due">Dia de vencimento</Label>
              <Input
                id="cc-due"
                type="number"
                min={1}
                max={31}
                required
                value={dueDay}
                onChange={(e) => setDueDay(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="cc-pay">Conta de pagamento padrão</Label>
            <Select id="cc-pay" value={paymentAccount} onChange={(e) => setPaymentAccount(e.target.value)}>
              <option value="">Nenhuma</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="cc-color">Cor</Label>
            <input
              id="cc-color"
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
