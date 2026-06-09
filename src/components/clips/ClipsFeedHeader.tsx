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
  onClick,
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative px-1 py-0.5"
    >
      <span
        className={cn(
          'text-[15px] font-semibold transition-all drop-shadow-md',
          isActive
            ? 'bg-gradient-to-r from-primary via-accent to-[hsl(var(--neon-pink))] bg-clip-text text-transparent'
            : 'text-white/50 hover:text-white/75',
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

  return (
    <div
      className="fixed inset-x-0 top-0 z-40 pointer-events-none clips-feed-header"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="relative flex items-center justify-between h-11 px-3 pointer-events-auto">
        <div className="flex items-center gap-1.5 w-10">
          <VybeMiniIcon size={22} className="drop-shadow-lg opacity-90" />
        </div>

        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-5 sm:gap-6">
          <TabButton
            label="Following"
            isActive={active === 'following'}
            onClick={() => onChange('following')}
          />
          <TabButton
            label="For You"
            isActive={active === 'foryou'}
            onClick={() => onChange('foryou')}
          />
        </div>

        <Link
          to="/explore"
          className={cn(
            'w-9 h-9 rounded-full flex items-center justify-center text-foreground active:scale-95 transition-transform',
            nativePerf
              ? 'bg-card/80 border border-white/10'
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
