import { memo } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isNativePerfMode } from '@/lib/nativePerfMode';
import type { ClipsFeedTab } from '@/lib/clipsLayout';

interface ClipsFeedHeaderProps {
  active: ClipsFeedTab;
  onChange: (tab: ClipsFeedTab) => void;
}

export const ClipsFeedHeader = memo(function ClipsFeedHeader({
  active,
  onChange,
}: ClipsFeedHeaderProps) {
  const nativePerf = isNativePerfMode();

  return (
    <div
      className="fixed inset-x-0 top-0 z-40 pointer-events-none"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="relative flex items-center justify-center h-11 px-3 pointer-events-auto">
        <div className="flex items-center gap-5 sm:gap-6">
          <button
            type="button"
            onClick={() => onChange('following')}
            className={cn(
              'relative text-[15px] font-semibold transition-colors drop-shadow-md',
              active === 'following' ? 'text-white' : 'text-white/45',
            )}
          >
            Following
            {active === 'following' && (
              <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 h-0.5 w-5 rounded-full bg-white" />
            )}
          </button>
          <button
            type="button"
            onClick={() => onChange('foryou')}
            className={cn(
              'relative text-[15px] font-semibold transition-colors drop-shadow-md',
              active === 'foryou' ? 'text-white' : 'text-white/45',
            )}
          >
            For You
            {active === 'foryou' && (
              <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 h-0.5 w-5 rounded-full bg-white" />
            )}
          </button>
        </div>

        <Link
          to="/explore"
          className={cn(
            'absolute right-2 w-9 h-9 rounded-full flex items-center justify-center text-white active:scale-95 transition-transform',
            !nativePerf && 'bg-black/30 backdrop-blur-sm',
            nativePerf && 'bg-black/45',
          )}
          aria-label="Search and explore"
        >
          <Search className="w-5 h-5" strokeWidth={2.25} />
        </Link>
      </div>
    </div>
  );
});
