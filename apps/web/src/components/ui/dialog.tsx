'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export const DialogTitle = DialogPrimitive.Title;

/** Diálogo centralizado — o padrão das telas anteriores. */
const CENTERED =
  'fixed left-1/2 top-1/2 z-50 grid w-[calc(100vw-32px)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 rounded-[20px] border border-[var(--card-border)] bg-surface p-6 shadow-xl';

/**
 * Bottom sheet no celular, diálogo a partir de `sm` — o que o design pede para
 * as ações mais longas (Seção 4: no mobile a ação primária vem em sheet, não
 * num modal centralizado que o teclado empurra para fora da tela).
 */
const SHEET =
  'fixed inset-x-0 bottom-0 z-50 flex max-h-[94dvh] w-full flex-col overflow-y-auto rounded-t-[26px] border border-[var(--card-border)] bg-surface shadow-xl ' +
  'sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-h-[calc(100dvh-48px)] sm:w-[calc(100vw-32px)] sm:max-w-[440px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[24px]';

export function DialogContent({
  className,
  children,
  title,
  sheet = false,
  hideClose = false,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  title?: string;
  /** Vira bottom sheet abaixo de `sm`. */
  sheet?: boolean;
  /** Some com o X padrão — para quem desenha o próprio cabeçalho. */
  hideClose?: boolean;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-[rgba(26,21,35,0.45)] data-[state=open]:animate-in data-[state=open]:fade-in" />
      <DialogPrimitive.Content className={cn(sheet ? SHEET : CENTERED, className)} {...props}>
        {title && (
          <DialogPrimitive.Title className="text-lg font-bold tracking-tight text-ink">
            {title}
          </DialogPrimitive.Title>
        )}
        {children}
        {!hideClose && (
          <DialogPrimitive.Close className="absolute right-4 top-4 rounded-md text-ink-2 transition-colors hover:text-ink focus-visible:outline-none">
            <X className="h-5 w-5" />
            <span className="sr-only">Fechar</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
