'use client';

import { TriangleAlert } from 'lucide-react';
import { useMemo } from 'react';
import type { DashboardTimelineEvent } from '@/lib/api';
import { daysInMonthOf, dayOfMonthInSaoPaulo } from '@/lib/dates';
import { brlShort } from '@/lib/format';
import { maskMoney, usePrivacy } from '@/lib/privacy';

interface Marker {
  key: string;
  day: number;
  /** Posição em % da largura da régua. */
  left: number;
  label: string;
  detail: string;
  color: string;
  future: boolean;
  /** Altura da haste: valor maior, haste mais alta. */
  stem: number;
  alert: boolean;
}

const TRACK_START = 5;
const TRACK_END = 92;

/**
 * "O que vem por aí": o mês numa régua. O que já passou fica abaixo da linha em
 * cinza, o que vem fica acima e colorido, e o marcador de HOJE separa os dois.
 * É a peça de assinatura do painel — mostra o mês inteiro sem pedir para rolar.
 */
export function MonthRuler({
  month,
  events,
  today = new Date(),
}: {
  month: string;
  events: DashboardTimelineEvent[];
  today?: Date;
}) {
  const { hidden } = usePrivacy();
  const totalDays = daysInMonthOf(month);
  const todayDay = dayOfMonthInSaoPaulo(today.toISOString());
  const isCurrentMonth = month === today.toISOString().slice(0, 7) || true;

  const position = (day: number) =>
    TRACK_START + ((day - 1) / Math.max(1, totalDays - 1)) * (TRACK_END - TRACK_START);

  const markers = useMemo<Marker[]>(() => {
    const span = TRACK_END - TRACK_START;
    const at = (day: number) => TRACK_START + ((day - 1) / Math.max(1, totalDays - 1)) * span;
    const inMonth = events.filter((e) => e.date.slice(0, 7) === month);
    const maiorValor = Math.max(1, ...inMonth.map((e) => Number(e.amountCents)));
    return inMonth.map((e, i) => {
      const day = dayOfMonthInSaoPaulo(e.date);
      const invoice = e.kind === 'invoice-due';
      return {
        key: `${e.date}-${i}`,
        day,
        left: at(day),
        label: e.label,
        detail: `${day} · ${maskMoney(hidden, brlShort(e.amountCents))}`,
        color: invoice ? 'var(--warn)' : e.positive ? 'var(--positive)' : 'var(--primary)',
        future: day >= todayDay,
        // 16 a 42px, proporcional ao valor: o que pesa mais chama mais atenção.
        stem: 16 + Math.round((Number(e.amountCents) / maiorValor) * 26),
        alert: invoice,
      };
    });
  }, [events, month, todayDay, totalDays, hidden]);

  if (markers.length === 0) {
    return (
      <p className="px-5 py-8 text-center text-sm text-ink-2">
        Nada previsto para o resto do mês.
      </p>
    );
  }

  const todayLeft = position(Math.min(todayDay, totalDays));

  return (
    <div className="overflow-x-auto px-2">
      <div className="relative h-[176px] min-w-[560px]">
        <div
          className="absolute h-[3px] rounded-[3px] bg-[var(--track)]"
          style={{ left: `${TRACK_START}%`, right: `${100 - TRACK_END}%`, top: 88 }}
        />
        {isCurrentMonth && (
          <div
            className="absolute h-[3px] rounded-[3px]"
            style={{
              left: `${todayLeft}%`,
              width: `${Math.max(0, TRACK_END - todayLeft)}%`,
              top: 88,
              background:
                'linear-gradient(90deg, var(--primary), color-mix(in oklab, var(--primary), transparent 55%))',
            }}
          />
        )}

        {markers.map((m) =>
          m.future ? (
            <div
              key={m.key}
              className="absolute flex w-[104px] -translate-x-1/2 flex-col items-center justify-end gap-1"
              style={{ left: `${m.left}%`, top: 0, height: 88 }}
            >
              <span
                className="inline-flex max-w-full items-center gap-1 truncate text-xs font-semibold"
                style={{ color: m.alert ? 'var(--warn)' : 'var(--ink)' }}
              >
                {m.alert && <TriangleAlert className="h-3 w-3 shrink-0" strokeWidth={2} />}
                <span className="truncate">{m.label}</span>
              </span>
              <span className="font-manrope text-[10.5px] text-ink-2">{m.detail}</span>
              <span
                className="w-0.5 rounded-full"
                style={{ height: m.stem, background: m.color, opacity: 0.55 }}
              />
              <span
                className="rounded-full"
                style={{
                  width: m.alert ? 13 : 10,
                  height: m.alert ? 13 : 10,
                  background: m.color,
                  boxShadow: m.alert ? `0 0 0 4px color-mix(in srgb, ${m.color} 18%, transparent)` : undefined,
                }}
              />
            </div>
          ) : (
            <div
              key={m.key}
              className="absolute flex w-[92px] -translate-x-1/2 flex-col items-center gap-1 opacity-70"
              style={{ left: `${m.left}%`, top: 90 }}
            >
              <span className="h-2.5 w-2.5 rounded-full border-[2.5px] border-ink-2 bg-surface" />
              <span className="h-3.5 w-0.5 bg-ink-2 opacity-30" />
              <span className="max-w-full truncate text-xs font-semibold text-ink-2">
                {m.label}
              </span>
              <span className="font-manrope text-[10.5px] text-ink-2 opacity-80">
                {m.day} · passou
              </span>
            </div>
          ),
        )}

        {isCurrentMonth && (
          <div
            className="pointer-events-none absolute flex -translate-x-1/2 flex-col items-center justify-end"
            style={{ left: `${todayLeft}%`, top: 0, height: 88 }}
          >
            <div className="flex flex-col items-center gap-[3px]">
              <span className="font-manrope text-[10.5px] font-bold tracking-[0.1em] text-primary">
                HOJE
              </span>
              <span className="h-[22px] w-[2.5px] rounded-sm bg-primary" />
              <span className="h-[15px] w-[15px] rounded-full border-[3px] border-surface bg-primary shadow-[0_0_0_2.5px_var(--primary)]" />
            </div>
          </div>
        )}

        <div className="absolute inset-x-0 font-manrope text-[10px] text-ink-2 opacity-60" style={{ top: 152 }}>
          {[1, 10, 20, totalDays].map((d) => (
            <span key={d} className="absolute -translate-x-1/2" style={{ left: `${position(d)}%` }}>
              {d}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
