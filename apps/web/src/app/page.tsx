const API_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:3001';

interface HealthStatus {
  status: string;
  service: string;
  timestamp: string;
  localTime: string;
  timezone: string;
  uptimeSeconds: number;
}

async function getHealth(): Promise<HealthStatus | null> {
  try {
    const res = await fetch(`${API_URL}/health`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as HealthStatus;
  } catch {
    return null;
  }
}

export default async function Home() {
  const health = await getHealth();
  const online = health?.status === 'ok';

  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <section
        style={{
          width: '100%',
          maxWidth: 420,
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          borderRadius: 20,
          boxShadow: 'var(--card-shadow)',
          padding: 28,
        }}
      >
        <h1
          style={{
            margin: '0 0 4px',
            fontSize: 28,
            fontWeight: 800,
            color: 'var(--primary)',
          }}
        >
          Cifrão
        </h1>
        <p style={{ margin: '0 0 20px', color: 'var(--ink-2)', fontSize: 14 }}>
          Finanças pessoais — Fase 0
        </p>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 14px',
            borderRadius: 12,
            background: 'var(--surface-2)',
          }}
        >
          <span
            aria-hidden
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              background: online ? 'var(--positive)' : 'var(--negative)',
            }}
          />
          <span style={{ fontSize: 14, fontWeight: 500 }}>
            {online ? 'API conectada' : 'API indisponível'}
          </span>
        </div>

        {health && (
          <dl
            style={{
              margin: '18px 0 0',
              display: 'grid',
              gridTemplateColumns: 'auto 1fr',
              gap: '8px 16px',
              fontSize: 13,
            }}
          >
            <dt style={{ color: 'var(--ink-2)' }}>Serviço</dt>
            <dd style={{ margin: 0, textAlign: 'right' }}>{health.service}</dd>
            <dt style={{ color: 'var(--ink-2)' }}>Horário (SP)</dt>
            <dd style={{ margin: 0, textAlign: 'right' }}>{health.localTime}</dd>
            <dt style={{ color: 'var(--ink-2)' }}>Uptime</dt>
            <dd style={{ margin: 0, textAlign: 'right' }}>{health.uptimeSeconds}s</dd>
          </dl>
        )}
      </section>
    </main>
  );
}
