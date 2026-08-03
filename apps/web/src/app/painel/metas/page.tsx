'use client';

import { formatInSaoPaulo } from '@cifrao/shared';
import { Info, Pencil, Plus, Target, Trash2 } from 'lucide-react';
import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Input, Label, Select } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { type Account, type Goal, api } from '@/lib/api';
import { brl, centsFromInput } from '@/lib/format';
import { monthLong } from '@/lib/month';
import { cn } from '@/lib/utils';

export default function MetasPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [g, a] = await Promise.all([api<Goal[]>('/goals'), api<Account[]>('/accounts')]);
      setGoals(g);
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">Metas</h1>
          <p className="text-sm text-ink-2">
            Cada meta acompanha o saldo de uma conta que já existe.
          </p>
        </div>
        <GoalDialog accounts={accounts} onSaved={load}>
          <Button>
            <Plus className="h-4 w-4" /> Nova meta
          </Button>
        </GoalDialog>
      </div>

      <Card className="flex items-start gap-2 bg-surface-2 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p className="text-xs text-ink-2">
          A meta <strong className="text-ink">não move dinheiro</strong> e não cria saldo paralelo: o
          progresso é lido do saldo da conta vinculada. Guardar dinheiro é transferir para a conta —
          a meta só mede.
        </p>
      </Card>

      {loading ? (
        <p className="text-sm text-ink-2">Carregando…</p>
      ) : goals.length === 0 ? (
        <Card className="text-center text-sm text-ink-2">
          Nenhuma meta ainda. Crie a primeira apontando para uma conta ou investimento.
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {goals.map((goal) => (
            <GoalCard key={goal.id} goal={goal} accounts={accounts} onChanged={load} />
          ))}
        </div>
      )}
    </div>
  );
}

function GoalCard({
  goal,
  accounts,
  onChanged,
}: {
  goal: Goal;
  accounts: Account[];
  onChanged: () => void;
}) {
  const paceLabel =
    goal.paceSource === 'history'
      ? 'ritmo dos últimos 3 meses'
      : goal.paceSource === 'contribution'
        ? 'aporte declarado'
        : null;

  async function excluir() {
    if (!confirm(`Excluir a meta "${goal.name}"? Isso não mexe no saldo da conta.`)) return;
    try {
      await api(`/goals/${goal.id}`, { method: 'DELETE' });
      toast.success('Meta excluída. Nenhum saldo foi alterado.');
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
            <Target className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-semibold text-ink">{goal.name}</p>
            <p className="truncate text-xs text-ink-2">
              vinculada a {goal.linkedAccount.name}
              {goal.deadline ? ` · até ${formatInSaoPaulo(new Date(goal.deadline))}` : ''}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          <GoalDialog goal={goal} accounts={accounts} onSaved={onChanged}>
            <Button variant="ghost" size="icon" title="Editar">
              <Pencil className="h-4 w-4" />
            </Button>
          </GoalDialog>
          <Button variant="ghost" size="icon" title="Excluir" onClick={excluir}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div>
        <p className="font-manrope text-2xl font-bold tabular-nums text-ink">
          {brl(goal.currentCents)}
          <span className="text-sm font-semibold text-ink-2"> / {brl(goal.targetCents)}</span>
        </p>
        <div className="mt-2">
          <Progress value={goal.percent} barClassName={goal.reached ? 'bg-positive' : 'bg-primary'} />
        </div>
        <div className="mt-1 flex justify-between text-xs text-ink-2">
          <span>{Math.round(goal.percent)}%</span>
          <span>{goal.reached ? 'Alcançada 🎉' : `faltam ${brl(goal.remainingCents)}`}</span>
        </div>
      </div>

      <div className="rounded-[12px] bg-surface-2 px-3 py-2 text-xs text-ink-2">
        {goal.reached ? (
          <span className="text-positive">Meta batida — o saldo vinculado já cobre o alvo.</span>
        ) : goal.etaMonths === null ? (
          <>
            Sem ritmo de crescimento no saldo vinculado. Defina um aporte mensal para estimar o
            prazo.
          </>
        ) : (
          <>
            No ritmo atual ({brl(goal.paceCents)}/mês, {paceLabel}):{' '}
            <strong className="text-ink">
              {goal.etaMonths} {goal.etaMonths === 1 ? 'mês' : 'meses'}
            </strong>
            {goal.etaMonth ? <span className="capitalize"> · {monthLong(goal.etaMonth)}</span> : null}
            {goal.onTrack !== null && (
              <span className={cn('ml-1 font-medium', goal.onTrack ? 'text-positive' : 'text-negative')}>
                {goal.onTrack ? '· dentro do prazo' : '· fora do prazo'}
              </span>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

function GoalDialog({
  goal,
  accounts,
  onSaved,
  children,
}: {
  goal?: Goal;
  accounts: Account[];
  onSaved: () => void;
  children: ReactNode;
}) {
  const editing = Boolean(goal);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(goal?.name ?? '');
  const [target, setTarget] = useState(
    goal ? (Number(goal.targetCents) / 100).toFixed(2).replace('.', ',') : '',
  );
  const [accountId, setAccountId] = useState(goal?.linkedAccount.id ?? '');
  const [deadline, setDeadline] = useState(goal?.deadline ? goal.deadline.slice(0, 10) : '');
  const [contribution, setContribution] = useState(
    goal?.monthlyContributionCents
      ? (Number(goal.monthlyContributionCents) / 100).toFixed(2).replace('.', ',')
      : '',
  );
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const body = {
      name,
      targetCents: centsFromInput(target),
      linkedAccountId: accountId || accounts[0]?.id,
      deadline: deadline ? `${deadline}T12:00:00` : null,
      monthlyContributionCents: contribution ? centsFromInput(contribution) : null,
    };
    try {
      if (editing && goal) {
        await api(`/goals/${goal.id}`, { method: 'PATCH', body: JSON.stringify(body) });
        toast.success('Meta atualizada.');
      } else {
        await api('/goals', { method: 'POST', body: JSON.stringify(body) });
        toast.success('Meta criada. Nenhum saldo foi movido.');
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
      <DialogContent title={editing ? 'Editar meta' : 'Nova meta'}>
        <form className="space-y-3" onSubmit={submit}>
          <div className="space-y-1">
            <Label htmlFor="goal-name">Nome</Label>
            <Input
              id="goal-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Reserva de emergência"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="goal-target">Valor alvo</Label>
            <Input
              id="goal-target"
              required
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="0,00"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="goal-account">Conta vinculada</Label>
            <Select
              id="goal-account"
              required
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
            >
              <option value="">Selecione…</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {brl(a.balanceCents)}
                </option>
              ))}
            </Select>
            <p className="text-xs text-ink-2">O progresso é o saldo desta conta, lido como está.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="goal-deadline">Prazo (opcional)</Label>
              <Input
                id="goal-deadline"
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="goal-contrib">Aporte mensal (opcional)</Label>
              <Input
                id="goal-contrib"
                value={contribution}
                onChange={(e) => setContribution(e.target.value)}
                placeholder="0,00"
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
