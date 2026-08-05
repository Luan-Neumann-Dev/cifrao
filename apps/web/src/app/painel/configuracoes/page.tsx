'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { type Profile, api } from '@/lib/api';
import { AparenciaSection } from './aparencia-section';
import { AvisosSection } from './avisos-section';
import { BackupSection } from './backup-section';
import { CategoriasSection } from './categorias-section';
import { PerfilSection } from './perfil-section';
import { SessoesSection } from './sessoes-section';
import { ZonaDeRiscoSection } from './zona-de-risco-section';

const ATALHOS = [
  { href: '#perfil', label: 'Perfil' },
  { href: '#aparencia', label: 'Aparência' },
  { href: '#avisos', label: 'Avisos' },
  { href: '#categorias', label: 'Categorias' },
  { href: '#sessoes', label: 'Sessões' },
  { href: '#backup', label: 'Backup' },
  { href: '#zona-de-risco', label: 'Zona de risco' },
];

export default function ConfiguracoesPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setProfile(await api<Profile>('/settings'));
    } catch (err) {
      setErro((err as Error).message);
      toast.error((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">Configurações</h1>
        <p className="text-sm text-ink-2">Perfil, aparência, avisos, categorias, backup e conta.</p>
      </div>

      {/* Mobile-first: as seções são longas, então uma régua de atalhos rolável. */}
      <nav className="-mx-1 flex gap-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {ATALHOS.map((atalho) => (
          <a
            key={atalho.href}
            href={atalho.href}
            className="shrink-0 rounded-full bg-surface-2 px-3 py-1.5 text-xs font-medium text-ink-2 transition-colors hover:text-ink"
          >
            {atalho.label}
          </a>
        ))}
      </nav>

      {erro && !profile ? (
        <Card className="text-sm text-negative">{erro}</Card>
      ) : !profile ? (
        <Card className="text-sm text-ink-2">Carregando…</Card>
      ) : (
        <>
          <PerfilSection profile={profile} onSaved={setProfile} />
          <AparenciaSection profile={profile} onSaved={setProfile} />
          <AvisosSection profile={profile} onSaved={setProfile} />
        </>
      )}

      <CategoriasSection />
      <SessoesSection />
      <BackupSection />
      <ZonaDeRiscoSection />
    </div>
  );
}
