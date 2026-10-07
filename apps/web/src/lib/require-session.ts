import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { IS_DEMO } from '@/demo/is-demo';

/**
 * Porta da área autenticada (checagem no servidor): sem sessão, volta para o
 * login. Na demonstração não há conta nem banco — todo mundo entra.
 */
export async function requireSession(): Promise<void> {
  if (IS_DEMO) return;
  // Import dinâmico: o build da demo não carrega o Better Auth (nem o Prisma).
  const { auth } = await import('./auth');
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');
}
