'use client';

import { Check, TriangleAlert, X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { type MonthReview, api } from '@/lib/api';
import { monthLongLabel } from '@/lib/dates';
import { brl, splitBrl } from '@/lib/format';

/** Uma cor por slide, como no design: cada capítulo tem seu clima. */
const SLIDE_COLORS = ['#0F9B8E', '#E5484D', '#820AD1', '#F5A524'];

export default function RevisaoPage() {
  return (
    <Suspense fallback={<p className="p-8 text-center text-sm text-ink-2">Carregando…</p>}>
      <Revisao />
    </Suspense>
  );
}

function Revisao() {
  const router = useRouter();
  const params = useSearchParams();
  const month = params.get('mes');
  const [review, setReview] = useState<MonthReview | null>(null);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const query = month ? `?month=${month}` : '';
    api<MonthReview>(`/reports/revisao${query}`)
      .then(setReview)
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [month]);

  /** Só entra o slide que tem o que contar — retrospectiva vazia é pior que nenhuma. */
  const slides = useMemo(() => buildSlides(review), [review]);

  async function close() {
    if (review) {
      // Marca como vista para o aviso do painel sumir.
      await api('/settings/revisao-vista', {
        method: 'POST',
        body: JSON.stringify({ month: review.month }),
      }).catch(() => undefined);
    }
    router.push('/painel');
    router.refresh();
  }

  if (loading) return <p className="py-16 text-center text-sm text-ink-2">Carregando…</p>;
  if (!review) return <p className="py-16 text-center text-sm text-ink-2">Nada para mostrar.</p>;

  if (review.empty || slides.length === 0) {
    return (
      <div className="mx-auto max-w-[440px] py-16 text-center">
        <h1 className="font-manrope text-2xl font-bold text-ink">
          Sem retrospectiva de {monthLongLabel(review.month)}
        </h1>
        <p className="mt-2 text-sm text-ink-2">
          Não houve lançamento nesse mês. Assim que houver movimento, a retrospectiva aparece aqui.
        </p>
        <button
          type="button"
          onClick={close}
          className="mt-6 h-12 rounded-full bg-primary px-6 text-[15px] font-semibold text-white transition-colors hover:bg-primary-hover"
        >
          Voltar ao painel
        </button>
      </div>
    );
  }

  const slide = slides[step];
  const background = SLIDE_COLORS[step % SLIDE_COLORS.length];
  const last = step === slides.length - 1;

  return (
    <div
      className="-mx-4 -my-6 flex min-h-[calc(100dvh-57px)] items-center justify-center p-6 transition-colors"
      style={{ background }}
    >
      <div className="w-full max-w-[440px]">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex gap-1.5">
            {slides.map((_, i) => (
              <span
                key={i}
                className="h-1.5 rounded-[3px] transition-all"
                style={{
                  width: i === step ? 26 : 6,
                  background: i <= step ? '#fff' : 'rgba(255,255,255,.4)',
                }}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Fechar retrospectiva"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-white transition-colors hover:bg-white/30"
          >
            <X className="h-4 w-4" strokeWidth={2.2} />
          </button>
        </div>

        <div key={step} className="flex min-h-[420px] flex-col text-white">
          <div className="text-sm font-semibold uppercase tracking-[0.06em] text-white/70">
            Retrospectiva · {monthLongLabel(review.month)}
          </div>
          <h1 className="mt-3 font-manrope text-[30px] font-extrabold leading-tight tracking-[-0.02em]">
            {slide.title}
          </h1>

          <div className="mt-8 flex-1">{slide.body}</div>

          {slide.hint && (
            <div className="mt-2 text-sm leading-relaxed text-white/80">{slide.hint}</div>
          )}
        </div>

        <button
          type="button"
          onClick={() => (last ? close() : setStep((s) => s + 1))}
          className="mt-6 h-[54px] w-full rounded-full bg-white text-base font-bold transition-transform active:scale-[.99]"
          style={{ color: background }}
        >
          {last ? 'Fechar' : 'Continuar'}
        </button>
      </div>
    </div>
  );
}

interface Slide {
  title: string;
  body: React.ReactNode;
  hint?: string;
}

function BigNumber({ cents, sub }: { cents: string; sub: string }) {
  const parts = splitBrl(cents);
  return (
    <>
      <div className="flex items-baseline gap-1.5">
        <span className="font-manrope text-[26px] font-semibold opacity-80">{parts.currency}</span>
        <span className="font-manrope text-[64px] font-extrabold leading-none tracking-[-0.03em] tabular-nums">
          {parts.whole}
        </span>
        <span className="font-manrope text-[26px] font-extrabold opacity-70">
          {parts.fraction}
        </span>
      </div>
      <div className="mt-2.5 text-base text-white/80">{sub}</div>
    </>
  );
}

function buildSlides(review: MonthReview | null): Slide[] {
  if (!review) return [];
  const slides: Slide[] = [];
  const income = Number(review.incomeCents);
  const expense = Number(review.expenseCents);
  const leftover = Number(review.leftoverCents);
  const avgIncome = Number(review.comparison.avgIncomeCents);
  const avgExpense = Number(review.comparison.avgExpenseCents);

  if (income > 0) {
    const diff = income - avgIncome;
    slides.push({
      title: leftover >= 0 ? 'Entrou mais do que saiu' : 'Saiu mais do que entrou',
      body: <BigNumber cents={review.incomeCents} sub="de entradas no mês" />,
      hint:
        review.comparison.months > 0 && avgIncome > 0
          ? `${brl(Math.abs(diff))} ${diff >= 0 ? 'a mais' : 'a menos'} que a média dos últimos ${review.comparison.months} meses.`
          : undefined,
    });
  }

  if (expense > 0) {
    const diff = expense - avgExpense;
    slides.push({
      title: 'Pra onde foi',
      body: (
        <BigNumber
          cents={review.expenseCents}
          sub={
            review.spentPercent !== null
              ? `de saídas — ${review.spentPercent}% do que entrou`
              : 'de saídas no mês'
          }
        />
      ),
      hint:
        leftover >= 0
          ? `Sobrou ${brl(leftover)} pra investir ou guardar.` +
            (review.comparison.months > 0 && avgExpense > 0
              ? ` Você gastou ${brl(Math.abs(diff))} ${diff >= 0 ? 'a mais' : 'a menos'} que a média.`
              : '')
          : `Faltou ${brl(Math.abs(leftover))} — o mês fechou no vermelho.`,
    });
  }

  if (review.topCategories.length > 0) {
    const maior = Number(review.topCategories[0].totalCents);
    slides.push({
      title: 'Onde você mais gastou',
      body: (
        <div className="flex flex-col gap-3">
          {review.topCategories.map((c) => (
            <div key={c.category.id}>
              <div className="mb-1.5 flex items-baseline justify-between gap-3">
                <span className="truncate text-base font-semibold">{c.category.name}</span>
                <span className="shrink-0 font-manrope text-base font-bold tabular-nums">
                  {brl(c.totalCents)}
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-white/25">
                <div
                  className="h-full rounded-full bg-white"
                  style={{
                    width: `${maior > 0 ? Math.round((Number(c.totalCents) / maior) * 100) : 0}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      ),
      hint: `Só essas ${review.topCategories.length} somam ${brl(
        review.topCategories.reduce((sum, c) => sum + Number(c.totalCents), 0),
      )}.`,
    });
  }

  if (review.budgets.length > 0) {
    const estourados = review.budgets.filter((b) => b.exceeded).length;
    slides.push({
      title: 'Bateu o orçamento?',
      body: (
        <div className="flex flex-col gap-3">
          {review.budgets.map((b) => (
            <div
              key={b.category.id}
              className="flex items-center gap-3 rounded-[14px] bg-white/15 px-4 py-3.5"
            >
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                style={{ background: b.exceeded ? 'var(--negative)' : 'var(--positive)' }}
              >
                {b.exceeded ? (
                  <TriangleAlert className="h-4 w-4" strokeWidth={2.2} />
                ) : (
                  <Check className="h-4 w-4" strokeWidth={2.6} />
                )}
              </span>
              <span className="min-w-0 flex-1 truncate text-[15px] font-medium">
                {b.category.name}
              </span>
              <span className="shrink-0 font-manrope text-[15px] font-bold">
                {b.exceeded ? 'estourou' : 'dentro'}
              </span>
            </div>
          ))}
        </div>
      ),
      hint:
        estourados === 0
          ? 'Todos os limites respeitados. Mês redondo.'
          : `${estourados} de ${review.budgets.length} passaram do limite.`,
    });
  }

  return slides;
}
