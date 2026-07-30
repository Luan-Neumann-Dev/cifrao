'use client';

import { LogOut } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { signOut } from '@/lib/auth-client';
import { clearApiToken } from '@/lib/session-actions';
import { cn } from '@/lib/utils';

const LINKS = [
  { href: '/painel', label: 'Visão geral' },
  { href: '/painel/contas', label: 'Contas' },
  { href: '/painel/cartoes', label: 'Cartões' },
  { href: '/painel/lancamentos', label: 'Lançamentos' },
];

export function AppNav() {
  const pathname = usePathname();
  const router = useRouter();

  async function sair() {
    await signOut();
    await clearApiToken();
    router.push('/login');
  }

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/85 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-3">
        <span className="mr-2 text-lg font-extrabold text-primary">Cifrão</span>
        <nav className="flex gap-1">
          {LINKS.map((l) => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                  active ? 'bg-primary-soft text-primary' : 'text-ink-2 hover:text-ink',
                )}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <Button variant="ghost" size="sm" className="ml-auto" onClick={sair}>
          <LogOut className="h-4 w-4" />
          Sair
        </Button>
      </div>
    </header>
  );
}
