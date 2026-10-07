'use client';

import {
  BarChart3,
  CalendarDays,
  CreditCard,
  FileUp,
  HandCoins,
  LayoutDashboard,
  LogOut,
  type LucideIcon,
  Menu,
  PiggyBank,
  Receipt,
  Repeat,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Target,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import { NotificationsBell } from '@/components/notifications-bell';
import { Button } from '@/components/ui/button';
import { DemoBanner } from '@/demo/demo-banner';
import { IS_DEMO, REPO_URL } from '@/demo/is-demo';
import { signOut } from '@/lib/auth-client';
import { isActiveNavLink } from '@/lib/nav';
import { clearApiToken } from '@/lib/session-actions';
import { cn } from '@/lib/utils';

interface NavLink {
  href: string;
  label: string;
  icon: LucideIcon;
}

/**
 * Menu agrupado por assunto. São 14 seções: numa régua horizontal elas só
 * cabiam rolando, o que escondia metade do app. Em grupos, tudo aparece de uma
 * vez e cada item fica perto do que ele responde.
 */
const GROUPS: { title: string; links: NavLink[] }[] = [
  {
    title: 'Dia a dia',
    links: [
      { href: '/painel', label: 'Visão geral', icon: LayoutDashboard },
      { href: '/painel/lancamentos', label: 'Lançamentos', icon: Receipt },
      { href: '/painel/calendario', label: 'Calendário', icon: CalendarDays },
    ],
  },
  {
    title: 'Onde está o dinheiro',
    links: [
      { href: '/painel/contas', label: 'Contas', icon: Wallet },
      { href: '/painel/cartoes', label: 'Cartões', icon: CreditCard },
      { href: '/painel/investimentos', label: 'Investimentos', icon: TrendingUp },
    ],
  },
  {
    title: 'Planejamento',
    links: [
      { href: '/painel/orcamento', label: 'Orçamento', icon: PiggyBank },
      { href: '/painel/metas', label: 'Metas', icon: Target },
      { href: '/painel/recorrencias', label: 'Recorrências', icon: Repeat },
      { href: '/painel/a-receber', label: 'A receber', icon: HandCoins },
    ],
  },
  {
    title: 'Dados',
    links: [
      { href: '/painel/relatorios', label: 'Relatórios', icon: BarChart3 },
      { href: '/painel/revisao', label: 'Retrospectiva', icon: Sparkles },
      { href: '/painel/importar', label: 'Importar', icon: FileUp },
      { href: '/painel/regras', label: 'Regras', icon: SlidersHorizontal },
    ],
  },
];

const SETTINGS: NavLink = {
  href: '/painel/configuracoes',
  label: 'Configurações',
  icon: Settings,
};

/**
 * Casca da área autenticada: sidebar fixa a partir de `lg` e gaveta por cima do
 * conteúdo abaixo disso (mobile-first, Seção 4 — tudo funciona em 380px).
 */
export function AppShell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  // Navegou: a gaveta fecha sozinha, senão fica tampando a tela que abriu.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    // Trava a rolagem do fundo enquanto a gaveta está aberta.
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  async function sair() {
    // Na demonstração não há sessão: "sair" leva ao código do projeto.
    if (IS_DEMO) {
      window.location.href = REPO_URL;
      return;
    }
    await signOut();
    await clearApiToken();
    router.push('/login');
  }

  return (
    <div className="min-h-dvh bg-bg">
      {/* Sidebar fixa (desktop) */}
      <Sidebar className="hidden lg:flex" pathname={pathname} onSair={sair} />

      {/* Gaveta (mobile e tablet) */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Fechar menu"
            className="absolute inset-0 bg-[rgba(26,21,35,0.45)]"
            onClick={() => setMenuOpen(false)}
          />
          <Sidebar
            className="flex w-[268px] max-w-[85vw] shadow-xl"
            pathname={pathname}
            onSair={sair}
            onClose={() => setMenuOpen(false)}
          />
        </div>
      )}

      {/* `app-content` existe para a folha de impressão zerar o recuo da sidebar. */}
      <div className="app-content lg:pl-64">
        {IS_DEMO && <DemoBanner />}
        <header className="sticky top-0 z-30 border-b border-line bg-surface/85 backdrop-blur print:hidden">
          <div className="flex items-center gap-2 px-4 py-3">
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 lg:hidden"
              aria-label="Abrir menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
            <span className="text-lg font-extrabold text-primary lg:hidden">Cifrão</span>
            <div className="flex-1" />
            <NotificationsBell />
            <Button variant="ghost" size="icon" className="shrink-0" onClick={sair} title="Sair">
              <LogOut className="h-4 w-4" />
              <span className="sr-only">Sair</span>
            </Button>
          </div>
        </header>

        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      </div>
    </div>
  );
}

function Sidebar({
  className,
  pathname,
  onSair,
  onClose,
}: {
  className?: string;
  pathname: string;
  onSair: () => void;
  onClose?: () => void;
}) {
  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-50 w-64 flex-col border-r border-line bg-surface print:hidden',
        className,
      )}
    >
      <div className="flex items-center gap-2 px-5 py-4">
        <Link href="/painel" className="text-xl font-extrabold tracking-tight text-primary">
          Cifrão
        </Link>
        <div className="flex-1" />
        {onClose && (
          <Button variant="ghost" size="icon" aria-label="Fechar menu" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Rola sozinha em tela baixa; o rodapé fica sempre visível. */}
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {GROUPS.map((group) => (
          <div key={group.title}>
            <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-2/70">
              {group.title}
            </p>
            <ul className="space-y-0.5">
              {group.links.map((link) => (
                <li key={link.href}>
                  <NavItem link={link} pathname={pathname} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="space-y-0.5 border-t border-line px-3 py-3">
        <NavItem link={SETTINGS} pathname={pathname} />
        <button
          type="button"
          onClick={onSair}
          className="flex w-full items-center gap-3 rounded-[12px] px-3 py-2 text-sm font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <LogOut className="h-[18px] w-[18px] shrink-0" />
          Sair
        </button>
      </div>
    </aside>
  );
}

function NavItem({ link, pathname }: { link: NavLink; pathname: string }) {
  const active = isActiveNavLink(pathname, link.href);
  const Icon = link.icon;
  return (
    <Link
      href={link.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center gap-3 rounded-[12px] px-3 py-2 text-sm font-medium transition-colors',
        active ? 'bg-primary-soft text-primary' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
      )}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" />
      <span className="truncate">{link.label}</span>
    </Link>
  );
}

