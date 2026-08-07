'use client';

import { Sparkles, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { type OnboardingStatus, api } from '@/lib/api';
import { monthLongLabel } from '@/lib/dates';

/**
 * Nos primeiros dias do mês, avisa que a retrospectiva do mês passado está
 * pronta. Some depois de vista (ou dispensada) — o servidor guarda qual foi o
 * último mês visto, então o aviso não volta em outro dispositivo.
 */
export function ReviewNudge() {
  const [month, setMonth] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api<OnboardingStatus>('/settings/onboarding')
      .then((status) => {
        if (alive) setMonth(status.reviewMonth);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  if (!month) return null;

  async function dispensar() {
    setMonth(null);
    await api('/settings/revisao-vista', {
      method: 'POST',
      body: JSON.stringify({ month }),
    }).catch(() => undefined);
  }

  return (
    <div
      className="relative flex items-center gap-4 overflow-hidden rounded-[20px] px-5 py-4 text-white"
      style={{
        background:
          'linear-gradient(135deg, var(--primary), color-mix(in oklab, var(--primary), #000 26%))',
        boxShadow: '0 10px 26px color-mix(in srgb, var(--primary) 26%, transparent)',
      }}
    >
      <span className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/10" />
      <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px] bg-white/20">
        <Sparkles className="h-5 w-5" strokeWidth={1.85} />
      </span>
      <div className="relative min-w-0 flex-1">
        <div className="font-manrope text-[15.5px] font-bold">
          Sua retrospectiva de {monthLongLabel(month)} está pronta
        </div>
        <div className="text-[13px] text-white/80">
          Quanto entrou, para onde foi e se o orçamento segurou.
        </div>
      </div>
      <Link
        href={`/painel/revisao?mes=${month}`}
        className="relative hidden h-10 shrink-0 items-center rounded-full bg-white px-5 text-sm font-bold text-primary transition-transform hover:-translate-y-px sm:inline-flex"
      >
        Ver
      </Link>
      <Link
        href={`/painel/revisao?mes=${month}`}
        className="relative shrink-0 text-sm font-bold underline sm:hidden"
      >
        Ver
      </Link>
      <button
        type="button"
        onClick={dispensar}
        aria-label="Dispensar"
        className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/15 hover:text-white"
      >
        <X className="h-4 w-4" strokeWidth={2.2} />
      </button>
    </div>
  );
}
