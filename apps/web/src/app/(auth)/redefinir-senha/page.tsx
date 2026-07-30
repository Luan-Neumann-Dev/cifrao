'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { type FormEvent, Suspense, useState } from 'react';
import { authClient } from '@/lib/auth-client';

function RedefinirSenhaForm() {
  const params = useSearchParams();
  const token = params.get('token');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!token) {
      setError('Link inválido ou expirado.');
      return;
    }
    if (password !== confirm) {
      setError('As senhas não conferem.');
      return;
    }
    if (password.length < 8) {
      setError('A senha precisa ter ao menos 8 caracteres.');
      return;
    }
    setLoading(true);
    const { error: err } = await authClient.resetPassword({ newPassword: password, token });
    if (err) {
      setError(err.message ?? 'Não foi possível redefinir a senha.');
      setLoading(false);
      return;
    }
    setDone(true);
    setLoading(false);
  }

  if (done) {
    return (
      <>
        <div className="alert alert-ok">Senha redefinida com sucesso.</div>
        <Link className="btn btn-primary btn-block" href="/login" style={{ marginTop: 16 }}>
          Entrar
        </Link>
      </>
    );
  }

  return (
    <>
      <p className="subtitle">Defina uma nova senha para sua conta.</p>
      <form className="stack" onSubmit={onSubmit}>
        {error && <div className="alert alert-error">{error}</div>}
        <div className="field">
          <label className="label" htmlFor="password">
            Nova senha
          </label>
          <input
            id="password"
            className="input"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="confirm">
            Confirmar nova senha
          </label>
          <input
            id="confirm"
            className="input"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>
        <button className="btn btn-primary btn-block" type="submit" disabled={loading}>
          {loading ? 'Salvando…' : 'Redefinir senha'}
        </button>
      </form>
    </>
  );
}

export default function RedefinirSenhaPage() {
  return (
    <section className="card">
      <h1 className="title">Redefinir senha</h1>
      <Suspense fallback={<p className="muted">Carregando…</p>}>
        <RedefinirSenhaForm />
      </Suspense>
    </section>
  );
}
