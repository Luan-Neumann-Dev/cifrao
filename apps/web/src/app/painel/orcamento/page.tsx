'use client';

import { ChevronLeft, ChevronRight, Plus, Trash2, Wand2 } from 'lucide-react';
import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Input, Label, Select } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  type BudgetList,
  type BudgetSuggestions,
  type Category,
  api,
} from '@/lib/api';
import { brl, centsFromInput } from '@/lib/format';
import { cn } from '@/lib/utils';
import { addMonthKey, monthLong, thisMonthKey } from '@/lib/month';

export default function OrcamentoPage() {
  const [month, setMonth] = useState(thisMonthKey);
  const [data, setData] = useState<BudgetList | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [budgets, cats] = await Promise.all([
        api<BudgetList>(`/budgets?month=${month}`),
        api<Category[]>('/categories'),
      ]);
      setData(budgets);
      setCategories(cats);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = data?.totals;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">Orçamento</h1>
          <p className="text-sm text-ink-2">
            Limite mensal por categoria, com a média diária do que ainda dá para gastar.
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => setMonth(addMonthKey(month, -1))} title="Mês anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="w-40 text-center text-sm font-medium capitalize text-ink">{monthLong(month)}</span>
          <Button variant="ghost" size="icon" onClick={() => setMonth(addMonthKey(month, 1))} title="Próximo mês">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {totals && (
        <Card className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-xs text-ink-2">Gasto do mês sobre o limite total</p>
              <p className="font-manrope text-3xl font-extrabold tabular-nums text-ink">
                {brl(totals.spentCents)}
                <span className="text-base font-semibold text-ink-2"> / {brl(totals.limitCents)}</span>
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-ink-2">
                {totals.over ? 'Estourado em' : 'Ainda dá para gastar'}
              </p>
              <p
                className={cn(
                  'font-manrope text-xl font-bold tabular-nums',
                  totals.over ? 'text-negative' : 'text-positive',
                )}
              >
                {brl(totals.over ? -Number(totals.remainingCents) : totals.remainingCents)}
              </p>
              {!totals.over && data && data.daysRemaining > 0 && (
                <p className="text-xs text-ink-2">
                  {brl(totals.dailyAllowanceCents)}/dia em {data.daysRemaining} dias
                </p>
              )}
            </div>
          </div>
          <Progress
            value={totals.percentUsed}
            barClassName={totals.over ? 'bg-negative' : 'bg-primary'}
          />
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        <BudgetDialog month={month} categories={categories} onSaved={load}>
          <Button>
            <Plus className="h-4 w-4" /> Definir limite
          </Button>
        </BudgetDialog>
        <SuggestionsDialog month={month} onApplied={load}>
          <Button variant="ghost">
            <Wand2 className="h-4 w-4" /> Sugerir limites
          </Button>
        </SuggestionsDialog>
      </div>

      {loading ? (
        <p className="text-sm text-ink-2">Carregando…</p>
      ) : !data || data.items.length === 0 ? (
        <Card className="space-y-2 text-center">
          <p className="text-sm text-ink-2">
            Nenhum limite definido para {monthLong(month)}.
          </p>
          <p className="text-xs text-ink-2">
            Use <strong>Sugerir limites</strong> para partir da média dos seus últimos 3 meses.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {data.items.map((item) => (
            <Card key={item.id} className="space-y-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ background: item.category.color ?? 'var(--primary)' }}
                  />
                  <p className="truncate font-semibold text-ink">{item.category.name}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <BudgetDialog
                    month={month}
                    categories={categories}
                    initial={{ categoryId: item.categoryId, limitCents: item.limitCents }}
                    onSaved={load}
                  >
                    <Button variant="ghost" size="sm">
                      Editar
                    </Button>
                  </BudgetDialog>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Remover limite"
                    onClick={async () => {
                      try {
                        await api(`/budgets/${item.id}`, { method: 'DELETE' });
                        toast.success('Limite removido.');
                        void load();
                      } catch (e) {
                        toast.error((e as Error).message);
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="tabular-nums text-ink">
                  {brl(item.spentCents)}{' '}
                  <span className="text-ink-2">de {brl(item.limitCents)}</span>
                </span>
                <span
                  className={cn(
                    'shrink-0 text-xs font-medium',
                    item.over ? 'text-negative' : item.percentUsed >= 80 ? 'text-warn' : 'text-ink-2',
                  )}
                >
                  {Math.round(item.percentUsed)}%
                </span>
              </div>

              <Progress
                value={item.percentUsed}
                barClassName={
                  item.over ? 'bg-negative' : item.percentUsed >= 80 ? 'bg-warn' : 'bg-primary'
                }
              />

              <p className="text-xs text-ink-2">
                {item.over ? (
                  <span className="text-negative">
                    Estourou {brl(-Number(item.remainingCents))} do limite.
                  </span>
                ) : item.daysRemaining > 0 ? (
                  <>
                    Restam {brl(item.remainingCents)} — dá {brl(item.dailyAllowanceCents)} por dia nos{' '}
                    {item.daysRemaining} dias que faltam.
                  </>
                ) : (
                  <>Restaram {brl(item.remainingCents)} no fim do mês.</>
                )}
              </p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function BudgetDialog({
  month,
  categories,
  initial,
  onSaved,
  children,
}: {
  month: string;
  categories: Category[];
  initial?: { categoryId: string; limitCents: string };
  onSaved: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? '');
  const [limit, setLimit] = useState(
    initial ? (Number(initial.limitCents) / 100).toFixed(2).replace('.', ',') : '',
  );
  const [saving, setSaving] = useState(false);

  const expenseCategories = categories.filter((c) => c.kind !== 'INCOME');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api('/budgets', {
        method: 'PUT',
        body: JSON.stringify({
          categoryId: categoryId || expenseCategories[0]?.id,
          month,
          limitCents: centsFromInput(limit),
        }),
      });
      toast.success('Limite salvo.');
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
      <DialogContent title={initial ? 'Editar limite' : 'Definir limite'}>
        <form className="space-y-3" onSubmit={submit}>
          <div className="space-y-1">
            <Label htmlFor="bud-cat">Categoria</Label>
            <Select
              id="bud-cat"
              required
              value={categoryId}
              disabled={Boolean(initial)}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">Selecione…</option>
              {expenseCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="bud-limit">Limite mensal</Label>
            <Input
              id="bud-limit"
              required
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
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
              {saving ? 'Salvando…' : 'Salvar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SuggestionsDialog({
  month,
  onApplied,
  children,
}: {
  month: string;
  onApplied: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<BudgetSuggestions | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    api<BudgetSuggestions>(`/budgets/suggestions?month=${month}`)
      .then((d) => {
        setData(d);
        setSelected(new Set(d.items.map((i) => i.categoryId)));
      })
      .catch((e) => toast.error((e as Error).message));
  }, [open, month]);

  async function apply() {
    setBusy(true);
    try {
      const res = await api<{ applied: number }>('/budgets/apply-suggestions', {
        method: 'POST',
        body: JSON.stringify({ month, categoryIds: [...selected] }),
      });
      toast.success(`${res.applied} limite(s) aplicado(s).`);
      setOpen(false);
      onApplied();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent title="Sugerir limites">
        <p className="text-sm text-ink-2">
          Média do gasto nos últimos {data?.months ?? 3} meses por categoria. Marque o que quiser
          aplicar em {monthLong(month)}.
        </p>
        {!data ? (
          <p className="text-sm text-ink-2">Calculando…</p>
        ) : data.items.length === 0 ? (
          <p className="text-sm text-ink-2">Sem histórico de gastos para sugerir.</p>
        ) : (
          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {data.items.map((s) => (
              <li key={s.categoryId}>
                <label className="flex cursor-pointer items-center gap-2 rounded-[8px] px-1 py-1.5 text-sm hover:bg-surface-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[var(--primary)]"
                    checked={selected.has(s.categoryId)}
                    onChange={(e) => {
                      const next = new Set(selected);
                      if (e.target.checked) next.add(s.categoryId);
                      else next.delete(s.categoryId);
                      setSelected(next);
                    }}
                  />
                  <span className="min-w-0 flex-1 truncate text-ink">
                    {s.category?.name ?? 'Categoria'}
                  </span>
                  {s.currentLimitCents && (
                    <span className="shrink-0 text-xs text-ink-2 line-through">
                      {brl(s.currentLimitCents)}
                    </span>
                  )}
                  <span className="shrink-0 tabular-nums font-medium text-ink">
                    {brl(s.suggestedCents)}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <DialogClose asChild>
            <Button type="button" variant="ghost">
              Cancelar
            </Button>
          </DialogClose>
          <Button onClick={apply} disabled={busy || !data || selected.size === 0}>
            {busy ? 'Aplicando…' : `Aplicar (${selected.size})`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
