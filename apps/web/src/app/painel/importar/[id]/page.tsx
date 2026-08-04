'use client';

import { DATE_FORMATS, type StatementDateFormat, formatInSaoPaulo } from '@cifrao/shared';
import { ArrowLeft, CheckCircle2, Copy, Loader2, Sparkles, TriangleAlert, Undo2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { Input, Label, Select } from '@/components/ui/input';
import {
  type Category,
  type CsvMappingInput,
  type ImportDetail,
  type ImportRow,
  api,
} from '@/lib/api';
import { brl } from '@/lib/format';
import { cn } from '@/lib/utils';

export default function ImportacaoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [batch, setBatch] = useState<ImportDetail | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [patternFor, setPatternFor] = useState<ImportRow | null>(null);

  const load = useCallback(async () => {
    try {
      const [detail, cats] = await Promise.all([
        api<ImportDetail>(`/imports/${id}?pageSize=500`),
        api<Category[]>('/categories'),
      ]);
      setBatch(detail);
      setCategories(cats);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  // O processamento roda em job: acompanha o progresso até acabar.
  useEffect(() => {
    if (!batch) return;
    const working = batch.status === 'UPLOADED' || batch.status === 'PARSING';
    const confirmingNow = confirming && batch.status !== 'CONFIRMED';
    if (!working && !confirmingNow) return;
    const timer = setInterval(() => void load(), 1000);
    return () => clearInterval(timer);
  }, [batch, confirming, load]);

  useEffect(() => {
    if (batch?.status === 'CONFIRMED') setConfirming(false);
  }, [batch?.status]);

  async function confirmar() {
    setConfirming(true);
    try {
      const res = await api<{ queued: number }>(`/imports/${id}/confirm`, { method: 'POST' });
      toast.success(`${res.queued} lançamentos na fila de importação.`);
      void load();
    } catch (e) {
      setConfirming(false);
      toast.error((e as Error).message);
    }
  }

  async function atualizarLinha(row: ImportRow, patch: Partial<ImportRow>) {
    try {
      await api(`/imports/${id}/rows/${row.id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      void load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (loading) return <p className="text-sm text-ink-2">Carregando…</p>;
  if (!batch) return <p className="text-sm text-ink-2">Importação não encontrada.</p>;

  const working = batch.status === 'UPLOADED' || batch.status === 'PARSING';

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => router.push('/painel/importar')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-extrabold tracking-tight text-ink">
            {batch.filename}
          </h1>
          <p className="text-sm text-ink-2">
            {batch.format}
            {batch.account ? ` · ${batch.account.name}` : ''}
            {batch.detectedAccountLabel ? ` · conta no arquivo: ${batch.detectedAccountLabel}` : ''}
          </p>
        </div>
      </div>

      {batch.error && (
        <Card className="flex items-start gap-2 border-negative/30 bg-negative/10 py-3">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-negative" />
          <p className="text-sm text-ink">{batch.error}</p>
        </Card>
      )}

      {working && (
        <Card className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-ink">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            Lendo o arquivo… {batch.progress}%
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--track)]">
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${batch.progress}%` }}
            />
          </div>
        </Card>
      )}

      {batch.status === 'NEEDS_MAPPING' && batch.preview && (
        <MappingCard batch={batch} onSaved={load} />
      )}

      {batch.status === 'CONFIRMED' && (
        <Card className="flex items-start gap-2 border-positive/30 bg-positive/10 py-3">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-positive" />
          <p className="text-sm text-ink">
            <strong>{batch.importedRows} lançamentos importados.</strong>{' '}
            <Link href="/painel/lancamentos" className="font-medium text-primary hover:underline">
              Ver em Lançamentos
            </Link>
          </p>
        </Card>
      )}

      {(batch.status === 'REVIEW' || batch.status === 'CONFIRMED') && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Total" value={batch.totalRows} />
            <Stat label="A importar" value={batch.counts.pending} tone="primary" />
            <Stat label="Duplicatas" value={batch.counts.duplicate} tone="warn" />
            <Stat label="Ignoradas" value={batch.counts.ignored} />
          </div>

          {batch.status === 'REVIEW' && (
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={confirmar} disabled={confirming || batch.counts.pending === 0}>
                {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {confirming
                  ? `Importando… ${batch.progress}%`
                  : `Confirmar e importar ${batch.counts.pending}`}
              </Button>
              <p className="text-xs text-ink-2">
                Duplicatas e ignoradas ficam de fora. Nada foi gravado até aqui.
              </p>
            </div>
          )}

          <Card className="space-y-1 overflow-x-auto p-0">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-2">
                  <th className="px-4 py-2 font-medium">Data</th>
                  <th className="px-4 py-2 font-medium">Descrição</th>
                  <th className="px-4 py-2 text-right font-medium">Valor</th>
                  <th className="px-4 py-2 font-medium">Categoria</th>
                  <th className="px-4 py-2 font-medium">Situação</th>
                </tr>
              </thead>
              <tbody>
                {batch.rows.map((row) => (
                  <RowLine
                    key={row.id}
                    row={row}
                    categories={categories}
                    readOnly={batch.status === 'CONFIRMED'}
                    onChange={atualizarLinha}
                    onPattern={() => setPatternFor(row)}
                  />
                ))}
              </tbody>
            </table>
            {batch.pagination.total > batch.rows.length && (
              <p className="px-4 py-2 text-xs text-ink-2">
                Mostrando {batch.rows.length} de {batch.pagination.total} linhas.
              </p>
            )}
          </Card>
        </>
      )}

      {patternFor && (
        <PatternDialog
          batchId={id}
          row={patternFor}
          categories={categories}
          onClose={() => setPatternFor(null)}
          onApplied={load}
        />
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'primary' | 'warn' }) {
  return (
    <Card className="p-3">
      <p className="text-xs text-ink-2">{label}</p>
      <p
        className={cn(
          'font-manrope text-xl font-bold tabular-nums',
          tone === 'primary' ? 'text-primary' : tone === 'warn' ? 'text-warn' : 'text-ink',
        )}
      >
        {value}
      </p>
    </Card>
  );
}

function RowLine({
  row,
  categories,
  readOnly,
  onChange,
  onPattern,
}: {
  row: ImportRow;
  categories: Category[];
  readOnly: boolean;
  onChange: (row: ImportRow, patch: Partial<ImportRow>) => void;
  onPattern: () => void;
}) {
  const duplicate = row.status === 'DUPLICATE';
  const ignored = row.status === 'IGNORED';

  return (
    <tr className={cn('border-b border-line last:border-0', (duplicate || ignored) && 'opacity-60')}>
      <td className="whitespace-nowrap px-4 py-2 tabular-nums text-ink-2">
        {formatInSaoPaulo(new Date(row.date))}
      </td>
      <td className="max-w-[260px] px-4 py-2">
        <span className="block truncate text-ink">{row.description}</span>
        {row.matchedForecast && (
          <span className="text-[11px] text-primary">
            efetiva o previsto de {formatInSaoPaulo(new Date(row.matchedForecast.date))}
          </span>
        )}
        {row.duplicateOf && (
          <span className="text-[11px] text-warn">
            já existe: {row.duplicateOf.description} ·{' '}
            {formatInSaoPaulo(new Date(row.duplicateOf.date))}
          </span>
        )}
      </td>
      <td
        className={cn(
          'whitespace-nowrap px-4 py-2 text-right tabular-nums',
          row.type === 'INCOME' ? 'text-positive' : 'text-ink',
        )}
      >
        {row.type === 'INCOME' ? '+' : '−'}
        {brl(row.amountCents)}
      </td>
      <td className="px-4 py-2">
        {readOnly ? (
          <span className="text-ink-2">{row.category?.name ?? '—'}</span>
        ) : (
          <div className="flex items-center gap-1">
            <Select
              value={row.categoryId ?? ''}
              onChange={(e) => onChange(row, { categoryId: e.target.value || null })}
              className="h-8 min-w-[130px] text-[13px]"
            >
              <option value="">Sem categoria</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              title="Aplicar a todos com esse padrão e criar regra"
              onClick={onPattern}
            >
              <Sparkles className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
        {row.matchedRuleId && !readOnly && (
          <span className="text-[11px] text-ink-2">sugerido por regra</span>
        )}
      </td>
      <td className="px-4 py-2">
        {readOnly ? (
          <span className="text-xs text-ink-2">{row.status === 'IMPORTED' ? 'importada' : '—'}</span>
        ) : duplicate ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-8"
            title="Importar mesmo assim"
            onClick={() => onChange(row, { status: 'PENDING' })}
          >
            <Copy className="h-3.5 w-3.5" /> duplicata
          </Button>
        ) : ignored ? (
          <Button variant="ghost" size="sm" className="h-8" onClick={() => onChange(row, { status: 'PENDING' })}>
            <Undo2 className="h-3.5 w-3.5" /> reincluir
          </Button>
        ) : (
          <Button variant="ghost" size="sm" className="h-8" onClick={() => onChange(row, { status: 'IGNORED' })}>
            ignorar
          </Button>
        )}
      </td>
    </tr>
  );
}

function MappingCard({ batch, onSaved }: { batch: ImportDetail; onSaved: () => void }) {
  const preview = batch.preview!;
  const suggestion = preview.suggestion ?? {};
  const [mapping, setMapping] = useState<CsvMappingInput>({
    date: suggestion.date ?? '',
    description: suggestion.description ?? '',
    amount: suggestion.amount ?? '',
    debit: suggestion.debit ?? '',
    credit: suggestion.credit ?? '',
    dateFormat: (suggestion.dateFormat as StatementDateFormat) ?? 'dd/MM/yyyy',
    invertSign: false,
  });
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api(`/imports/${batch.id}/mapping`, {
        method: 'PATCH',
        body: JSON.stringify({
          date: mapping.date,
          description: mapping.description,
          amount: mapping.amount || undefined,
          debit: mapping.debit || undefined,
          credit: mapping.credit || undefined,
          dateFormat: mapping.dateFormat,
          invertSign: mapping.invertSign,
        }),
      });
      toast.success('Mapeamento salvo — relendo o arquivo.');
      onSaved();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const columnSelect = (
    key: 'date' | 'description' | 'amount' | 'debit' | 'credit',
    label: string,
    optional = false,
  ) => (
    <div className="space-y-1">
      <Label htmlFor={`map-${key}`}>{label}</Label>
      <Select
        id={`map-${key}`}
        value={mapping[key] ?? ''}
        onChange={(e) => setMapping({ ...mapping, [key]: e.target.value })}
      >
        <option value="">{optional ? '— nenhuma —' : 'Selecione…'}</option>
        {preview.headers.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </Select>
    </div>
  );

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="font-semibold text-ink">Mapear colunas do CSV</h2>
        <p className="text-sm text-ink-2">
          {preview.rowCount} linhas no arquivo. Confira as 5 primeiras e diga qual coluna é o quê.
        </p>
      </div>

      <div className="overflow-x-auto rounded-[12px] border border-line">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-line bg-surface-2 text-left text-ink-2">
              {preview.headers.map((h) => (
                <th key={h} className="whitespace-nowrap px-3 py-2 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.preview.map((row, i) => (
              <tr key={i} className="border-b border-line last:border-0">
                {preview.headers.map((h) => (
                  <td key={h} className="whitespace-nowrap px-3 py-1.5 text-ink">
                    {row[h]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form className="space-y-3" onSubmit={submit}>
        <div className="grid gap-3 sm:grid-cols-2">
          {columnSelect('date', 'Coluna da data')}
          <div className="space-y-1">
            <Label htmlFor="map-format">Formato da data</Label>
            <Select
              id="map-format"
              value={mapping.dateFormat}
              onChange={(e) =>
                setMapping({ ...mapping, dateFormat: e.target.value as StatementDateFormat })
              }
            >
              {DATE_FORMATS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </Select>
          </div>
          {columnSelect('description', 'Coluna da descrição')}
          {columnSelect('amount', 'Coluna do valor', true)}
          {columnSelect('debit', 'Coluna de débito (opcional)', true)}
          {columnSelect('credit', 'Coluna de crédito (opcional)', true)}
        </div>

        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[var(--primary)]"
            checked={mapping.invertSign}
            onChange={(e) => setMapping({ ...mapping, invertSign: e.target.checked })}
          />
          Este extrato exporta gasto como valor positivo
        </label>

        <Button type="submit" disabled={saving || !mapping.date || !mapping.description}>
          {saving ? 'Salvando…' : 'Salvar mapeamento e ler o arquivo'}
        </Button>
      </form>
    </Card>
  );
}

function PatternDialog({
  batchId,
  row,
  categories,
  onClose,
  onApplied,
}: {
  batchId: string;
  row: ImportRow;
  categories: Category[];
  onClose: () => void;
  onApplied: () => void;
}) {
  const [pattern, setPattern] = useState('');
  const [categoryId, setCategoryId] = useState(row.categoryId ?? '');
  const [createRule, setCreateRule] = useState(true);
  const [count, setCount] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // Padrão sugerido pelo servidor a partir da descrição da linha.
  useEffect(() => {
    api<{ count: number; pattern: string }>(
      `/imports/${batchId}/pattern?pattern=${encodeURIComponent(row.description)}`,
    )
      .then((r) => setPattern(r.pattern))
      .catch(() => setPattern(row.description.toLowerCase()));
  }, [batchId, row.description]);

  // Conta quantas linhas casam, a cada mudança do padrão.
  useEffect(() => {
    if (!pattern) return;
    const timer = setTimeout(() => {
      api<{ count: number }>(`/imports/${batchId}/pattern?pattern=${encodeURIComponent(pattern)}`)
        .then((r) => setCount(r.count))
        .catch(() => setCount(null));
    }, 250);
    return () => clearTimeout(timer);
  }, [batchId, pattern]);

  async function aplicar(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api<{ applied: number }>(`/imports/${batchId}/apply-pattern`, {
        method: 'POST',
        body: JSON.stringify({ pattern, categoryId, createRule }),
      });
      toast.success(
        createRule
          ? `${res.applied} linhas categorizadas e regra criada.`
          : `${res.applied} linhas categorizadas.`,
      );
      onApplied();
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title="Aplicar a todos com esse padrão">
        <form className="space-y-3" onSubmit={aplicar}>
          <div className="space-y-1">
            <Label htmlFor="pat-text">Padrão na descrição</Label>
            <Input id="pat-text" value={pattern} onChange={(e) => setPattern(e.target.value)} required />
            <p className="text-xs text-ink-2">
              {count === null
                ? 'Contando…'
                : `${count} ${count === 1 ? 'linha casa' : 'linhas casam'} com esse padrão neste arquivo.`}
            </p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="pat-cat">Categoria</Label>
            <Select
              id="pat-cat"
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

          <label className="flex items-start gap-2 text-sm text-ink">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
              checked={createRule}
              onChange={(e) => setCreateRule(e.target.checked)}
            />
            <span>
              Criar regra para as próximas importações
              <span className="block text-xs text-ink-2">
                Da próxima vez, esses lançamentos já chegam categorizados.
              </span>
            </span>
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" disabled={saving || !categoryId || !pattern}>
              {saving ? 'Aplicando…' : `Aplicar${count ? ` a ${count}` : ''}`}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
