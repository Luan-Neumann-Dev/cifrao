'use client';

import { formatInSaoPaulo } from '@cifrao/shared';
import { LogOut, MonitorSmartphone } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { type ActiveSession, api } from '@/lib/api';
import { SectionTitle } from './perfil-section';

/** Sessões ativas (Fase 9): quem está logado e o botão de derrubar. */
export function SessoesSection() {
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setSessions(await api<ActiveSession[]>('/settings/sessions'));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function revogar(session: ActiveSession) {
    try {
      await api(`/settings/sessions/${session.id}`, { method: 'DELETE' });
      toast.success('Sessão encerrada.');
      void load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function revogarOutras() {
    if (!confirm('Encerrar todas as outras sessões? Só este aparelho continua conectado.')) return;
    try {
      const { revoked } = await api<{ revoked: number }>('/settings/sessions/outras', {
        method: 'DELETE',
      });
      toast.success(
        revoked === 0 ? 'Não havia outra sessão ativa.' : `${revoked} sessões encerradas.`,
      );
      void load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const outras = sessions.filter((s) => !s.current).length;

  return (
    <Card id="sessoes" className="scroll-mt-20 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionTitle
          title="Sessões ativas"
          hint="Cada aparelho conectado. Sessão expirada não aparece aqui."
        />
        <Button variant="ghost" size="sm" disabled={outras === 0} onClick={revogarOutras}>
          <LogOut className="h-4 w-4" /> Encerrar as outras
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-ink-2">Carregando…</p>
      ) : (
        <ul className="divide-y divide-line">
          {sessions.map((session) => (
            <li key={session.id} className="flex items-center gap-3 py-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-2">
                <MonitorSmartphone className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">
                  {session.device}
                  {session.current && (
                    <span className="ml-2 rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-semibold text-primary">
                      este aparelho
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-ink-2">
                  {session.ipAddress ? `${session.ipAddress} · ` : ''}
                  ativa em {formatInSaoPaulo(new Date(session.updatedAt), 'dd/MM/yyyy HH:mm')} · expira{' '}
                  {formatInSaoPaulo(new Date(session.expiresAt))}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={session.current}
                title={session.current ? 'Para sair daqui, use o botão de sair no topo' : 'Encerrar'}
                onClick={() => void revogar(session)}
              >
                Encerrar
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
