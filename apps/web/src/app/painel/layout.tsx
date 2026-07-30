import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AppNav } from '@/components/app-nav';
import { auth } from '@/lib/auth';
import { TokenSync } from './token-sync';

// Área autenticada: sem sessão, volta para o login (checagem no servidor).
export default async function PainelLayout({ children }: { children: ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect('/login');
  }
  return (
    <div className="min-h-dvh bg-bg">
      <TokenSync />
      <AppNav />
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
