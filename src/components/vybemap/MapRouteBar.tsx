import { motion } from 'framer-motion';
import { Navigation, X, Clock, Route, Shield, Minimize2 } from 'lucide-react';
import type { MapLocationIntel } from '@/lib/vybemap/types';
import { LocationIntelBadge } from '@/components/vybemap/LocationIntelPanel';

interface MapRouteBarProps {
  label: string;
  durationMinutes: number;
  distanceMiles: number;
  /** Hide the big bar but keep the route line on the map. */
  onMinimize: () => void;
  /** Fully end / cancel navigation and clear the route line. */
  onEnd: () => void;
  onOpenExternal: () => void;
  destIntel?: MapLocationIntel | null;
  originLabel?: string;
}

export function MapRouteBar({
  label,
  durationMinutes,
  distanceMiles,
  onMinimize,
  onEnd,
  onOpenExternal,
  destIntel,
  originLabel,
}: MapRouteBarProps) {
  return (
    <motion.div
      initial={{ y: -60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -60, opacity: 0 }}
      className="pointer-events-auto absolute inset-x-3 z-[1100]"
      style={{ top: 'calc(var(--app-header-height) + 0.5rem)' }}
    >
      <div className="vybe-map-pill rounded-2xl px-4 py-3 flex items-center gap-3 !h-auto !rounded-2xl">
        <div className="h-10 w-10 rounded-full bg-white/8 flex items-center justify-center shrink-0">
          <Route className="h-5 w-5 text-white/80" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-white truncate">{label}</p>
          <p className="text-[10px] text-white/45 flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" /> {durationMinutes} min
            </span>
            <span>{distanceMiles < 10 ? distanceMiles.toFixed(1) : Math.round(distanceMiles)} mi</span>
            <span className="text-emerald-400 font-semibold">Live ETA</span>
            {originLabel && (
              <span className="text-sky-300/90 font-medium truncate max-w-[9rem]">{originLabel}</span>
            )}
            {destIntel && destIntel.verdict !== 'safe' && (
              <LocationIntelBadge
                verdict={destIntel.verdict}
                topLabel={destIntel.labels[0]?.title}
              />
            )}
          </p>
          {destIntel && destIntel.verdict !== 'safe' && (
            <p className="text-[9px] text-amber-200/80 mt-1 flex items-center gap-1 line-clamp-2">
              <Shield className="h-3 w-3 shrink-0" />
              {destIntel.summary}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onOpenExternal}
          className="h-9 px-3 rounded-xl bg-white text-[#111] text-xs font-bold flex items-center gap-1 shrink-0"
        >
          <Navigation className="h-3.5 w-3.5" /> Go
        </button>
        <button
          type="button"
          onClick={onMinimize}
          className="h-8 w-8 rounded-full bg-white/8 flex items-center justify-center text-white/70 shrink-0"
          aria-label="Hide route card — keep navigating"
          title="Hide card (route stays on map)"
        >
          <Minimize2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onEnd}
          className="h-8 w-8 rounded-full bg-white/8 flex items-center justify-center text-white/60 shrink-0"
          aria-label="End navigation"
          title="End navigation"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </motion.div>
  );
}

/** Compact chip when the full route bar is minimized — route line stays drawn. */
export function MapRouteMinimizedChip({
  label,
  onExpand,
  onEnd,
}: {
  label: string;
  onExpand: () => void;
  onEnd: () => void;
}) {
  return (
    <motion.div
      initial={{ y: -40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -40, opacity: 0 }}
      className="pointer-events-auto absolute left-3 right-3 z-[1100] flex justify-center"
      style={{ top: 'calc(var(--app-header-height) + 0.5rem)' }}
    >
      <div className="vybe-map-pill !h-auto rounded-full pl-3 pr-1.5 py-1.5 flex items-center gap-2 max-w-full">
        <button
          type="button"
          onClick={onExpand}
          className="flex items-center gap-2 min-w-0 text-left"
          aria-label="Show route details"
        >
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
          <span className="text-[11px] font-bold text-white truncate">
            Navigating · {label.replace(/^Route to /, '')}
          </span>
        </button>
        <button
          type="button"
          onClick={onEnd}
          className="h-7 w-7 rounded-full bg-white/10 flex items-center justify-center text-white/70 shrink-0"
          aria-label="End navigation"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </motion.div>
  );
}
