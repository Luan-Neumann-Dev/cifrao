'use client';

import { type ReactNode, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { type Category, type Tag, api } from '@/lib/api';
import { cn } from '@/lib/utils';

/** Aplica uma categoria a todos os selecionados de uma vez. */
export function BulkCategoryDialog({
  ids,
  categories,
  onDone,
  children,
}: {
  ids: string[];
  categories: Category[];
  onDone: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  async function apply(categoryId: string) {
    setSaving(true);
    try {
      await api('/transactions/bulk', {
        method: 'POST',
        body: JSON.stringify({ action: 'categorize', ids, categoryId }),
      });
      toast.success(`Categoria aplicada a ${ids.length} lançamento(s).`);
      setOpen(false);
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent title={`Categorizar ${ids.length} lançamento(s)`}>
        <div className="max-h-[50vh] space-y-1 overflow-y-auto pr-1">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              disabled={saving}
              onClick={() => apply(c.id)}
              className="flex w-full items-center gap-3 rounded-[12px] px-3 py-2 text-left text-sm text-ink transition-colors hover:bg-surface-2 disabled:opacity-60"
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                style={{ background: c.color ?? 'var(--ink-2)' }}
              />
              {c.name}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Adiciona uma tag ao lote (não remove as que já existem). */
export function BulkTagDialog({
  ids,
  tags,
  onDone,
  children,
}: {
  ids: string[];
  tags: Tag[];
  onDone: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  async function apply(tagId: string) {
    setSaving(true);
    try {
      await api('/transactions/bulk', {
        method: 'POST',
        body: JSON.stringify({ action: 'addTag', ids, tagId }),
      });
      toast.success(`Tag aplicada a ${ids.length} lançamento(s).`);
      setOpen(false);
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent title={`Marcar ${ids.length} lançamento(s)`}>
        {tags.length === 0 ? (
          <p className="text-sm text-ink-2">
            Nenhuma tag criada ainda. Crie uma ao editar um lançamento.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {tags.map((t) => (
              <button
                key={t.id}
                type="button"
                disabled={saving}
                onClick={() => apply(t.id)}
                className={cn(
                  'rounded-full border border-line px-3 py-1.5 text-[13px] font-medium text-ink transition-colors hover:border-primary hover:bg-primary-soft hover:text-primary disabled:opacity-60',
                )}
              >
                {t.name}
              </button>
            ))}
          </div>
        )}
        <div className="flex justify-end">
          <DialogClose asChild>
            <Button type="button" variant="ghost">
              Fechar
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
