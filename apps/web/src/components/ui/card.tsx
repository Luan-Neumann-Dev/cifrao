import * as React from 'react';
import { cn } from '@/lib/utils';

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-[20px] border border-[var(--card-border)] bg-surface p-5 shadow-[var(--card-shadow)]',
        className,
      )}
      {...props}
    />
  );
}
