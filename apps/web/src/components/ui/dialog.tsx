'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  className,
  children,
  title,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { title?: string }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-[rgba(26,21,35,0.45)] data-[state=open]:animate-in data-[state=open]:fade-in" />
      <DialogPrimitive.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-50 grid w-[calc(100vw-32px)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 rounded-[20px] border border-[var(--card-border)] bg-surface p-6 shadow-xl',
          className,
        )}
        {...props}
      >
        {title && (
          <DialogPrimitive.Title className="text-lg font-bold tracking-tight text-ink">
            {title}
          </DialogPrimitive.Title>
        )}
        {children}
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-md text-ink-2 transition-colors hover:text-ink focus-visible:outline-none">
          <X className="h-5 w-5" />
          <span className="sr-only">Fechar</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
