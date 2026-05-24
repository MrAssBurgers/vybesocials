import type { LucideIcon } from 'lucide-react';
import { Inbox } from 'lucide-react';
import type { ReactNode } from 'react';

interface Props {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

/**
 * Friendly empty state for lists, feeds, and grids. Replaces the "blank
 * screen after skeleton" anti-pattern that makes the app look broken.
 */
export function EmptyState({ icon: Icon = Inbox, title, description, action, className }: Props) {
  return (
    <div
      role="status"
      className={
        'flex flex-col items-center justify-center text-center px-6 py-12 gap-3 ' +
        (className || '')
      }
    >
      <div className="size-14 rounded-2xl bg-muted/60 grid place-items-center">
        <Icon className="size-7 text-muted-foreground" aria-hidden="true" />
      </div>
      <div className="space-y-1 max-w-xs">
        <h3 className="text-base font-semibold">{title}</h3>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}
