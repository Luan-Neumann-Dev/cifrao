'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { signOut, useSession } from '@/lib/auth-client';
import { clearApiToken } from '@/lib/session-actions';

export default function PainelPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [apiResult, setApiResult] = useState<string | null>(null);
  const twoFactorEnabled = Boolean(
    (session?.user as { twoFactorEnabled?: boolean } | undefined)?.twoFactorEnabled,
  );

  async function testarApi() {
    const res = await fetch('/api/me');
    const text = await res.text();
    setApiResult(`HTTP ${res.status} — ${text}`);
  }

  async function sair() {
    await signOut();
    await clearApiToken();
    router.push('/login');
  }

  return (
    <main className="center-screen">
      <section className="card">
        <h1 className="title">
          <span className="title-brand">Cifrão</span>
        </h1>
        <p className="subtitle">Painel — Fase 1 (autenticação)</p>

        {isPending ? (
          <p className="muted">Carregando sessão…</p>
        ) : (
          <div className="stack">
            <div className="field">
              <span className="label">Logado como</span>
              <span>{session?.user?.email ?? '—'}</span>
            </div>
            <div className="field">
              <span className="label">2FA</span>
              <span>{twoFactorEnabled ? 'ativado' : 'não ativado'}</span>
            </div>

            <button className="btn btn-ghost btn-block" onClick={testarApi} type="button">
              Testar rota protegida /api/me
            </button>
            {apiResult && (
              <div className="alert alert-ok" style={{ wordBreak: 'break-word' }}>
                {apiResult}
              </div>
            )}

            <Link className="link" href="/configurar-2fa">
              Configurar 2FA
            </Link>
            <button className="btn btn-primary btn-block" onClick={sair} type="button">
              Sair
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
