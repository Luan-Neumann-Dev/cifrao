'use client';

import Link from 'next/link';
import QRCode from 'qrcode';
import { type FormEvent, useState } from 'react';
import { authClient } from '@/lib/auth-client';

type Step = 'senha' | 'confirmar' | 'pronto';

export default function ConfigurarDoisFatoresPage() {
  const [step, setStep] = useState<Step>('senha');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [qr, setQr] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function enable(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    const { data, error: err } = await authClient.twoFactor.enable({ password });
    if (err || !data) {
      setError(err?.message ?? 'Não foi possível iniciar o 2FA.');
      setLoading(false);
      return;
    }
    setBackupCodes(data.backupCodes ?? []);
    setQr(await QRCode.toDataURL(data.totpURI, { margin: 1, width: 200 }));
    setStep('confirmar');
    setLoading(false);
  }

  async function confirm(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    const { error: err } = await authClient.twoFactor.verifyTotp({ code });
    if (err) {
      setError(err.message ?? 'Código inválido.');
      setLoading(false);
      return;
    }
    setStep('pronto');
    setLoading(false);
  }

  return (
    <section className="card">
      <h1 className="title">Ativar 2FA</h1>

      {step === 'senha' && (
        <>
          <p className="subtitle">Confirme sua senha para gerar o segredo TOTP.</p>
          <form className="stack" onSubmit={enable}>
            {error && <div className="alert alert-error">{error}</div>}
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
              {loading ? 'Gerando…' : 'Gerar QR Code'}
            </button>
          </form>
        </>
      )}

      {step === 'confirmar' && (
        <>
          <p className="subtitle">
            Escaneie o QR no seu app autenticador e confirme com um código.
          </p>
          {qr && <img className="qr" src={qr} alt="QR Code do TOTP" />}
          {backupCodes.length > 0 && (
            <>
              <p className="muted" style={{ marginTop: 8 }}>
                Guarde seus códigos de recuperação:
              </p>
              <div className="codes">
                {backupCodes.map((c) => (
                  <span key={c}>{c}</span>
                ))}
              </div>
            </>
          )}
          <form className="stack" onSubmit={confirm} style={{ marginTop: 14 }}>
            {error && <div className="alert alert-error">{error}</div>}
            <div className="field">
              <label className="label" htmlFor="code">
                Código do app
              </label>
              <input
                id="code"
                className="input"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                value={code}
                onChange={(e) => setCode(e.target.value.trim())}
              />
            </div>
            <button className="btn btn-primary btn-block" type="submit" disabled={loading}>
              {loading ? 'Confirmando…' : 'Confirmar e ativar'}
            </button>
          </form>
        </>
      )}

      {step === 'pronto' && (
        <>
          <div className="alert alert-ok">2FA ativado com sucesso.</div>
          <Link className="btn btn-primary btn-block" href="/painel" style={{ marginTop: 16 }}>
            Ir para o painel
          </Link>
        </>
      )}

      {step !== 'pronto' && (
        <p className="muted" style={{ marginTop: 16 }}>
          <Link className="link" href="/painel">
            Pular por agora
          </Link>
        </p>
      )}
    </section>
  );
}
