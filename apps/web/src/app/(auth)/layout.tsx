import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { IS_DEMO } from '@/demo/is-demo';

export default function AuthLayout({ children }: { children: ReactNode }) {
  // Na demonstração não há conta: login, cadastro e 2FA levam direto ao painel.
  if (IS_DEMO) redirect('/painel');
  return <main className="center-screen">{children}</main>;
}
