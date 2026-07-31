'use client';

import {
  TRANSACTION_STATUSES,
  TRANSACTION_TYPES,
  type TransactionStatus,
  type TransactionType,
  formatInSaoPaulo,
} from '@cifrao/shared';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import {
  type Account,
  type Category,
  type Paginated,
  type Tag,
  type Transaction,
  api,
} from '@/lib/api';
import { brl } from '@/lib/format';
import { cn } from '@/lib/utils';
import { TransactionDialog } from './transaction-dialog';

const STATUS_LABEL: Record<TransactionStatus, string> = {
  PENDING: 'Pendente',
  CLEARED: 'Efetivado',
  FORECAST: 'Previsto',
};
const TYPE_LABEL: Record<TransactionType, string> = {
  EXPENSE: 'Despesa',
  INCOME: 'Receita',
  TRANSFER: 'Transferência',
  ADJUSTMENT: 'Ajuste',
};

interface Filters {
  from: string;
  to: string;
  type: string;
  accountId: string;
  categoryId: string;
  tagId: string;
  status: string;
  search: string;
}
const EMPTY: Filters = {
  from: '',
  to: '',
  type: '',
  accountId: '',
  categoryId: '',
  tagId: '',
  status: '',
  search: '',
};

function amountView(tx: Transaction): { text: string; className: string } {
  const n = Number(tx.amountCents);
  switch (tx.type) {
    case 'EXPENSE':
      return { text: `- ${brl(Math.abs(n))}`, className: 'text-negative' };
    case 'INCOME':
      return { text: `+ ${brl(n)}`, className: 'text-positive' };
    case 'TRANSFER':
      return { text: brl(n), className: 'text-ink-2' };
    default:
      return { text: brl(n), className: 'text-warn' };
  }
}

