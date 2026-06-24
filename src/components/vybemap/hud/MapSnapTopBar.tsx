import { useState } from 'react';
import { ChevronLeft, Search, Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MapSnapTopBarProps {
  onBack: () => void;
  onSearch: (query: string) => void;
  onOpenSettings: () => void;
  radarLabel?: string;
  squadChip?: { label: string; onClear: () => void } | null;
  showBasicMapBanner?: boolean;
}

export function MapSnapTopBar({
  onBack,
  onSearch,
  onOpenSettings,
  radarLabel,
  squadChip,
  showBasicMapBanner,
}: MapSnapTopBarProps) {
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);

  const submit = () => {
    if (!query.trim()) return;
    onSearch(query.trim());
    setSearchOpen(false);
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-[1000] px-3 pt-[var(--app-header-top)]">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="pointer-events-auto vybe-map-pill h-11 w-11 shrink-0 flex items-center justify-center"
          aria-label="Go back"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        {searchOpen ? (
          <div className="pointer-events-auto flex flex-1 items-center gap-2 vybe-map-pill h-11 px-3">
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
            className="pointer-events-auto flex flex-1 items-center gap-2 vybe-map-pill h-11 px-4 text-sm text-black/45"
          >
            <Search className="h-4 w-4 shrink-0" />
            <span>Search map</span>
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

      {(radarLabel || squadChip || showBasicMapBanner) && (
        <div className="mt-2 flex flex-wrap gap-2">
          {radarLabel && (
            <span className="pointer-events-auto vybe-map-chip text-[11px] font-semibold text-emerald-200">
              {radarLabel}
            </span>
          )}
          {squadChip && (
            <button
              type="button"
              onClick={squadChip.onClear}
              className="pointer-events-auto vybe-map-chip text-[11px] font-semibold text-violet-200"
            >
              {squadChip.label} · exit
            </button>
          )}
          {showBasicMapBanner && (
            <span className="pointer-events-auto vybe-map-chip text-[10px] text-amber-100/90 max-w-[min(100%,20rem)] leading-snug">
              Basic map — add Mapbox token for 3D
            </span>
          )}
        </div>
      )}
    </div>
  );
}
