'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { authErrorMessage } from '@/lib/auth-error';
import { signUp } from '@/lib/auth-client';
import { syncApiToken } from '@/lib/session-actions';

export default function CriarContaPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError('As senhas não conferem.');
      return;
    }
    if (password.length < 8) {
      setError('A senha precisa ter ao menos 8 caracteres.');
      return;
    }
    setLoading(true);
    const { error: err } = await signUp.email({ name, email, password });
    if (err) {
      setError(authErrorMessage(err, 'Não foi possível criar a conta.'));
      setLoading(false);
      return;
    }
    await syncApiToken();
    router.push('/configurar-2fa');
  }

  return (
    <section className="card">
      <h1 className="title">Criar conta</h1>
      <p className="subtitle">Cadastro liberado apenas para o primeiro usuário.</p>

      <form className="stack" onSubmit={onSubmit}>
        {error && <div className="alert alert-error">{error}</div>}
        <div className="field">
          <label className="label" htmlFor="name">
            Nome
          </label>
          <input
            id="name"
            className="input"
            type="text"
            autoComplete="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
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
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="confirm">
            Confirmar senha
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
          {loading ? 'Criando…' : 'Criar conta'}
        </button>
      </form>

      <p className="muted" style={{ marginTop: 16 }}>
        Já tem conta?{' '}
        <Link className="link" href="/login">
          Entrar
        </Link>
      </p>
    </section>
  );
}
