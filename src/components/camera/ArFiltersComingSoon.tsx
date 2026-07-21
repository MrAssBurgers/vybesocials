import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ArFiltersComingSoonProps {
  className?: string;
  compact?: boolean;
}

/** Placeholder for AR lenses until face-filter engine ships. */
export function ArFiltersComingSoon({ className, compact = false }: ArFiltersComingSoonProps) {
  return (
    <div
      className={cn(
        'mx-auto flex max-w-sm flex-col items-center justify-center text-center',
        compact ? 'gap-1.5 px-4 py-3' : 'gap-2.5 px-5 py-5',
        'rounded-2xl border border-white/12 bg-black/55 backdrop-blur-md',
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <div
        className={cn(
          'flex items-center justify-center rounded-full border border-white/15 bg-white/10',
          compact ? 'h-9 w-9' : 'h-11 w-11',
        )}
      >
        <Sparkles className={cn('text-white/85', compact ? 'h-4 w-4' : 'h-5 w-5')} />
      </div>
      <p className={cn('font-semibold tracking-tight text-white', compact ? 'text-xs' : 'text-sm')}>
        AR filters coming soon
      </p>
      {!compact && (
        <p className="text-[11px] leading-relaxed text-white/55">
          Face lenses and effects are on the way. Color looks still work below.
        </p>
      )}
    </div>
  );
}