export default function LancamentosPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [data, setData] = useState<Paginated<Transaction> | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkCategory, setBulkCategory] = useState('');

  useEffect(() => {
    Promise.all([
      api<Account[]>('/accounts'),
      api<Category[]>('/categories'),
      api<Tag[]>('/tags'),
    ])
      .then(([a, c, t]) => {
        setAccounts(a);
        setCategories(c);
        setTags(t);
      })
      .catch((e) => toast.error((e as Error).message));
  }, []);

  // Filtro por clique vindo do dashboard: semeia os filtros a partir da URL.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const keys: (keyof Filters)[] = ['from', 'to', 'type', 'accountId', 'categoryId', 'tagId', 'status', 'search'];
    const seed: Partial<Filters> = {};
    for (const k of keys) {
      const v = sp.get(k);
      if (v) seed[k] = v;
    }
    if (Object.keys(seed).length > 0) setFilters((f) => ({ ...f, ...seed }));
  }, []);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) if (v) p.set(k, v);
    p.set('page', String(page));
    p.set('pageSize', '50');
    return p.toString();
  }, [filters, page]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api<Paginated<Transaction>>(`/transactions?${query}`));
      setSelected(new Set());
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  function setFilter<K extends keyof Filters>(key: K, value: string) {
    setPage(1);
    setFilters((f) => ({ ...f, [key]: value }));
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const items = data?.items ?? [];
  const allSelected = items.length > 0 && items.every((i) => selected.has(i.id));

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(items.map((i) => i.id)));
  }

  // Exclusão com desfazer: remove da UI e só confirma no servidor após o toast fechar.
  function deleteWithUndo(ids: string[]) {
    const removing = new Set(ids);
    setData((d) => (d ? { ...d, items: d.items.filter((i) => !removing.has(i.id)) } : d));
    setSelected(new Set());
    let undone = false;
    toast(ids.length > 1 ? `${ids.length} lançamentos excluídos` : 'Lançamento excluído', {
      duration: 5000,
      action: {
        label: 'Desfazer',
        onClick: () => {
          undone = true;
          void load();
        },
      },
      onAutoClose: async () => {
        if (undone) return;
        try {
          if (ids.length > 1) {
            await api('/transactions/bulk', {
              method: 'POST',
              body: JSON.stringify({ action: 'delete', ids }),
            });
          } else {
            await api(`/transactions/${ids[0]}`, { method: 'DELETE' });
          }
        } catch (e) {
          toast.error((e as Error).message);
          void load();
        }
      },
    });
  }

  async function bulkCategorize() {
    if (!bulkCategory) return;
    try {
      await api('/transactions/bulk', {
        method: 'POST',
        body: JSON.stringify({ action: 'categorize', ids: [...selected], categoryId: bulkCategory }),
      });
      toast.success('Categoria aplicada.');
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function bulkClear() {
    try {
      await api('/transactions/bulk', {
        method: 'POST',
        body: JSON.stringify({ action: 'setStatus', ids: [...selected], status: 'CLEARED' }),
      });
      toast.success('Marcados como efetivados.');
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">Lançamentos</h1>
          {data && <p className="text-sm text-ink-2">{data.total} no total</p>}
        </div>
        <TransactionDialog
          accounts={accounts}
          categories={categories}
          tags={tags}
          onSaved={load}
        >
          <Button disabled={accounts.length === 0}>
            <Plus className="h-4 w-4" /> Novo
          </Button>
        </TransactionDialog>
      </div>

      {accounts.length === 0 && (
        <Card className="text-sm text-ink-2">Crie uma conta antes de lançar.</Card>
      )}

      {/* Filtros */}
      <Card className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="space-y-1">
          <Label>De</Label>
          <Input type="date" value={filters.from} onChange={(e) => setFilter('from', e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Até</Label>
          <Input type="date" value={filters.to} onChange={(e) => setFilter('to', e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Tipo</Label>
          <Select value={filters.type} onChange={(e) => setFilter('type', e.target.value)}>
            <option value="">Todos</option>
            {TRANSACTION_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Conta</Label>
          <Select value={filters.accountId} onChange={(e) => setFilter('accountId', e.target.value)}>
            <option value="">Todas</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Categoria</Label>
          <Select
            value={filters.categoryId}
            onChange={(e) => setFilter('categoryId', e.target.value)}
          >
            <option value="">Todas</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Status</Label>
          <Select value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
            <option value="">Todos</option>
            {TRANSACTION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1 md:col-span-2">
          <Label>Busca</Label>
          <Input
            value={filters.search}
            placeholder="descrição…"
            onChange={(e) => setFilter('search', e.target.value)}
          />
        </div>
        <div className="col-span-2 flex items-end md:col-span-4">
          <Button variant="ghost" size="sm" onClick={() => setFilters(EMPTY)}>
            Limpar filtros
          </Button>
        </div>
      </Card>

      {/* Barra de ações em lote */}
      {selected.size > 0 && (
        <Card className="flex flex-wrap items-center gap-3 border-primary/40">
          <span className="text-sm font-medium text-ink">{selected.size} selecionado(s)</span>
          <div className="flex items-center gap-2">
            <Select
              className="h-8 w-44 text-[13px]"
              value={bulkCategory}
              onChange={(e) => setBulkCategory(e.target.value)}
            >
              <option value="">Categorizar como…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Button size="sm" variant="subtle" onClick={bulkCategorize} disabled={!bulkCategory}>
              Aplicar
            </Button>
          </div>
          <Button size="sm" variant="subtle" onClick={bulkClear}>
            Marcar efetivado
          </Button>
          <Button size="sm" variant="danger" onClick={() => deleteWithUndo([...selected])}>
            <Trash2 className="h-4 w-4" /> Excluir
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Limpar seleção
          </Button>
        </Card>
      )}

      {/* Lista */}
      <Card className="p-0">
        <div className="flex items-center gap-3 border-b border-line px-4 py-2 text-xs font-medium text-ink-2">
          <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Selecionar todos" />
          <span>Descrição</span>
          <span className="ml-auto">Valor</span>
        </div>
        {loading ? (
          <p className="px-4 py-6 text-sm text-ink-2">Carregando…</p>
        ) : items.length === 0 ? (
          <p className="px-4 py-6 text-sm text-ink-2">Nenhum lançamento com esses filtros.</p>
        ) : (
          <ul>
            {items.map((tx) => {
              const av = amountView(tx);
              return (
                <li
                  key={tx.id}
                  className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-0"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(tx.id)}
                    onChange={() => toggleSelected(tx.id)}
                    aria-label={`Selecionar ${tx.description}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{tx.description}</p>
                    <p className="truncate text-xs text-ink-2">
                      {formatInSaoPaulo(new Date(tx.date))}
                      {' · '}
                      {tx.type === 'TRANSFER'
                        ? `${tx.fromAccount?.name} → ${tx.toAccount?.name}`
                        : (tx.account?.name ?? '—')}
                      {tx.category ? ` · ${tx.category.name}` : ''}
                      {tx.status !== 'CLEARED' ? ` · ${STATUS_LABEL[tx.status]}` : ''}
                    </p>
                  </div>
                  <span className={cn('shrink-0 text-sm font-semibold tabular-nums', av.className)}>
                    {av.text}
                  </span>
                  <TransactionDialog
                    transaction={tx}
                    accounts={accounts}
                    categories={categories}
                    tags={tags}
                    onSaved={load}
                  >
                    <Button variant="ghost" size="icon" title="Editar">
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TransactionDialog>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Excluir"
                    onClick={() => deleteWithUndo([tx.id])}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Paginação */}
      {data && totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Anterior
          </Button>
          <span className="text-sm text-ink-2">
            {page} / {totalPages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Próxima
          </Button>
        </div>
      )}
    </div>
  );
}
