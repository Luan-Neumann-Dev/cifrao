'use client';

import { Info, Pencil, Plus, Trash2, Wand2 } from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Input, Label, Select } from '@/components/ui/input';
import { type CategoryRule, type Category, api } from '@/lib/api';
import { brl, centsFromInput } from '@/lib/format';
import { cn } from '@/lib/utils';

export default function RegrasPage() {
  const [rules, setRules] = useState<CategoryRule[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [teste, setTeste] = useState('');
  const [resultado, setResultado] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [r, c] = await Promise.all([
        api<CategoryRule[]>('/category-rules'),
        api<Category[]>('/categories'),
      ]);
      setRules(r);
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

  // Testa a descrição contra as regras — mostra qual venceria.
  useEffect(() => {
    if (!teste.trim()) {
      setResultado(null);
      return;
    }
    const timer = setTimeout(() => {
      api<{ matched: { category: { name: string } | null } | null }>(
        `/category-rules/test?description=${encodeURIComponent(teste)}&amountCents=0`,
      )
        .then((r) => setResultado(r.matched?.category?.name ?? 'nenhuma regra casou'))
        .catch(() => setResultado(null));
    }, 300);
    return () => clearTimeout(timer);
  }, [teste]);

  async function alternar(rule: CategoryRule) {
    try {
      await api(`/category-rules/${rule.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !rule.active }),
      });
      void load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function excluir(rule: CategoryRule) {
    if (!confirm(`Excluir a regra "${rule.pattern}"?`)) return;
    try {
      await api(`/category-rules/${rule.id}`, { method: 'DELETE' });
      toast.success('Regra excluída.');
      void load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">Regras de categoria</h1>
          <p className="text-sm text-ink-2">
            Categorizam sozinhas o que você importa.{' '}
            <Link href="/painel/importar" className="font-medium text-primary hover:underline">
              Importar extrato
            </Link>
          </p>
        </div>
        <RuleDialog categories={categories} onSaved={load}>
          <Button>
            <Plus className="h-4 w-4" /> Nova regra
          </Button>
        </RuleDialog>
      </div>

      <Card className="flex items-start gap-2 bg-surface-2 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p className="text-xs text-ink-2">
          O padrão é comparado com a descrição <strong className="text-ink">normalizada</strong> (sem
          acento, sem pontuação, sem data). Ganha o padrão mais específico; empate vai para a regra
          mais usada.
        </p>
      </Card>

      <Card className="space-y-1.5">
        <Label htmlFor="teste">Testar uma descrição</Label>
        <Input
          id="teste"
          value={teste}
          onChange={(e) => setTeste(e.target.value)}
          placeholder="UBER *TRIP HELP.UBER.COM"
        />
        {resultado && (
          <p className="text-xs text-ink-2">
            Resultado: <strong className="text-ink">{resultado}</strong>
          </p>
        )}
      </Card>

      {loading ? (
        <p className="text-sm text-ink-2">Carregando…</p>
      ) : rules.length === 0 ? (
        <Card className="space-y-2 text-center">
          <p className="text-sm text-ink-2">Nenhuma regra ainda.</p>
          <p className="text-xs text-ink-2">
            Elas nascem sozinhas quando você usa{' '}
            <Wand2 className="inline h-3 w-3" /> &quot;aplicar a todos&quot; na revisão de uma
            importação.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {rules.map((rule) => (
            <Card key={rule.id} className={cn('space-y-1.5', !rule.active && 'opacity-60')}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink">
                    <code className="rounded bg-surface-2 px-1.5 py-0.5 text-[13px]">
                      {rule.pattern}
                    </code>
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-ink-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: rule.category.color ?? 'var(--primary)' }}
                    />
                    {rule.category.name}
                    {(rule.minCents || rule.maxCents) && (
                      <span>
                        · {rule.minCents ? `de ${brl(rule.minCents)}` : ''}
                        {rule.maxCents ? ` até ${brl(rule.maxCents)}` : ''}
                      </span>
                    )}
                    {rule.appliedCount > 0 && <span>· aplicada {rule.appliedCount}x</span>}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => alternar(rule)}>
                    {rule.active ? 'Pausar' : 'Ativar'}
                  </Button>
                  <RuleDialog rule={rule} categories={categories} onSaved={load}>
                    <Button variant="ghost" size="icon" title="Editar">
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </RuleDialog>
                  <Button variant="ghost" size="icon" title="Excluir" onClick={() => excluir(rule)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function RuleDialog({
  rule,
  categories,
  onSaved,
  children,
}: {
  rule?: CategoryRule;
  categories: Category[];
  onSaved: () => void;
  children: ReactNode;
}) {
  const editing = Boolean(rule);
  const [open, setOpen] = useState(false);
  const [pattern, setPattern] = useState(rule?.pattern ?? '');
  const [categoryId, setCategoryId] = useState(rule?.categoryId ?? '');
  const [min, setMin] = useState(rule?.minCents ? (Number(rule.minCents) / 100).toFixed(2) : '');
  const [max, setMax] = useState(rule?.maxCents ? (Number(rule.maxCents) / 100).toFixed(2) : '');
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const body = {
      pattern,
      categoryId,
      minCents: min ? centsFromInput(min) : null,
      maxCents: max ? centsFromInput(max) : null,
    };
    try {
      if (editing && rule) {
        await api(`/category-rules/${rule.id}`, { method: 'PATCH', body: JSON.stringify(body) });
        toast.success('Regra atualizada.');
      } else {
        await api('/category-rules', { method: 'POST', body: JSON.stringify(body) });
        toast.success('Regra criada.');
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
      <DialogContent title={editing ? 'Editar regra' : 'Nova regra'}>
        <form className="space-y-3" onSubmit={submit}>
          <div className="space-y-1">
            <Label htmlFor="rule-pattern">Padrão na descrição</Label>
            <Input
              id="rule-pattern"
              required
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder="uber"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="rule-cat">Categoria</Label>
            <Select
              id="rule-cat"
              required
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">Selecione…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="rule-min">Valor mínimo (opcional)</Label>
              <Input id="rule-min" value={min} onChange={(e) => setMin(e.target.value)} placeholder="0,00" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="rule-max">Valor máximo (opcional)</Label>
              <Input id="rule-max" value={max} onChange={(e) => setMax(e.target.value)} placeholder="0,00" />
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
