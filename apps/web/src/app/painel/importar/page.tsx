'use client';

import { formatInSaoPaulo } from '@cifrao/shared';
import { CheckCircle2, FileUp, Loader2, Trash2, TriangleAlert, Upload } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ChangeEvent, useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label, Select } from '@/components/ui/input';
import { type Account, type ImportSummary, api } from '@/lib/api';
import { cn } from '@/lib/utils';

const STATUS_LABEL: Record<ImportSummary['status'], string> = {
  UPLOADED: 'na fila',
  PARSING: 'lendo arquivo',
  NEEDS_MAPPING: 'precisa mapear colunas',
  REVIEW: 'pronto para revisar',
  CONFIRMED: 'importado',
  FAILED: 'falhou',
};

/** Lê o arquivo como base64 — o charset é resolvido no servidor. */
function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Não consegui ler o arquivo.'));
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.readAsDataURL(file);
  });
}

export default function ImportarPage() {
  const router = useRouter();
  const [batches, setBatches] = useState<ImportSummary[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const [list, accs] = await Promise.all([
        api<ImportSummary[]>('/imports'),
        api<Account[]>('/accounts'),
      ]);
      setBatches(list);
      setAccounts(accs);
      setAccountId((current) => current || (accs[0]?.id ?? ''));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Enquanto houver lote em processamento, acompanha o progresso do job.
  useEffect(() => {
    const working = batches.some((b) => b.status === 'UPLOADED' || b.status === 'PARSING');
    if (!working) return;
    const timer = setInterval(() => void load(), 1200);
    return () => clearInterval(timer);
  }, [batches, load]);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!accountId) {
      toast.error('Escolha a conta de destino antes de enviar.');
      return;
    }

    setUploading(true);
    try {
      const created = await api<{ id: string; format: string }>('/imports', {
        method: 'POST',
        body: JSON.stringify({
          filename: file.name,
          contentBase64: await toBase64(file),
          accountId,
        }),
      });
      toast.success(`Arquivo ${created.format} recebido — processando.`);
      router.push(`/painel/importar/${created.id}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function excluir(batch: ImportSummary) {
    if (!confirm(`Descartar a importação de "${batch.filename}"?`)) return;
    try {
      await api(`/imports/${batch.id}`, { method: 'DELETE' });
      toast.success('Importação descartada.');
      void load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">Importar extrato</h1>
          <p className="text-sm text-ink-2">
            OFX, CSV ou QIF. Nada vira lançamento antes de você confirmar.
          </p>
        </div>
        <Link href="/painel/regras" className="text-sm font-medium text-primary hover:underline">
          Gerenciar regras
        </Link>
      </div>

      <Card className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="imp-account">Conta de destino</Label>
          <Select
            id="imp-account"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="sm:max-w-sm"
          >
            <option value="">Selecione…</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
          <p className="text-xs text-ink-2">
            A conta define contra o que as duplicatas são checadas.
          </p>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".ofx,.qfx,.qif,.csv,.txt"
          onChange={upload}
          className="hidden"
        />
        <Button onClick={() => inputRef.current?.click()} disabled={uploading || !accountId}>
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {uploading ? 'Enviando…' : 'Escolher arquivo'}
        </Button>
      </Card>

      {loading ? (
        <p className="text-sm text-ink-2">Carregando…</p>
      ) : batches.length === 0 ? (
        <Card className="text-center text-sm text-ink-2">
          Nenhuma importação ainda. Envie o extrato que o banco te dá.
        </Card>
      ) : (
        <div className="space-y-3">
          {batches.map((batch) => {
            const working = batch.status === 'UPLOADED' || batch.status === 'PARSING';
            return (
              <Card key={batch.id} className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={cn(
                        'grid h-8 w-8 shrink-0 place-items-center rounded-full',
                        batch.status === 'FAILED'
                          ? 'bg-negative/15 text-negative'
                          : batch.status === 'CONFIRMED'
                            ? 'bg-positive/15 text-positive'
                            : 'bg-primary-soft text-primary',
                      )}
                    >
                      {batch.status === 'FAILED' ? (
                        <TriangleAlert className="h-4 w-4" />
                      ) : batch.status === 'CONFIRMED' ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : working ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <FileUp className="h-4 w-4" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <Link
                        href={`/painel/importar/${batch.id}`}
                        className="block truncate font-semibold text-ink hover:underline"
                      >
                        {batch.filename}
                      </Link>
                      <p className="truncate text-xs text-ink-2">
                        {batch.format} · {STATUS_LABEL[batch.status]}
                        {batch.account ? ` · ${batch.account.name}` : ''} ·{' '}
                        {formatInSaoPaulo(new Date(batch.createdAt))}
                      </p>
                    </div>
                  </div>
                  {batch.status !== 'CONFIRMED' && (
                    <Button variant="ghost" size="icon" title="Descartar" onClick={() => excluir(batch)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                {working && (
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--track)]">
                    <div
                      className="h-full rounded-full bg-primary transition-[width]"
                      style={{ width: `${batch.progress}%` }}
                    />
                  </div>
                )}

                {batch.error && <p className="text-xs text-negative">{batch.error}</p>}

                {batch.totalRows > 0 && (
                  <p className="text-xs text-ink-2">
                    {batch.totalRows} linhas
                    {batch.duplicateRows > 0 && ` · ${batch.duplicateRows} duplicatas`}
                    {batch.importedRows > 0 && ` · ${batch.importedRows} importadas`}
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
