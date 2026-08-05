'use client';

import { BACKUP_CSV_SECTIONS } from '@cifrao/shared';
import { Download, FileJson, Upload } from 'lucide-react';
import { type ChangeEvent, useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { type BackupSummary, type RestoreEnqueued, type RestoreJob, api } from '@/lib/api';
import { SectionTitle } from './perfil-section';

const CSV_LABEL: Record<string, string> = {
  lancamentos: 'Lançamentos',
  contas: 'Contas',
  cartoes: 'Cartões',
  faturas: 'Faturas',
  categorias: 'Categorias',
  orcamentos: 'Orçamentos',
  metas: 'Metas',
  recorrencias: 'Recorrências',
  investimentos: 'Investimentos',
  operacoes: 'Operações de investimento',
};

/**
 * Backup (Fase 9). Decisão do dono: **sem storage** — o export baixa pelo
 * navegador e a restauração sobe por upload. O download é um `<a>` normal
 * porque o cookie httpOnly do JWT viaja sozinho e o `Content-Disposition` vem
 * pronto do servidor; fazer fetch + Blob só recriaria isso à mão.
 */
export function BackupSection() {
  const [summary, setSummary] = useState<BackupSummary | null>(null);
  const [section, setSection] = useState<string>('lancamentos');

  useEffect(() => {
    void api<BackupSummary>('/backup/resumo')
      .then(setSummary)
      .catch((err: unknown) => toast.error((err as Error).message));
  }, []);

  return (
    <Card id="backup" className="scroll-mt-20 space-y-4">
      <SectionTitle
        title="Backup"
        hint="Seu histórico inteiro em um arquivo. Nada fica guardado no servidor."
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button asChild>
          <a href="/api/backup/exportar.json" download>
            <FileJson className="h-4 w-4" /> Exportar tudo (JSON)
          </a>
        </Button>
        <Select
          aria-label="Seção do CSV"
          value={section}
          onChange={(e) => setSection(e.target.value)}
          className="w-auto"
        >
          {BACKUP_CSV_SECTIONS.map((s) => (
            <option key={s} value={s}>
              {CSV_LABEL[s] ?? s}
            </option>
          ))}
        </Select>
        <Button variant="ghost" asChild>
          <a href={`/api/backup/exportar.csv?section=${section}`} download>
            <Download className="h-4 w-4" /> Baixar CSV
          </a>
        </Button>
      </div>

      {summary && (
        <div className="rounded-[12px] bg-surface-2 px-3 py-3">
          <p className="text-xs font-medium text-ink">
            {summary.totalRecords.toLocaleString('pt-BR')} registros no arquivo JSON
          </p>
          <p className="mt-1 text-xs leading-relaxed text-ink-2">
            {summary.sections
              .filter((s) => s.count > 0)
              .map((s) => `${s.label}: ${s.count}`)
              .join(' · ')}
          </p>
          <p className="mt-2 text-xs text-ink-2">
            Senha, 2FA e sessões <strong className="text-ink">não</strong> vão no backup — só os
            dados financeiros, o perfil e as preferências.
          </p>
        </div>
      )}

      <RestoreForm />
    </Card>
  );
}

function RestoreForm() {
  const [content, setContent] = useState<string | null>(null);
  const [filename, setFilename] = useState('');
  const [mode, setMode] = useState<'replace' | 'merge'>('replace');
  const [job, setJob] = useState<RestoreJob | null>(null);
  const [enviando, setEnviando] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const rodando = job?.status === 'PENDING' || job?.status === 'RUNNING';

  // O job roda no pg-boss (armadilha #3); a tela só acompanha o progresso.
  const acompanhar = useCallback(async (jobId: string) => {
    try {
      setJob(await api<RestoreJob>(`/backup/restaurar/${jobId}`));
    } catch (err) {
      toast.error((err as Error).message);
    }
  }, []);

  useEffect(() => {
    if (!job || !rodando) return;
    const timer = setInterval(() => void acompanhar(job.id), 1200);
    return () => clearInterval(timer);
  }, [job, rodando, acompanhar]);

  useEffect(() => {
    if (job?.status === 'DONE') toast.success('Backup restaurado. Recarregue para ver os dados.');
    if (job?.status === 'FAILED') toast.error(job.error ?? 'A restauração falhou.');
  }, [job?.status, job?.error]);

  function escolher(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFilename(file.name);
    void file
      .text()
      .then(setContent)
      .catch(() => toast.error('Não consegui ler o arquivo.'));
  }

  async function restaurar() {
    if (!content) return;
    const aviso =
      mode === 'replace'
        ? 'Restaurar apagando o que existe hoje? Tudo será substituído pelo arquivo.'
        : 'Restaurar somando ao que já existe? Registros do arquivo entram por cima.';
    if (!confirm(aviso)) return;

    setEnviando(true);
    try {
      const { job: created, check } = await api<RestoreEnqueued>('/backup/restaurar', {
        method: 'POST',
        body: JSON.stringify({ content, mode }),
      });
      if (check.unknownModels.length > 0) {
        toast.warning(`Seções desconhecidas ignoradas: ${check.unknownModels.join(', ')}`);
      }
      setJob({
        ...created,
        progress: 0,
        restored: null,
        error: null,
        finishedAt: null,
      } as RestoreJob);
      void acompanhar(created.id);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-3 rounded-[12px] border border-line px-3 py-3">
      <p className="text-sm font-semibold text-ink">Restaurar backup</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="restore-file">Arquivo JSON</Label>
          <Input
            id="restore-file"
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            onChange={escolher}
            className="h-auto py-2 text-xs file:mr-3 file:rounded-full file:border-0 file:bg-surface-2 file:px-3 file:py-1 file:text-xs file:text-ink"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="restore-mode">Modo</Label>
          <Select
            id="restore-mode"
            value={mode}
            onChange={(e) => setMode(e.target.value as 'replace' | 'merge')}
          >
            <option value="replace">Substituir tudo (banco limpo)</option>
            <option value="merge">Somar ao que já existe</option>
          </Select>
        </div>
      </div>

      <p className="text-xs text-ink-2">
        A gravação roda numa transação só: ou o banco fica igual ao arquivo, ou nada muda.
        {filename && <span className="text-ink"> Selecionado: {filename}.</span>}
      </p>

      <Button
        variant="ghost"
        size="sm"
        disabled={!content || enviando || rodando}
        onClick={restaurar}
      >
        <Upload className="h-4 w-4" /> {rodando ? 'Restaurando…' : 'Restaurar'}
      </Button>

      {job && (
        <div className="space-y-1">
          <Progress
            value={job.progress}
            barClassName={
              job.status === 'FAILED'
                ? 'bg-negative'
                : job.status === 'DONE'
                  ? 'bg-positive'
                  : 'bg-primary'
            }
          />
          <p className="text-xs text-ink-2">
            {job.status === 'DONE'
              ? `Concluído: ${Object.values(job.restored ?? {}).reduce((a, b) => a + b, 0)} registros gravados.`
              : job.status === 'FAILED'
                ? `Falhou: ${job.error ?? 'erro desconhecido'}`
                : `${job.progress}% de ${job.totalRecords.toLocaleString('pt-BR')} registros`}
          </p>
        </div>
      )}
    </div>
  );
}
