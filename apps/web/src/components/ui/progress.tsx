import { cn } from '@/lib/utils';

/**
 * Barra de progresso do orçamento/meta. `value` é percentual (pode passar de
 * 100 — a barra satura, mas o número exibido continua honesto).
 */
export function Progress({
  value,
  className,
  barClassName,
  color,
}: {
  value: number;
  className?: string;
  barClassName?: string;
  color?: string;
}) {
  const width = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cn('h-2 w-full overflow-hidden rounded-full bg-[var(--track)]', className)}
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn('h-full rounded-full transition-[width]', barClassName ?? 'bg-primary')}
        style={{ width: `${width}%`, ...(color ? { background: color } : {}) }}
      />
    </div>
  );
}
