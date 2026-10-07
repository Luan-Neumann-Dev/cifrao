'use client';

import { PAYMENT_METHODS, TRANSACTION_STATUSES, TRANSACTION_TYPES } from '@cifrao/shared';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import type { Account, Category, CreditCard, Tag } from '@/lib/api';
import { PAYMENT_METHOD_LABEL, TYPE_LABEL } from '@/lib/transactions';
import { cn } from '@/lib/utils';

export const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pendente',
  CLEARED: 'Efetivado',
  FORECAST: 'Previsto',
};

/** Os filtros que moram no painel — período e busca ficam sempre à vista. */
export interface PanelFilters {
  type: string;
  source: string;
  categoryId: string;
  tagId: string;
  status: string;
  paymentMethod: string;
}

export const EMPTY_PANEL: PanelFilters = {
  type: '',
  source: '',
  categoryId: '',
  tagId: '',
  status: '',
  paymentMethod: '',
};

/** Quantos filtros do painel estão ligados — o número na bolinha do botão. */
export function countPanelFilters(filters: PanelFilters): number {
  return Object.values(filters).filter((v) => v !== '').length;
}

/**
 * Painel com os filtros menos usados. Aplica na hora: o contador no rodapé
 * mostra o efeito de cada escolha antes de fechar.
 */
