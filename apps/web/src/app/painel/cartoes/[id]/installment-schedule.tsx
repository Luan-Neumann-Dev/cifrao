'use client';

import { useEffect, useState } from 'react';
import { type PurchaseDetail, api } from '@/lib/api';
import { monthLongLabel } from '@/lib/dates';
import { brl } from '@/lib/format';

/**
 * Cronograma da compra parcelada (regra 5.4): as N parcelas, em que fatura cada
 * uma cai, e qual delas é a desta fatura. É a resposta visual para "por que essa
 * compra de R$ 2.500 aparece como R$ 416,58 aqui".
 */
export function InstallmentSchedule({
  purchaseId,
  currentInvoiceId,
}: {
  purchaseId: string;
  currentInvoiceId: string;
}) {
  const [purchase, setPurchase] = useState<PurchaseDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api<PurchaseDetail>(`/purchases/${purchaseId}`)
      .then((p) => {
        if (alive) setPurchase(p);
      })
      .catch((e: Error) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [purchaseId]);

  return (
    <div className="pb-3.5 pl-[67px] pr-4">
      <div className="flex flex-col gap-[9px] border-l-2 border-line pl-3.5">
        {error ? (
          <span className="text-[12.5px] text-negative">{error}</span>
        ) : !purchase ? (
          <span className="text-[12.5px] text-ink-2">Carregando parcelas…</span>
        ) : (
          purchase.installments.map((inst) => {
            const atual = inst.invoiceId === currentInvoiceId;
            const color = atual ? 'var(--ink)' : 'var(--ink-2)';
            return (
              <div key={inst.transactionId} className="flex items-center justify-between gap-3">
                <span
                  className="inline-flex min-w-0 items-center gap-2.5 text-[12.5px]"
                  style={{ color }}
                >
                  <span className="w-[26px] shrink-0 font-manrope text-[11px] font-bold">
                    {inst.installmentNumber}/{purchase.installmentTotal}
                  </span>
                  <span className="truncate">
                    {inst.referenceMonth ? monthLongLabel(inst.referenceMonth) : '—'}
                  </span>
                  {atual && (
                    <span className="shrink-0 rounded-[5px] bg-primary-soft px-1.5 py-px text-[10px] font-bold uppercase tracking-[0.03em] text-primary">
                      esta fatura
                    </span>
                  )}
                </span>
                <span
                  className="shrink-0 font-manrope text-[12.5px] font-semibold tabular-nums"
                  style={{ color }}
                >
                  {brl(inst.amountCents)}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
