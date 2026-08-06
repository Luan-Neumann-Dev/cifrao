import type { ReactNode } from 'react';
import { cardGradient, cardShadow } from '@/lib/cards';
import { cn } from '@/lib/utils';

/**
 * O "plástico": degradê da cor do cartão com apelido, final e bandeira. Aparece
 * na lista, no topo do detalhe e como prévia ao vivo no formulário — por isso
 * mora aqui e não dentro de uma tela.
 */
export function CreditCardVisual({
  nickname,
  brand,
  last4,
  color,
  action,
  children,
  className,
}: {
  nickname: string;
  brand?: string | null;
  last4?: string | null;
  color?: string | null;
  /** Canto superior direito, ao lado da bandeira (ex.: botão de editar). */
  action?: ReactNode;
  /** Rodapé do cartão: fatura atual, disponível… */
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn('relative overflow-hidden rounded-[16px] px-[22px] py-5 text-white', className)}
      style={{ background: cardGradient(color), boxShadow: cardShadow(color) }}
    >
      {/* Os dois círculos claros do design, que dão relevo ao plástico. */}
      <span className="pointer-events-none absolute -right-[30px] -top-10 h-[150px] w-[150px] rounded-full bg-white/10" />
      <span className="pointer-events-none absolute bottom-20 right-[22px] h-24 w-24 rounded-full bg-white/[0.06]" />

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-manrope text-[17px] font-bold">{nickname}</div>
          <div className="mt-[5px] font-mono text-[13px] text-white/80">
            ···· {last4 || '••••'}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {action}
          {brand && (
            <span className="font-manrope text-sm font-extrabold tracking-[0.02em] text-white/90">
              {brand.toUpperCase()}
            </span>
          )}
        </div>
      </div>

      {children && <div className="relative">{children}</div>}
    </div>
  );
}
