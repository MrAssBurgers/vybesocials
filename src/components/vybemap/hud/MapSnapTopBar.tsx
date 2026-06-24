import { useState } from 'react';
import { ChevronLeft, Search, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MapSnapTopBarProps {
  onBack: () => void;
  onSearch: (query: string) => void;
  onOpenSettings: () => void;
  radarLabel?: string;
  squadChip?: { label: string; onClear: () => void } | null;
  liveSharing?: boolean;
}

export function MapSnapTopBar({
  onBack,
  onSearch,
  onOpenSettings,
  radarLabel,
  squadChip,
  liveSharing,
}: MapSnapTopBarProps) {
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);

  const submit = () => {
    if (!query.trim()) return;
    onSearch(query.trim());
    setSearchOpen(false);
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-[1000]">
      <div className="vybe-map-top-fade px-3 pt-[var(--app-header-top)] pb-5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="pointer-events-auto vybe-map-pill h-10 w-10 shrink-0 flex items-center justify-center"
            aria-label="Go back"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          {searchOpen ? (
            <div className="pointer-events-auto flex flex-1 items-center gap-2 vybe-map-pill h-10 px-3">
              <Search className="h-4 w-4 shrink-0 opacity-60" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submit();
                  if (e.key === 'Escape') setSearchOpen(false);
                }}
                placeholder="City, address, or place…"
                className="flex-1 bg-transparent text-sm outline-none min-w-0"
              />
              <button
                type="button"
                onClick={submit}
                className="text-[11px] font-bold uppercase tracking-wide opacity-90 px-1"
              >
                Go
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="pointer-events-auto flex flex-1 items-center gap-2.5 vybe-map-pill h-10 px-3.5 min-w-0"
            >
              <Search className="h-4 w-4 shrink-0 opacity-50" />
              <span className="vybe-map-brand text-[15px] truncate">VybeMap</span>
              <span className="text-[11px] text-white/35 truncate hidden sm:inline">Search places</span>
            </button>
          )}

          <button
            type="button"
            onClick={onOpenSettings}
            className="pointer-events-auto vybe-map-pill h-10 w-10 shrink-0 flex items-center justify-center"
            aria-label="Map settings"
          >
            <SlidersHorizontal className="h-[17px] w-[17px]" />
          </button>
        </div>

        {(radarLabel || squadChip || liveSharing !== undefined) && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {liveSharing !== undefined && (
              <span
                className={cn(
                  'pointer-events-auto vybe-map-status-chip',
                  liveSharing ? 'vybe-map-status-chip-live' : 'vybe-map-status-chip-ghost',
                )}
              >
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    liveSharing ? 'bg-emerald-400 shadow-[0_0_6px_hsl(142_70%_55%)]' : 'bg-amber-400',
                  )}
                />
                {liveSharing ? "You're live" : 'Ghost mode'}
              </span>
            )}
            {radarLabel && (
              <span className="pointer-events-auto vybe-map-status-chip vybe-map-status-chip-live">
                {radarLabel}
              </span>
            )}
            {squadChip && (
              <button
                type="button"
                onClick={squadChip.onClear}
                className="pointer-events-auto vybe-map-status-chip vybe-map-status-chip-squad"
              >
                {squadChip.label} · exit
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
