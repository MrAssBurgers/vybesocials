import { Layers, Users, Calendar, Flame, User, Compass, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MapBottomDockProps {
  onLayers: () => void;
  onFriends: () => void;
  onEvents: () => void;
  onHotspots: () => void;
  onProfile: () => void;
  onCompass?: () => void;
  onSquads?: () => void;
  discoveryOpen: boolean;
  squadsOpen?: boolean;
}

export function MapBottomDock({
  onLayers, onFriends, onEvents, onHotspots, onProfile, onCompass, onSquads, discoveryOpen, squadsOpen,
}: MapBottomDockProps) {
  const items = [
    { icon: Layers, label: 'Layers', onClick: onLayers },
    { icon: Users, label: 'Friends', onClick: onFriends, active: discoveryOpen },
    { icon: Sparkles, label: 'Squads', onClick: onSquads ?? (() => {}), active: squadsOpen },
    { icon: Calendar, label: 'Events', onClick: onEvents },
    { icon: Flame, label: 'Hotspots', onClick: onHotspots },
    { icon: User, label: 'You', onClick: onProfile },
  ];

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1000] px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="pointer-events-auto flex items-end justify-between gap-2">
        <div className="flex-1 flex justify-center">
          <div className="flex items-center gap-1 rounded-2xl vybe-map-glass px-2 py-1.5">
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={item.onClick}
                className={cn(
                  'flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-xl transition-colors',
                  item.active ? 'bg-primary/25 text-primary' : 'text-white/70 hover:text-white',
                )}
              >
                <item.icon className="h-4 w-4" />
                <span className="text-[9px] font-bold">{item.label}</span>
              </button>
            ))}
          </div>
        </div>
        {onCompass && (
          <button
            type="button"
            onClick={onCompass}
            className="vybe-map-glass h-11 w-11 rounded-full flex items-center justify-center text-white shrink-0"
            aria-label="Reset compass"
          >
            <Compass className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
