'use client';

import { monthKeyInSaoPaulo } from '@cifrao/shared';
import { TriangleAlert } from 'lucide-react';
import { useMemo } from 'react';
import type { DashboardTimelineEvent } from '@/lib/api';
import { daysInMonthOf, dayOfMonthInSaoPaulo } from '@/lib/dates';
import { brlShort } from '@/lib/format';
import { maskMoney, usePrivacy } from '@/lib/privacy';
import { type Span, assignLanes } from '@/lib/ruler-lanes';

interface Marker {
  key: string;
  day: number;
  /** Posição em % da largura da régua. */
  left: number;
  label: string;
  detail: string;
  color: string;
  future: boolean;
  /** Altura da haste: a faixa do rótulo mais um bônus pelo valor. */
  stem: number;
  alert: boolean;
}

const TRACK_START = 5;
const TRACK_END = 92;

/**
 * As contas de colisão usam a largura MÍNIMA da régua (`min-w-[560px]`): numa
 * tela mais larga os rótulos ocupam uma fração menor e sobra espaço, nunca falta.
 */
const MIN_WIDTH_PX = 560;
const pct = (px: number) => (px / MIN_WIDTH_PX) * 100;

const FUTURE_LABEL_PX = 104;
const PAST_LABEL_PX = 92;
/** Espaço lateral do marcador de HOJE, que ninguém pode cobrir. */
const TODAY_PX = 44;

/** Rótulo (título + detalhe) mais o respiro até a faixa de cima. */
const FUTURE_LANE_STEP = 48;
const FUTURE_BASE_STEM = 16;
/** Bônus de haste pelo valor: o que pesa mais ainda sobe um pouco mais. */
const VALUE_BONUS = 8;
const FUTURE_BLOCK = 34 + 13 + 8; // texto + ponto + vãos
const TODAY_BLOCK = 64; // "HOJE" + haste + ponto

const PAST_LANE_STEP = 36;
const PAST_BASE_STEM = 14;
const PAST_BLOCK = 10 + 34 + 8; // ponto + texto + vãos

const AXIS_GAP = 14;

/**
 * "O que vem por aí": o mês numa régua. O que já passou fica abaixo da linha em
 * cinza, o que vem fica acima e colorido, e o marcador de HOJE separa os dois.
 * É a peça de assinatura do painel — mostra o mês inteiro sem pedir para rolar.
 *
 * Vencimentos próximos não se atropelam: cada rótulo vai para a faixa de altura
 * mais baixa em que cabe (`assignLanes`), e a régua cresce o que precisar.
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
  const currentMonth = monthKeyInSaoPaulo(today);
  const isCurrentMonth = month === currentMonth;

  const position = (day: number) =>
    TRACK_START + ((day - 1) / Math.max(1, totalDays - 1)) * (TRACK_END - TRACK_START);

  const markers = useMemo<Marker[]>(() => {
    const span = TRACK_END - TRACK_START;
    const at = (day: number) => TRACK_START + ((day - 1) / Math.max(1, totalDays - 1)) * span;
    const inMonth = events.filter((e) => e.date.slice(0, 7) === month);
    const maiorValor = Math.max(1, ...inMonth.map((e) => Number(e.amountCents)));

    const base = inMonth.map((e, i) => {
      const day = dayOfMonthInSaoPaulo(e.date);
      const invoice = e.kind === 'invoice-due';
      return {
        key: `${e.date}-${i}`,
        day,
        left: at(day),
        label: e.label,
        detail: `${day} · ${maskMoney(hidden, brlShort(e.amountCents))}`,
        color: invoice ? 'var(--warn)' : e.positive ? 'var(--positive)' : 'var(--primary)',
        // Mês passado: tudo passou. Mês que vem: tudo vem. No atual, depende do dia.
        future: month > currentMonth || (month === currentMonth && day >= todayDay),
        bonus: Math.round((Number(e.amountCents) / maiorValor) * VALUE_BONUS),
        alert: invoice,
      };
    });

    const around = (left: number, px: number): Span => ({
      start: left - pct(px) / 2,
      end: left + pct(px) / 2,
    });
    const future = base.filter((m) => m.future);
    const past = base.filter((m) => !m.future);
    const todaySpan =
      month === currentMonth ? [around(at(Math.min(todayDay, totalDays)), TODAY_PX)] : [];
    const futureLanes = assignLanes(
      future.map((m) => around(m.left, FUTURE_LABEL_PX)),
      todaySpan,
    );
    const pastLanes = assignLanes(past.map((m) => around(m.left, PAST_LABEL_PX)));

    return [
      ...future.map((m, i) => ({
        ...m,
        stem: FUTURE_BASE_STEM + futureLanes[i] * FUTURE_LANE_STEP + m.bonus,
      })),
      ...past.map((m, i) => ({ ...m, stem: PAST_BASE_STEM + pastLanes[i] * PAST_LANE_STEP })),
    ];
  }, [events, month, currentMonth, todayDay, totalDays, hidden]);

  if (markers.length === 0) {
    return (
      <p className="px-5 py-8 text-center text-sm text-ink-2">Nada previsto para o resto do mês.</p>
    );
  }

  const todayLeft = position(Math.min(todayDay, totalDays));

  // A régua cresce para caber a faixa mais alta de cima e a mais funda de baixo.
  const futureStems = markers.filter((m) => m.future).map((m) => m.stem + FUTURE_BLOCK);
  const pastStems = markers.filter((m) => !m.future).map((m) => m.stem + PAST_BLOCK);
  const trackTop = Math.max(88, isCurrentMonth ? TODAY_BLOCK : 0, ...futureStems);
  const below = Math.max(50, ...pastStems);
  const axisTop = trackTop + below + AXIS_GAP;

  return (
    <div className="overflow-x-auto px-2">
      <div className="relative min-w-[560px]" style={{ height: axisTop + 24 }}>
        <div
          className="absolute h-[3px] rounded-[3px] bg-[var(--track)]"
          style={{ left: `${TRACK_START}%`, right: `${100 - TRACK_END}%`, top: trackTop }}
        />
        {isCurrentMonth && (
          <div
            className="absolute h-[3px] rounded-[3px]"
            style={{
              left: `${todayLeft}%`,
              width: `${Math.max(0, TRACK_END - todayLeft)}%`,
              top: trackTop,
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
              style={{ left: `${m.left}%`, top: 0, height: trackTop }}
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
                  boxShadow: m.alert
                    ? `0 0 0 4px color-mix(in srgb, ${m.color} 18%, transparent)`
                    : undefined,
                }}
              />
            </div>
          ) : (
            <div
              key={m.key}
              className="absolute flex w-[92px] -translate-x-1/2 flex-col items-center gap-1 opacity-70"
              style={{ left: `${m.left}%`, top: trackTop + 2 }}
            >
              <span className="h-2.5 w-2.5 rounded-full border-[2.5px] border-ink-2 bg-surface" />
              <span className="w-0.5 bg-ink-2 opacity-30" style={{ height: m.stem }} />
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
            style={{ left: `${todayLeft}%`, top: 0, height: trackTop }}
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

        <div
          className="absolute inset-x-0 font-manrope text-[10px] text-ink-2 opacity-60"
          style={{ top: axisTop }}
        >
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
