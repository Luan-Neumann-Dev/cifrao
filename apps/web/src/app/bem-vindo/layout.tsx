import type { ReactNode } from 'react';
import { requireSession } from '@/lib/require-session';
import { TokenSync } from '../painel/token-sync';

/**
 * Primeiros passos ficam fora do `/painel` de propósito: sem sidebar e sem
 * cabeçalho. Quem chega aqui ainda não tem nada para navegar.
 */
export default async function BemVindoLayout({ children }: { children: ReactNode }) {
  await requireSession();
  return (
    <div className="min-h-dvh bg-bg">
      <TokenSync />
      {children}
    </div>
  );
}
