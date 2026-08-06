'use client';

import { useEffect, useState } from 'react';
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, XAxis } from 'recharts';
import type { CommitmentPoint } from '@/lib/api';
import { HEAVY_MONTH_CENTS, isHeavyMonth } from '@/lib/cards';
import { monthShortLabel } from '@/lib/dates';
import { brl, brlShort } from '@/lib/format';

/**
 * Quanto de cada um dos próximos 12 meses já está tomado por parcelas. Mês
 * pesado sai em âmbar — é o aviso de que o mês nasce comprometido.
 */
export function CommitmentChart({ data }: { data: CommitmentPoint[] }) {
  // Recharts mede o contêiner: só desenha depois que o cliente montou.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const points = data.map((p) => ({
    month: monthShortLabel(p.month).split('/')[0],
    cents: Number(p.remainingCents),
    reais: Number(p.remainingCents) / 100,
  }));
  const hasData = points.some((p) => p.cents > 0);

  if (!mounted) return <div className="mt-[22px] h-[180px]" />;
  if (!hasData) {
    return (
      <p className="py-10 text-center text-sm text-ink-2">Sem parcelas comprometidas à frente.</p>
    );
  }

  return (
    <>
      <div className="mt-[22px] overflow-x-auto">
        <div className="h-[190px] min-w-[540px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={points} margin={{ top: 18, right: 4, bottom: 0, left: 4 }}>
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11, fill: 'var(--ink-2)' }}
                tickLine={false}
                axisLine={false}
              />
              <Bar dataKey="reais" radius={[8, 8, 0, 0]} maxBarSize={34} isAnimationActive>
                <LabelList
                  dataKey="cents"
                  position="top"
                  formatter={(v) => (Number(v) > 0 ? brlShort(Number(v)) : '—')}
                  style={{ fontSize: 10.5, fontWeight: 600 }}
                  fill="var(--ink-2)"
                />
                {points.map((p) => (
                  <Cell
                    key={p.month}
                    fill={
                      p.cents === 0
                        ? 'var(--track)'
                        : isHeavyMonth(p.cents)
                          ? 'var(--warn)'
                          : 'var(--primary)'
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-4 border-t border-line pt-4 text-[12.5px] text-ink-2">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px] bg-warn" />
          mês pesado (acima de {brl(HEAVY_MONTH_CENTS)})
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px] bg-primary" />
          parcelas comprometidas
        </span>
      </div>
    </>
  );
}
