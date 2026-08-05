'use client';

import { Merge, Pencil, Plus, Trash2 } from 'lucide-react';
import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Input, Label, Select } from '@/components/ui/input';
import { type CategoryUsage, type MergeResult, api } from '@/lib/api';
import { brl } from '@/lib/format';
import { cn } from '@/lib/utils';
import { SectionTitle } from './perfil-section';

const KINDS = [
  { value: 'EXPENSE', label: 'Despesa' },
  { value: 'INCOME', label: 'Receita' },
  { value: 'BOTH', label: 'Ambas' },
] as const;

/** Gestão de categorias (Fase 9): criar, renomear, mesclar e apagar. */
export function CategoriasSection() {
  const [categories, setCategories] = useState<CategoryUsage[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setCategories(await api<CategoryUsage[]>('/categories/uso'));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Pai primeiro, filhas logo abaixo: é como a árvore é lida na tela.
  const parents = categories.filter((c) => !c.parentId);
  const orphans = categories.filter(
    (c) => c.parentId && !categories.some((p) => p.id === c.parentId),
  );

  return (
    <Card id="categorias" className="scroll-mt-20 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionTitle
          title="Categorias"
          hint={`${categories.length} categorias. Mesclar migra tudo e soma os limites de orçamento.`}
        />
        <div className="flex gap-2">
          <MergeDialog categories={categories} onDone={load}>
            <Button variant="ghost" size="sm">
              <Merge className="h-4 w-4" /> Mesclar
            </Button>
          </MergeDialog>
          <CategoryDialog categories={categories} onSaved={load}>
            <Button size="sm">
              <Plus className="h-4 w-4" /> Nova
            </Button>
          </CategoryDialog>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-ink-2">Carregando…</p>
      ) : (
        <ul className="divide-y divide-line">
          {[...parents, ...orphans].map((parent) => (
            <li key={parent.id} className="py-1">
              <CategoryRow category={parent} categories={categories} onChanged={load} />
              {categories
                .filter((c) => c.parentId === parent.id)
                .map((child) => (
                  <CategoryRow
                    key={child.id}
                    category={child}
                    categories={categories}
                    onChanged={load}
                    nested
                  />
                ))}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function CategoryRow({
  category,
  categories,
  onChanged,
  nested,
}: {
  category: CategoryUsage;
  categories: CategoryUsage[];
  onChanged: () => void;
  nested?: boolean;
}) {
  const usos = [
    category.transactionCount && `${category.transactionCount} lançamentos`,
    category.budgetCount && `${category.budgetCount} orçamentos`,
    category.ruleCount && `${category.ruleCount} regras`,
    category.recurringCount && `${category.recurringCount} recorrências`,
    category.childCount && `${category.childCount} subcategorias`,
  ].filter(Boolean) as string[];

  async function apagar() {
    if (!confirm(`Apagar a categoria "${category.name}"?`)) return;
    try {
      await api(`/categories/${category.id}`, { method: 'DELETE' });
      toast.success('Categoria apagada.');
      onChanged();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div className={cn('flex items-center gap-3 py-2', nested && 'pl-6')}>
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ background: category.color ?? 'var(--ink-2)' }}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{category.name}</p>
        <p className="truncate text-xs text-ink-2">
          {usos.length > 0 ? usos.join(' · ') : 'sem uso'}
        </p>
      </div>
      <CategoryDialog category={category} categories={categories} onSaved={onChanged}>
        <Button variant="ghost" size="icon" title="Editar">
          <Pencil className="h-4 w-4" />
        </Button>
      </CategoryDialog>
      <Button
        variant="ghost"
        size="icon"
        title={
          category.deletable ? 'Apagar' : 'Em uso: mescle em outra categoria para não perder nada'
        }
        disabled={!category.deletable}
        onClick={apagar}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

function CategoryDialog({
  category,
  categories,
  onSaved,
  children,
}: {
  category?: CategoryUsage;
  categories: CategoryUsage[];
  onSaved: () => void;
  children: ReactNode;
}) {
  const editando = Boolean(category);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(category?.name ?? '');
  const [kind, setKind] = useState<string>(category?.kind ?? 'EXPENSE');
  const [parentId, setParentId] = useState(category?.parentId ?? '');
  const [color, setColor] = useState(category?.color ?? '#820AD1');
  const [salvando, setSalvando] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSalvando(true);
    const body = { name: name.trim(), kind, color, parentId: parentId || null };
    try {
      if (editando && category) {
        await api(`/categories/${category.id}`, { method: 'PATCH', body: JSON.stringify(body) });
        toast.success('Categoria atualizada.');
      } else {
        await api('/categories', { method: 'POST', body: JSON.stringify(body) });
        toast.success('Categoria criada.');
      }
      setOpen(false);
      onSaved();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  // Uma categoria não pode virar filha dela mesma nem de uma subcategoria sua.
  const possiveisPais = categories.filter(
    (c) => !c.parentId && c.id !== category?.id && c.id !== category?.parentId,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent title={editando ? 'Editar categoria' : 'Nova categoria'}>
        <form className="space-y-3" onSubmit={submit}>
          <div className="space-y-1">
            <Label htmlFor="cat-nome">Nome</Label>
            <Input
              id="cat-nome"
              required
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Mercado"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="cat-tipo">Tipo</Label>
              <Select id="cat-tipo" value={kind} onChange={(e) => setKind(e.target.value)}>
                {KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="cat-pai">Categoria pai</Label>
              <Select id="cat-pai" value={parentId} onChange={(e) => setParentId(e.target.value)}>
                <option value="">Nenhuma (categoria principal)</option>
                {possiveisPais.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="cat-cor">Cor</Label>
            <div className="flex items-center gap-2">
              <input
                id="cat-cor"
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value.toUpperCase())}
                className="h-10 w-12 cursor-pointer rounded-[12px] border border-line bg-surface p-1"
              />
              <Input
                value={color}
                maxLength={7}
                onChange={(e) => setColor(e.target.value)}
                className="w-32 font-manrope tabular-nums"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" disabled={salvando}>
              {salvando ? 'Salvando…' : 'Salvar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Mesclagem: a origem some e tudo dela passa a apontar para o destino. */
function MergeDialog({
  categories,
  onDone,
  children,
}: {
  categories: CategoryUsage[];
  onDone: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [sourceId, setSourceId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [mesclando, setMesclando] = useState(false);

  const source = categories.find((c) => c.id === sourceId);
  const target = categories.find((c) => c.id === targetId);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!source || !target) return;
    if (
      !confirm(
        `Mesclar "${source.name}" em "${target.name}"? A categoria de origem deixa de existir.`,
      )
    ) {
      return;
    }
    setMesclando(true);
    try {
      const result = await api<MergeResult>(`/categories/${sourceId}/mesclar`, {
        method: 'POST',
        body: JSON.stringify({ targetId }),
      });
      const somados = result.budgetsSomados
        .map((b) => `${b.month}: ${brl(b.limitCents)}`)
        .join(', ');
      toast.success(
        `"${result.merged.from}" virou "${result.merged.into}" · ${result.moved.transactions} lançamentos migrados` +
          (somados ? ` · limites somados (${somados})` : ''),
      );
      setOpen(false);
      setSourceId('');
      setTargetId('');
      onDone();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setMesclando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent title="Mesclar categorias">
        <form className="space-y-3" onSubmit={submit}>
          <div className="space-y-1">
            <Label htmlFor="merge-origem">Origem (vai deixar de existir)</Label>
            <Select
              id="merge-origem"
              required
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
            >
              <option value="">Selecione…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.transactionCount ? ` (${c.transactionCount} lançamentos)` : ''}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="merge-destino">Destino (recebe tudo)</Label>
            <Select
              id="merge-destino"
              required
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
            >
              <option value="">Selecione…</option>
              {categories
                .filter((c) => c.id !== sourceId)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </Select>
          </div>

          <p className="rounded-[12px] bg-surface-2 px-3 py-2 text-xs text-ink-2">
            Migram lançamentos, divisões, compras, recorrências, regras de importação e
            subcategorias. Onde as duas tinham orçamento no mesmo mês, os limites{' '}
            <strong className="text-ink">somam</strong>. Nada é apagado além da própria categoria de
            origem.
          </p>

          <div className="flex justify-end gap-2 pt-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" disabled={mesclando || !sourceId || !targetId}>
              {mesclando ? 'Mesclando…' : 'Mesclar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
