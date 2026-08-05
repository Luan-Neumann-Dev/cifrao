'use client';

import { AlertTriangle, Bell, CalendarClock, PiggyBank, Target } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type AppNotification, type NotificationList, api } from '@/lib/api';
import { brl } from '@/lib/format';
import { cn } from '@/lib/utils';

const ICON = {
  INVOICE_DUE: CalendarClock,
  BUDGET_EXCEEDED: PiggyBank,
  GOAL_REACHED: Target,
  FORECAST_DUE: AlertTriangle,
} as const;

const TONE = {
  danger: 'text-negative bg-[color-mix(in_srgb,var(--negative)_14%,transparent)]',
  warn: 'text-warn bg-[color-mix(in_srgb,var(--warn)_16%,transparent)]',
  info: 'text-primary bg-primary-soft',
} as const;

/**
 * Sino de avisos (Fase 9). Não existe e-mail nem push: a API deriva os avisos
 * dos dados que já existem a cada chamada, então aqui basta ler e mostrar.
 */
export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<NotificationList | null>(null);
  const pathname = usePathname();
  const root = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      setData(await api<NotificationList>('/notifications'));
    } catch {
      // Aviso é acessório: falhar aqui não pode atrapalhar o resto da tela.
    }
  }, []);

  // Recarrega ao trocar de tela — pagar a fatura tem que apagar o aviso dela.
  useEffect(() => {
    void load();
  }, [load, pathname]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const unread = data?.unread ?? 0;

  return (
    <div className="relative shrink-0 print:hidden" ref={root}>
      <button
        type="button"
        aria-label={unread > 0 ? `Avisos (${unread})` : 'Avisos'}
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => !v);
          if (!open) void load();
        }}
        className="relative grid h-9 w-9 place-items-center rounded-full text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:shadow-[var(--ring)]"
      >
        <Bell className="h-[18px] w-[18px]" />
        {unread > 0 && (
          <span className="absolute right-0.5 top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-negative px-1 font-manrope text-[10px] font-bold tabular-nums text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-40 mt-2 w-[min(340px,calc(100vw-24px))] overflow-hidden rounded-[20px] border border-line bg-surface shadow-xl">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-sm font-semibold text-ink">Avisos</p>
            <Link
              href="/painel/configuracoes#avisos"
              className="text-xs font-medium text-primary hover:underline"
            >
              Preferências
            </Link>
          </div>

          {data === null ? (
            <p className="px-4 py-6 text-center text-sm text-ink-2">Carregando…</p>
          ) : data.notifications.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-ink-2">
              Nada pendente. Fatura, orçamento, meta e previsto estão em dia.
            </p>
          ) : (
            <ul className="max-h-[60vh] divide-y divide-line overflow-y-auto">
              {data.notifications.map((item) => (
                <NotificationRow key={item.id} item={item} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function NotificationRow({ item }: { item: AppNotification }) {
  const Icon = ICON[item.kind] ?? Bell;
  return (
    <li>
      <Link href={item.href} className="flex gap-3 px-4 py-3 transition-colors hover:bg-surface-2">
        <span className={cn('mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full', TONE[item.severity])}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-snug text-ink">{item.title}</p>
          <p className="text-xs text-ink-2">{item.detail}</p>
        </div>
        {item.amountCents && (
          <span className="shrink-0 self-center font-manrope text-sm font-bold tabular-nums text-ink">
            {brl(item.amountCents)}
          </span>
        )}
      </Link>
    </li>
  );
}
