import { Search, type LucideIcon } from 'lucide-react';
import type { ChangeEventHandler, ReactNode } from 'react';
import { Input } from './ui/Input.js';

interface SearchToolbarProps {
  label: string;
  placeholder: string;
  value: string;
  onChange: ChangeEventHandler<HTMLInputElement>;
  actions?: ReactNode;
  icon?: LucideIcon;
}

export function SearchToolbar({ label, placeholder, value, onChange, actions, icon: Icon = Search }: SearchToolbarProps) {
  return <section className="mb-6 flex min-h-15 items-center gap-3 rounded-xl border bg-card p-2.5 shadow-xs" aria-label={label}>
    <label className="flex min-w-0 flex-1 items-center gap-2 px-2 text-muted-foreground">
      <Icon size={17} aria-hidden="true" />
      <span className="sr-only">{label}</span>
      <Input type="search" aria-label={label} value={value} onChange={onChange} placeholder={placeholder} className="border-0 bg-transparent shadow-none" />
    </label>
    {actions && <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>}
  </section>;
}
