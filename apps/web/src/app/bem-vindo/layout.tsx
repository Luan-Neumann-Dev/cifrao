import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { auth } from '@/lib/auth';
import { TokenSync } from '../painel/token-sync';

/**
 * Primeiros passos ficam fora do `/painel` de propósito: sem sidebar e sem
 * cabeçalho. Quem chega aqui ainda não tem nada para navegar.
 */
export default async function BemVindoLayout({ children }: { children: ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');
  return (
    <div className="min-h-dvh bg-bg">
      <TokenSync />
      {children}
    </div>
  );
}
