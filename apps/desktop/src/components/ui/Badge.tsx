import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/utils.js';

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span data-slot="badge" className={cn('inline-flex h-5 items-center rounded-full border px-2 text-[11px] font-semibold whitespace-nowrap', className)} {...props} />;
}
