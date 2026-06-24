import { useState } from 'react';
import { ChevronLeft, Search, Settings2 } from 'lucide-react';
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
      <div className="vybe-map-top-fade px-3 pt-[var(--app-header-top)] pb-6">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onBack}
            className="pointer-events-auto vybe-map-pill h-11 w-11 shrink-0 flex items-center justify-center"
            aria-label="Go back"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          {searchOpen ? (
            <div className="pointer-events-auto flex flex-1 items-center gap-2 vybe-map-pill h-11 px-3.5">
              <Search className="h-4 w-4 text-black/35 shrink-0" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submit();
                  if (e.key === 'Escape') setSearchOpen(false);
                }}
                placeholder="Search a city or place…"
                className="flex-1 bg-transparent text-sm text-[#111] placeholder:text-black/35 outline-none min-w-0"
              />
              <button type="button" onClick={submit} className="text-xs font-bold text-[#111] px-1">
                Go
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="pointer-events-auto flex flex-1 items-center gap-2.5 vybe-map-pill h-11 px-4 min-w-0"
            >
              <Search className="h-4 w-4 text-black/30 shrink-0" />
              <span className="text-sm font-semibold text-black/80 truncate">VybeMap</span>
              <span className="text-[10px] text-black/35 truncate hidden sm:inline">· search</span>
            </button>
          )}

          <button
            type="button"
            onClick={onOpenSettings}
            className="pointer-events-auto vybe-map-pill h-11 w-11 shrink-0 flex items-center justify-center"
            aria-label="Map settings"
          >
            <Settings2 className="h-[18px] w-[18px]" />
          </button>
        </div>

        {(radarLabel || squadChip || liveSharing !== undefined) && (
          <div className="mt-2.5 flex flex-wrap gap-2">
            {liveSharing !== undefined && (
              <span
                className={cn(
                  'pointer-events-auto vybe-map-status-chip',
                  liveSharing ? 'vybe-map-status-chip-live' : 'vybe-map-status-chip-ghost',
                )}
              >
                <span className={cn('h-1.5 w-1.5 rounded-full', liveSharing ? 'bg-emerald-400' : 'bg-amber-400')} />
                {liveSharing ? 'You\'re on the map' : 'Ghost mode'}
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
