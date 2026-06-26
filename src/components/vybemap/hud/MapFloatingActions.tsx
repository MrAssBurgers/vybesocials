import { Crosshair, Compass, Navigation } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MapFloatingActionsProps {
  onRecenter: () => void;
  onFind?: () => void;
  findLabel?: string;
  disabled?: boolean;
  followHeading?: boolean;
  onToggleFollowHeading?: () => void;
  onResetBearing?: () => void;
}

export function MapFloatingActions({
  onRecenter,
  onFind,
  findLabel = 'Find',
  disabled,
  followHeading,
  onToggleFollowHeading,
  onResetBearing,
}: MapFloatingActionsProps) {
  return (
    <div
      className="pointer-events-none absolute right-3 z-[1000] flex flex-col items-end gap-2.5"
      style={{ bottom: 'calc(6.25rem + env(safe-area-inset-bottom, 0px))' }}
    >
      {onFind && (
        <button
          type="button"
          disabled={disabled}
          onClick={onFind}
          className={cn(
            'pointer-events-auto vybe-map-find-fab flex items-center gap-2 h-12 px-4 rounded-full font-bold text-sm',
            disabled && 'opacity-50',
          )}
        >
          <Crosshair className="h-4 w-4" />
          {findLabel}
        </button>
      )}
      {onToggleFollowHeading && (
        <button
          type="button"
          onClick={onToggleFollowHeading}
          onContextMenu={(e) => {
            e.preventDefault();
            onResetBearing?.();
          }}
          className={cn(
            'pointer-events-auto vybe-map-fab h-12 w-12 flex items-center justify-center',
            followHeading && 'ring-2 ring-primary/60 bg-primary/20',
          )}
          aria-label={followHeading ? 'Stop following phone direction' : 'Follow phone direction'}
          title={followHeading ? 'Following direction (tap to unlock)' : 'Follow phone direction'}
        >
          <Compass className={cn('h-5 w-5', followHeading && 'text-primary')} />
        </button>
      )}
      <button
        type="button"
        onClick={onRecenter}
        className="pointer-events-auto vybe-map-fab h-12 w-12 flex items-center justify-center"
        aria-label="Recenter on me"
      >
        <Navigation className="h-5 w-5" />
      </button>
    </div>
  );
}
