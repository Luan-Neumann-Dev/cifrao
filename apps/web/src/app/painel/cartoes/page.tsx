'use client';

import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CreditCardVisual } from '@/components/credit-card-visual';
import { type CreditCardWithAvailability, api } from '@/lib/api';
import { brl } from '@/lib/format';

export default function CartoesPage() {
  const [cards, setCards] = useState<CreditCardWithAvailability[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setCards(await api<CreditCardWithAvailability[]>('/credit-cards'));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openTotal = cards.reduce((sum, c) => sum + Number(c.availability.openInvoiceCents), 0);

  return (
    <div>
      <div className="flex items-center justify-between gap-3 px-0.5 pt-1">
        <div>
          <h1 className="font-manrope text-[26px] font-bold tracking-[-0.015em] text-ink">
            Cartões
          </h1>
          <p className="mt-1.5 text-sm text-ink-2">
            {loading ? (
              'carregando…'
            ) : (
              <>
                {cards.length} {cards.length === 1 ? 'cartão' : 'cartões'} · fatura total aberta{' '}
                <span className="font-manrope font-semibold text-ink">{brl(openTotal)}</span>
              </>
            )}
          </p>
        </div>
        <Link
          href="/painel/cartoes/novo"
          className="inline-flex h-11 shrink-0 items-center gap-[7px] rounded-full bg-primary pl-[15px] pr-[18px] text-sm font-semibold text-white transition-colors hover:bg-primary-hover"
        >
          <Plus className="h-[18px] w-[18px]" />
          Novo cartão
        </Link>
      </div>

      <div className="mt-[22px] flex flex-col gap-3.5">
        {cards.map((c) => (
          <Link
            key={c.id}
            href={`/painel/cartoes/${c.id}`}
            className="block transition-transform hover:-translate-y-[3px]"
          >
            <CreditCardVisual
              nickname={c.nickname}
              brand={c.brand}
              last4={c.last4}
              color={c.color}
            >
              <div className="mt-[26px] flex items-end justify-between gap-3">
                <div>
                  <div className="text-[11.5px] text-white/70">Fatura atual</div>
                  <div className="mt-0.5 font-manrope text-[22px] font-bold tabular-nums">
                    {brl(c.availability.openInvoiceCents)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[11.5px] text-white/70">Limite disponível</div>
                  <div className="mt-[3px] font-manrope text-[15px] font-semibold tabular-nums">
                    {brl(c.availability.availableCents)}
                  </div>
                </div>
              </div>
            </CreditCardVisual>
          </Link>
        ))}
      </div>

      {!loading && cards.length === 0 && (
        <p className="mt-6 text-center text-sm text-ink-2">
          Nenhum cartão ainda. Cadastre o primeiro para lançar compras e faturas.
        </p>
      )}
    </div>
  );
}
