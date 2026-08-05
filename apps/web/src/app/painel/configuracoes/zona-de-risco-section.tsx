'use client';

import { DELETE_ACCOUNT_CONFIRMATION, WIPE_CONFIRMATION } from '@cifrao/shared';
import { AlertTriangle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Input, Label } from '@/components/ui/input';
import { api } from '@/lib/api';
import { signOut } from '@/lib/auth-client';
import { clearApiToken } from '@/lib/session-actions';

/**
 * Zona de risco (Fase 9) em dois níveis, cada um com sua frase — as mesmas
 * constantes do `@cifrao/shared` que o servidor exige, sem texto repetido dos
 * dois lados. Quem valida de verdade continua sendo o backend.
 */
export function ZonaDeRiscoSection() {
  const router = useRouter();

  async function apagarLancamentos(confirm: string) {
    const { deleted } = await api<{ deleted: Record<string, number> }>(
      '/backup/apagar-lancamentos',
      { method: 'POST', body: JSON.stringify({ confirm }) },
    );
    const total = Object.values(deleted).reduce((a, b) => a + b, 0);
    toast.success(`${total} registros apagados. Contas, cartões e configuração foram mantidos.`);
    router.refresh();
  }

  async function excluirConta(confirm: string) {
    await api('/backup/conta', { method: 'DELETE', body: JSON.stringify({ confirm }) });
    toast.success('Conta excluída.');
    await signOut();
    await clearApiToken();
    router.push('/login');
  }

  return (
    <Card
      id="zona-de-risco"
      className="scroll-mt-20 space-y-4 border-[color-mix(in_srgb,var(--negative)_35%,transparent)]"
    >
      <div className="flex items-start gap-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--negative)_14%,transparent)] text-negative">
          <AlertTriangle className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-lg font-bold tracking-tight text-ink">Zona de risco</h2>
          <p className="text-sm text-ink-2">
            Sem volta e sem lixeira. Exporte o backup antes — é a única forma de desfazer.
          </p>
        </div>
      </div>

      <DangerAction
        title="Apagar lançamentos"
        description="Zera movimentação, faturas, importações e carteira de investimentos. Contas, cartões, categorias, tags, orçamentos, metas, recorrências e regras continuam — dá para recomeçar sem reconfigurar tudo. O saldo das contas volta a zero."
        confirmation={WIPE_CONFIRMATION}
        actionLabel="Apagar lançamentos"
        onConfirm={apagarLancamentos}
      />

      <DangerAction
        title="Excluir minha conta"
        description="Apaga o domínio inteiro e o próprio acesso: lançamentos, contas, cartões, categorias, investimentos, senha e 2FA. O app volta ao estado de instalação nova."
        confirmation={DELETE_ACCOUNT_CONFIRMATION}
        actionLabel="Excluir conta"
        onConfirm={excluirConta}
      />
    </Card>
  );
}

function DangerAction({
  title,
  description,
  confirmation,
  actionLabel,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmation: string;
  actionLabel: string;
  onConfirm: (confirm: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [texto, setTexto] = useState('');
  const [executando, setExecutando] = useState(false);
  const liberado = texto.trim().toUpperCase() === confirmation;

  async function executar() {
    setExecutando(true);
    try {
      await onConfirm(texto.trim().toUpperCase());
      setOpen(false);
      setTexto('');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setExecutando(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] bg-surface-2 px-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink">{title}</p>
        <p className="text-xs leading-relaxed text-ink-2">{description}</p>
      </div>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setTexto('');
        }}
      >
        <DialogTrigger asChild>
          <Button variant="danger" size="sm">
            {actionLabel}
          </Button>
        </DialogTrigger>
        <DialogContent title={title}>
          <div className="space-y-3">
            <p className="text-sm text-ink-2">{description}</p>
            <div className="space-y-1">
              <Label htmlFor={`danger-${confirmation}`}>
                Digite <strong className="text-ink">{confirmation}</strong> para confirmar
              </Label>
              <Input
                id={`danger-${confirmation}`}
                value={texto}
                autoComplete="off"
                onChange={(e) => setTexto(e.target.value)}
                placeholder={confirmation}
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  Cancelar
                </Button>
              </DialogClose>
              <Button variant="danger" disabled={!liberado || executando} onClick={executar}>
                {executando ? 'Executando…' : actionLabel}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
