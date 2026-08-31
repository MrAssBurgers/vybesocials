import { memo } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isNativePerfMode } from '@/lib/nativePerfMode';
import { VybeMiniIcon } from '@/components/ui/VybeMiniIcon';
import type { ClipsFeedTab } from '@/lib/clipsLayout';

interface ClipsFeedHeaderProps {
  active: ClipsFeedTab;
  onChange: (tab: ClipsFeedTab) => void;
}

function TabButton({
  label,
  isActive,
  isDark,
  onClick,
}: {
  label: string;
  isActive: boolean;
  isDark: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      className="relative min-h-11 min-w-11 px-1 py-0.5"
    >
      <span
        className={cn(
          'text-[13px] sm:text-[15px] font-semibold transition-all',
          isDark && 'drop-shadow-md',
          isActive
            ? 'bg-gradient-to-r from-primary via-accent to-[hsl(var(--neon-pink))] bg-clip-text text-transparent'
            : isDark
              ? 'text-white/50 hover:text-white/75'
              : 'text-muted-foreground hover:text-foreground',
        )}
      >
        {label}
      </span>
      {isActive && (
        <span
          aria-hidden
          className="absolute -bottom-1.5 left-1/2 h-0.5 w-6 -translate-x-1/2 rounded-full bg-gradient-to-r from-primary via-accent to-[hsl(var(--neon-pink))]"
        />
      )}
    </button>
  );
}

export const ClipsFeedHeader = memo(function ClipsFeedHeader({
  active,
  onChange,
}: ClipsFeedHeaderProps) {
  const nativePerf = isNativePerfMode();
  const isDark = active !== 'videos';

  return (
    <div
      className={cn(
        'fixed inset-x-0 top-0 z-40 pointer-events-none clips-feed-header',
        !isDark && 'bg-background/90 border-b border-border/40',
        !isDark && !nativePerf && 'backdrop-blur-md',
      )}
      style={{ paddingTop: 'var(--app-header-safe, env(safe-area-inset-top, 0px))' }}
    >
      <div className="relative flex items-center justify-between h-11 px-3 pointer-events-auto">
        <div className="flex items-center gap-1.5 w-10">
          <VybeMiniIcon size={22} className={cn('opacity-90', isDark && 'drop-shadow-lg')} />
        </div>

        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-3.5 sm:gap-5 max-w-[min(calc(100vw-7rem),240px)] justify-center">
          <TabButton
            label="Following"
            isActive={active === 'following'}
            isDark={isDark}
            onClick={() => onChange('following')}
          />
          <TabButton
            label="Clips"
            isActive={active === 'foryou'}
            isDark={isDark}
            onClick={() => onChange('foryou')}
          />
          <TabButton
            label="Videos"
            isActive={active === 'videos'}
            isDark={isDark}
            onClick={() => onChange('videos')}
          />
        </div>

        <Link
          to="/explore"
          className={cn(
            'w-11 h-11 rounded-full flex items-center justify-center text-foreground active:scale-95 transition-transform',
            nativePerf
              ? 'bg-card/80 border border-border/40'
              : 'liquid-glass-button border border-primary/20',
          )}
          aria-label="Search and explore"
        >
          <Search className="w-4 h-4" strokeWidth={2.25} />
        </Link>
      </div>
    </div>
  );
});
