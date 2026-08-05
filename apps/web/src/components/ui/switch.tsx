'use client';

import { cn } from '@/lib/utils';

/**
 * Interruptor das preferências de aviso (Fase 9). É um `<button role="switch">`
 * puro — sem primitiva nova do Radix para um controle deste tamanho.
 */
export function Switch({
  checked,
  onCheckedChange,
  disabled,
  label,
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:shadow-[var(--ring)] disabled:opacity-60',
        checked ? 'bg-primary' : 'bg-[var(--track)]',
        className,
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left]',
          checked ? 'left-[22px]' : 'left-0.5',
        )}
      />
    </button>
  );
}
