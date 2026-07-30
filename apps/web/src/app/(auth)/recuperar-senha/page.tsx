'use client';

import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import { authClient } from '@/lib/auth-client';

export default function RecuperarSenhaPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    const { error: err } = await authClient.requestPasswordReset({
      email,
      redirectTo: '/redefinir-senha',
    });
    if (err) {
      setError(err.message ?? 'Não foi possível enviar o link.');
      setLoading(false);
      return;
    }
    setSent(true);
    setLoading(false);
  }

  return (
    <section className="card">
      <h1 className="title">Recuperar senha</h1>
      {sent ? (
        <>
          <div className="alert alert-ok">
            Se existir uma conta com esse e-mail, enviamos um link de redefinição.
          </div>
          <p className="muted" style={{ marginTop: 12 }}>
            Em ambiente de desenvolvimento, o link aparece no log do servidor.
          </p>
          <Link className="btn btn-ghost btn-block" href="/login" style={{ marginTop: 16 }}>
            Voltar ao login
          </Link>
        </>
      ) : (
        <>
          <p className="subtitle">Enviaremos um link para redefinir sua senha.</p>
          <form className="stack" onSubmit={onSubmit}>
            {error && <div className="alert alert-error">{error}</div>}
            <div className="field">
              <label className="label" htmlFor="email">
                E-mail
              </label>
              <input
                id="email"
                className="input"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <button className="btn btn-primary btn-block" type="submit" disabled={loading}>
              {loading ? 'Enviando…' : 'Enviar link'}
            </button>
          </form>
          <p className="muted" style={{ marginTop: 16 }}>
            <Link className="link" href="/login">
              Voltar ao login
            </Link>
          </p>
        </>
      )}
    </section>
  );
}
