'use client';

import { RECURRENCE_FREQUENCIES, type RecurrenceFrequency, formatInSaoPaulo } from '@cifrao/shared';
import { CheckCircle2, Pencil, Plus, RefreshCw, Repeat, Trash2 } from 'lucide-react';
import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import {
  type Account,
  type Category,
  type RecurringRule,
  type Transaction,
  api,
} from '@/lib/api';
import { brl, centsFromInput } from '@/lib/format';
import { dayLabel } from '@/lib/month';
import { cn } from '@/lib/utils';

const FREQUENCY_LABEL: Record<RecurrenceFrequency, string> = {
  WEEKLY: 'Semanal',
  MONTHLY: 'Mensal',
  QUARTERLY: 'Trimestral',
  YEARLY: 'Anual',
};

const TYPE_LABEL = { EXPENSE: 'Despesa', INCOME: 'Receita', TRANSFER: 'Transferência' } as const;
type RuleType = keyof typeof TYPE_LABEL;

export default function RecorrenciasPage() {
  const [rules, setRules] = useState<RecurringRule[]>([]);
  const [forecasts, setForecasts] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    try {
      const [r, f, a, c] = await Promise.all([
        api<RecurringRule[]>('/recurring-rules'),
        api<Transaction[]>('/recurring-rules/forecasts'),
        api<Account[]>('/accounts'),
        api<Category[]>('/categories'),
      ]);
      setRules(r);
      setForecasts(f);
      setAccounts(a);
      setCategories(c);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function gerarTudo() {
    setGenerating(true);
    try {
      const res = await api<{ rules: number; created: number }>('/recurring-rules/generate', {
        method: 'POST',
      });
      toast.success(`${res.created} previstos gerados em ${res.rules} regra(s).`);
      void load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  async function confirmar(tx: Transaction) {
    try {
      await api(`/transactions/${tx.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'CLEARED' }),
      });
      toast.success('Previsto efetivado — o saldo foi atualizado.');
      void load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">Recorrências</h1>
          <p className="text-sm text-ink-2">
            Geram lançamentos previstos por 12 meses. O cron diário mantém o horizonte rolando.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={gerarTudo} disabled={generating}>
            <RefreshCw className={cn('h-4 w-4', generating && 'animate-spin')} />
            Gerar agora
          </Button>
          <RuleDialog accounts={accounts} categories={categories} onSaved={load}>
            <Button>
              <Plus className="h-4 w-4" /> Nova recorrência
            </Button>
          </RuleDialog>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-ink-2">Carregando…</p>
      ) : rules.length === 0 ? (
        <Card className="text-center text-sm text-ink-2">
          Nenhuma recorrência ainda. Cadastre aluguel, salário, assinaturas…
        </Card>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => (
            <RuleCard
              key={rule.id}
              rule={rule}
              accounts={accounts}
              categories={categories}
              onChanged={load}
            />
          ))}
        </div>
      )}

      <Card className="space-y-3">
        <h2 className="font-semibold text-ink">Previstos gerados</h2>
        {forecasts.length === 0 ? (
          <p className="text-sm text-ink-2">Nada previsto daqui para frente.</p>
        ) : (
          <ul className="space-y-1.5">
            {forecasts.slice(0, 20).map((tx) => (
              <li key={tx.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  {tx.description}
                  <span className="text-ink-2"> · {formatInSaoPaulo(new Date(tx.date))}</span>
                </span>
                <span
                  className={cn(
                    'shrink-0 tabular-nums',
                    tx.type === 'INCOME' ? 'text-positive' : 'text-ink',
                  )}
                >
                  {tx.type === 'INCOME' ? '+' : tx.type === 'EXPENSE' ? '−' : ''}
                  {brl(tx.amountCents)}
                </span>
                <Button variant="ghost" size="sm" onClick={() => confirmar(tx)} title="Efetivar">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="hidden sm:inline">Efetivar</span>
                </Button>
              </li>
            ))}
          </ul>
        )}
        {forecasts.length > 20 && (
          <p className="text-xs text-ink-2">e mais {forecasts.length - 20} previstos…</p>
        )}
      </Card>
    </div>
  );
}

function RuleCard({
  rule,
  accounts,
  categories,
  onChanged,
}: {
  rule: RecurringRule;
  accounts: Account[];
  categories: Category[];
  onChanged: () => void;
}) {
  async function toggleAtiva() {
    try {
      await api(`/recurring-rules/${rule.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !rule.active }),
      });
      toast.success(rule.active ? 'Recorrência pausada.' : 'Recorrência reativada.');
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function excluir() {
    if (!confirm(`Excluir "${rule.description}"? Os previstos futuros somem; o histórico fica.`)) {
      return;
    }
    try {
      const res = await api<{ forecastsRemoved: number }>(`/recurring-rules/${rule.id}`, {
        method: 'DELETE',
      });
      toast.success(`Recorrência excluída (${res.forecastsRemoved} previstos removidos).`);
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const destino =
    rule.type === 'TRANSFER'
      ? `${rule.fromAccount?.name ?? '—'} → ${rule.toAccount?.name ?? '—'}`
      : (rule.account?.name ?? '—');

  return (
    <Card className={cn('space-y-2.5', !rule.active && 'opacity-60')}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
            <Repeat className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-semibold text-ink">{rule.description}</p>
            <p className="truncate text-xs text-ink-2">
              {FREQUENCY_LABEL[rule.frequency]} · {TYPE_LABEL[rule.type as RuleType] ?? rule.type} ·{' '}
              {destino}
              {rule.category ? ` · ${rule.category.name}` : ''}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[11px] font-medium',
              rule.active ? 'bg-positive/15 text-positive' : 'bg-surface-2 text-ink-2',
            )}
          >
            {rule.active ? 'ativa' : 'pausada'}
          </span>
          <RuleDialog rule={rule} accounts={accounts} categories={categories} onSaved={onChanged}>
            <Button variant="ghost" size="icon" title="Editar">
              <Pencil className="h-4 w-4" />
            </Button>
          </RuleDialog>
          <Button variant="ghost" size="icon" title="Excluir" onClick={excluir}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p
          className={cn(
            'font-manrope text-xl font-bold tabular-nums',
            rule.type === 'INCOME' ? 'text-positive' : 'text-ink',
          )}
        >
          {brl(rule.amountCents)}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {rule.nextDates.map((d) => (
            <span
              key={d}
              className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] tabular-nums text-ink-2"
            >
              {dayLabel(d)}
            </span>
          ))}
          <Button variant="ghost" size="sm" onClick={toggleAtiva}>
            {rule.active ? 'Pausar' : 'Reativar'}
          </Button>
        </div>
      </div>

      {rule.endDate && (
        <p className="text-xs text-ink-2">Termina em {formatInSaoPaulo(new Date(rule.endDate))}</p>
      )}
    </Card>
  );
}

function RuleDialog({
  rule,
  accounts,
  categories,
  onSaved,
  children,
}: {
  rule?: RecurringRule;
  accounts: Account[];
  categories: Category[];
  onSaved: () => void;
  children: ReactNode;
}) {
  const editing = Boolean(rule);
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<RuleType>((rule?.type as RuleType) ?? 'EXPENSE');
  const [description, setDescription] = useState(rule?.description ?? '');
  const [amount, setAmount] = useState(
    rule ? (Number(rule.amountCents) / 100).toFixed(2).replace('.', ',') : '',
  );
  const [frequency, setFrequency] = useState<RecurrenceFrequency>(rule?.frequency ?? 'MONTHLY');
  const [startDate, setStartDate] = useState(
    rule ? rule.startDate.slice(0, 10) : new Date().toISOString().slice(0, 10),
  );
  const [endDate, setEndDate] = useState(rule?.endDate ? rule.endDate.slice(0, 10) : '');
  const [dayOfMonth, setDayOfMonth] = useState(rule?.dayOfMonth ? String(rule.dayOfMonth) : '');
  const [accountId, setAccountId] = useState(rule?.accountId ?? '');
  const [fromAccountId, setFromAccountId] = useState(rule?.fromAccountId ?? '');
  const [toAccountId, setToAccountId] = useState(rule?.toAccountId ?? '');
  const [categoryId, setCategoryId] = useState(rule?.categoryId ?? '');
  const [notes, setNotes] = useState(rule?.notes ?? '');
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const comum = {
        description,
        amountCents: centsFromInput(amount),
        frequency,
        startDate: `${startDate}T12:00:00`,
        endDate: endDate ? `${endDate}T12:00:00` : null,
        dayOfMonth: dayOfMonth ? Number(dayOfMonth) : null,
        notes: notes || undefined,
      };
      if (editing && rule) {
        await api(`/recurring-rules/${rule.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            ...comum,
            categoryId: type === 'TRANSFER' ? null : categoryId || null,
          }),
        });
        toast.success('Recorrência atualizada e previstos futuros regerados.');
      } else {
        const body =
          type === 'TRANSFER'
            ? { ...comum, type, fromAccountId, toAccountId }
            : { ...comum, type, accountId, categoryId: categoryId || null };
        const res = await api<{ generated: number }>('/recurring-rules', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        toast.success(`Recorrência criada — ${res.generated} previstos gerados.`);
      }
      setOpen(false);
      onSaved();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const mensal = frequency !== 'WEEKLY';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent title={editing ? 'Editar recorrência' : 'Nova recorrência'}>
        <form className="max-h-[70vh] space-y-3 overflow-y-auto pr-1" onSubmit={submit}>
          {!editing && (
            <div className="flex gap-1 rounded-full bg-surface-2 p-1">
              {(Object.keys(TYPE_LABEL) as RuleType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={cn(
                    'flex-1 rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                    type === t ? 'bg-surface text-ink shadow-[var(--card-shadow)]' : 'text-ink-2',
                  )}
                >
                  {TYPE_LABEL[t]}
                </button>
              ))}
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor="rec-desc">Descrição</Label>
            <Input
              id="rec-desc"
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Aluguel"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="rec-amount">Valor</Label>
              <Input
                id="rec-amount"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="rec-freq">Frequência</Label>
              <Select
                id="rec-freq"
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as RecurrenceFrequency)}
              >
                {RECURRENCE_FREQUENCIES.map((f) => (
                  <option key={f} value={f}>
                    {FREQUENCY_LABEL[f]}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="rec-start">Início</Label>
              <Input
                id="rec-start"
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="rec-end">Fim (opcional)</Label>
              <Input
                id="rec-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          {mensal && (
            <div className="space-y-1">
              <Label htmlFor="rec-day">Dia do mês (opcional)</Label>
              <Input
                id="rec-day"
                type="number"
                min={1}
                max={31}
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(e.target.value)}
                placeholder="usa o dia do início"
              />
              <p className="text-xs text-ink-2">
                Dia maior que o mês cai no último dia (31 vira 28/29 em fevereiro).
              </p>
            </div>
          )}

          {type === 'TRANSFER' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="rec-from">De</Label>
                <Select
                  id="rec-from"
                  required
                  value={fromAccountId}
                  disabled={editing}
                  onChange={(e) => setFromAccountId(e.target.value)}
                >
                  <option value="">Selecione…</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="rec-to">Para</Label>
                <Select
                  id="rec-to"
                  required
                  value={toAccountId}
                  disabled={editing}
                  onChange={(e) => setToAccountId(e.target.value)}
                >
                  <option value="">Selecione…</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="rec-account">Conta</Label>
                <Select
                  id="rec-account"
                  required
                  value={accountId}
                  disabled={editing}
                  onChange={(e) => setAccountId(e.target.value)}
                >
                  <option value="">Selecione…</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="rec-cat">Categoria</Label>
                <Select
                  id="rec-cat"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                >
                  <option value="">Sem categoria</option>
                  {categories
                    .filter((c) => (type === 'INCOME' ? c.kind !== 'EXPENSE' : c.kind !== 'INCOME'))
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </Select>
              </div>
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor="rec-notes">Observações (opcional)</Label>
            <Textarea
              id="rec-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
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
