'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Logo } from '@/components/logo';
import { authErrorMessage } from '@/lib/auth-error';
import { signIn } from '@/lib/auth-client';
import { syncApiToken } from '@/lib/session-actions';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    const { data, error: err } = await signIn.email({ email, password });
    if (err) {
      setError(authErrorMessage(err, 'Não foi possível entrar.'));
      setLoading(false);
      return;
    }
    // 2FA habilitado: o plugin redireciona para /2fa via onTwoFactorRedirect.
    if (data && 'twoFactorRedirect' in data && data.twoFactorRedirect) {
      return;
    }
    await syncApiToken();
    router.push('/painel');
  }

  return (
    <section className="card">
      <h1 className="title">
        <Logo markClassName="h-9 w-9" />
      </h1>
      <p className="subtitle">Entre na sua conta.</p>

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
        <div className="field">
          <label className="label" htmlFor="password">
            Senha
          </label>
          <input
            id="password"
            className="input"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <button className="btn btn-primary btn-block" type="submit" disabled={loading}>
          {loading ? 'Entrando…' : 'Entrar'}
        </button>
      </form>

      <div className="row-between" style={{ marginTop: 16 }}>
        <Link className="link" href="/recuperar-senha">
          Esqueci a senha
        </Link>
        <Link className="link" href="/criar-conta">
          Criar conta
        </Link>
      </div>
    </section>
  );
}