export function FiltersSheet({
  filters,
  onChange,
  onClear,
  onClose,
  accounts,
  cards,
  categories,
  tags,
  resultCount,
  loading,
}: {
  filters: PanelFilters;
  onChange: <K extends keyof PanelFilters>(key: K, value: string) => void;
  onClear: () => void;
  onClose: () => void;
  accounts: Account[];
  cards: CreditCard[];
  categories: Category[];
  tags: Tag[];
  resultCount: number;
  loading: boolean;
}) {
  const active = countPanelFilters(filters);

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent sheet hideClose className="p-0">
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex justify-center pt-2.5 sm:hidden">
            <span className="h-[5px] w-[38px] rounded-full bg-line" />
          </div>

          <div className="flex items-center justify-between px-[22px] pb-1.5 pt-[18px]">
            <DialogTitle className="font-manrope text-[19px] font-bold text-ink">
              Filtros
            </DialogTitle>
            <div className="flex items-center gap-2">
              {active > 0 && (
                <button
                  type="button"
                  onClick={onClear}
                  className="h-8 rounded-full px-3 text-[13px] font-semibold text-ink-2 transition-colors hover:text-ink"
                >
                  Limpar
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] bg-surface-2 text-ink-2 transition-colors hover:text-ink"
              >
                <X className="h-[17px] w-[17px]" />
                <span className="sr-only">Fechar</span>
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-[22px] pb-2 pt-2">
            <div className="flex flex-col gap-4">
              <Field label="Tipo">
                {/* Tipo é curto e excludente: pílulas leem melhor que um select. */}
                <div className="flex flex-wrap gap-2">
                  <Pill on={filters.type === ''} onClick={() => onChange('type', '')}>
                    Todos
                  </Pill>
                  {TRANSACTION_TYPES.map((t) => (
                    <Pill
                      key={t}
                      on={filters.type === t}
                      onClick={() => onChange('type', filters.type === t ? '' : t)}
                    >
                      {TYPE_LABEL[t]}
                    </Pill>
                  ))}
                </div>
              </Field>

              <Field label="Situação">
                <div className="flex flex-wrap gap-2">
                  <Pill on={filters.status === ''} onClick={() => onChange('status', '')}>
                    Todas
                  </Pill>
                  {TRANSACTION_STATUSES.map((s) => (
                    <Pill
                      key={s}
                      on={filters.status === s}
                      onClick={() => onChange('status', filters.status === s ? '' : s)}
                    >
                      {STATUS_LABEL[s]}
                    </Pill>
                  ))}
                </div>
              </Field>

              <Field label="Conta ou cartão" htmlFor="f-source">
                <Picker
                  id="f-source"
                  value={filters.source}
                  onChange={(v) => onChange('source', v)}
                  placeholder="Todas as contas e cartões"
                  groups={[
                    { label: 'Contas', options: accounts.map((a) => ({ value: `conta:${a.id}`, label: a.name })) },
                    { label: 'Cartões', options: cards.map((c) => ({ value: `cartao:${c.id}`, label: c.nickname })) },
                  ]}
                />
              </Field>

              <Field label="Categoria" htmlFor="f-cat">
                <Picker
                  id="f-cat"
                  value={filters.categoryId}
                  onChange={(v) => onChange('categoryId', v)}
                  placeholder="Todas as categorias"
                  groups={[{ options: categories.map((c) => ({ value: c.id, label: c.name })) }]}
                />
              </Field>

              {tags.length > 0 && (
                <Field label="Tag">
                  <div className="flex flex-wrap gap-2">
                    <Pill on={filters.tagId === ''} onClick={() => onChange('tagId', '')}>
                      Todas
                    </Pill>
                    {tags.map((t) => (
                      <Pill
                        key={t.id}
                        on={filters.tagId === t.id}
                        onClick={() => onChange('tagId', filters.tagId === t.id ? '' : t.id)}
                      >
                        {t.name}
                      </Pill>
                    ))}
                  </div>
                </Field>
              )}

              <Field label="Forma de pagamento">
                <div className="flex flex-wrap gap-2">
                  <Pill
                    on={filters.paymentMethod === ''}
                    onClick={() => onChange('paymentMethod', '')}
                  >
                    Todas
                  </Pill>
                  {PAYMENT_METHODS.map((m) => (
                    <Pill
                      key={m}
                      on={filters.paymentMethod === m}
                      onClick={() =>
                        onChange('paymentMethod', filters.paymentMethod === m ? '' : m)
                      }
                    >
                      {PAYMENT_METHOD_LABEL[m]}
                    </Pill>
                  ))}
                </div>
              </Field>
            </div>
          </div>

          <div className="sticky bottom-0 border-t border-line bg-surface px-[22px] pb-[calc(16px+env(safe-area-inset-bottom))] pt-4">
            <button
              type="button"
              onClick={onClose}
              className="h-[52px] w-full rounded-full bg-primary text-base font-semibold text-white transition-colors hover:bg-primary-hover"
            >
              {loading
                ? 'Filtrando…'
                : `Ver ${resultCount} ${resultCount === 1 ? 'lançamento' : 'lançamentos'}`}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-2.5 block text-xs font-semibold uppercase tracking-[0.04em] text-ink-2"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function Pill({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        'h-9 rounded-full border-[1.5px] px-3.5 text-[13px] font-semibold transition-colors',
        on
          ? 'border-primary bg-primary-soft text-primary'
          : 'border-line bg-surface text-ink hover:border-primary/40',
      )}
    >
      {children}
    </button>
  );
}

/** Listas longas (conta, categoria) continuam em select nativo. */
function Picker({
  id,
  value,
  onChange,
  placeholder,
  groups,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  groups: { label?: string; options: { value: string; label: string }[] }[];
}) {
  return (
    <div className="relative">
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-12 w-full cursor-pointer appearance-none rounded-[13px] border bg-surface px-4 pr-10 text-[15px] text-ink outline-none transition-colors focus:border-primary focus:shadow-[var(--ring)]"
        style={{ borderColor: value ? 'var(--primary)' : 'var(--line)' }}
      >
        <option value="">{placeholder}</option>
        {groups.map((g, i) =>
          g.options.length === 0 ? null : g.label ? (
            <optgroup key={g.label} label={g.label}>
              {g.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          ) : (
            g.options.map((o) => (
              <option key={`${i}-${o.value}`} value={o.value}>
                {o.label}
              </option>
            ))
          ),
        )}
      </select>
      <svg
        className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-2"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </div>
  );
}
