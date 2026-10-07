import { cn } from '@/lib/utils';

/**
 * Marca do Cifrão: um "c" cortado por duas barras — o cifrão português
 * original. Mesmo desenho de `public/icon.svg` e dos PNGs do PWA, mas aqui o
 * fundo segue `--primary`, então acompanha o tema escuro e a cor de acento.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className={cn('h-8 w-8 shrink-0', className)}>
      <rect width="100" height="100" rx="23" fill="var(--primary)" />
      <g transform="translate(50 50) scale(0.88) translate(-50 -50)">
        <path d="M46 14V86M57 14V86" stroke="#fff" strokeWidth="6" strokeLinecap="round" />
        <path
          d="M68.3 35.3A22 22 0 1 0 68.3 64.7"
          fill="none"
          stroke="#fff"
          strokeWidth="12"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}

/** Marca + nome, para cabeçalho, menu e telas de entrada. */
export function Logo({ className, markClassName }: { className?: string; markClassName?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark className={markClassName} />
      <span className="font-manrope font-extrabold tracking-tight text-ink">cifrão</span>
    </span>
  );
}
