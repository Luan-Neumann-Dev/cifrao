'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { syncApiToken } from '@/lib/session-actions';
import { authErrorMessage } from '@/lib/auth-error';

export default function VerificarDoisFatoresPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [useBackup, setUseBackup] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    const { error: err } = useBackup
      ? await authClient.twoFactor.verifyBackupCode({ code })
      : await authClient.twoFactor.verifyTotp({ code });
    if (err) {
      setError(authErrorMessage(err, 'Código inválido.'));
      setLoading(false);
      return;
    }
    await syncApiToken();
    router.push('/painel');
  }

  return (
    <section className="card">
      <h1 className="title">Verificação em duas etapas</h1>
      <p className="subtitle">
        {useBackup
          ? 'Informe um dos seus códigos de recuperação.'
          : 'Digite o código de 6 dígitos do seu app autenticador.'}
      </p>

      <form className="stack" onSubmit={onSubmit}>
        {error && <div className="alert alert-error">{error}</div>}
        <div className="field">
          <label className="label" htmlFor="code">
            {useBackup ? 'Código de recuperação' : 'Código'}
          </label>
          <input
            id="code"
            className="input"
            inputMode={useBackup ? 'text' : 'numeric'}
            autoComplete="one-time-code"
            required
            value={code}
            onChange={(e) => setCode(e.target.value.trim())}
          />
        </div>
        <button className="btn btn-primary btn-block" type="submit" disabled={loading}>
          {loading ? 'Verificando…' : 'Verificar'}
        </button>
      </form>

      <button
        type="button"
        className="link"
        style={{ marginTop: 16, background: 'none', border: 0, cursor: 'pointer' }}
        onClick={() => {
          setUseBackup((v) => !v);
          setCode('');
          setError(null);
        }}
      >
        {useBackup ? 'Usar código do app' : 'Usar código de recuperação'}
      </button>
    </section>
  );
}
