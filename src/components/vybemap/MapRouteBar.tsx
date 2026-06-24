import { motion } from 'framer-motion';
import { Navigation, X, Clock, Route, Shield } from 'lucide-react';
import type { MapLocationIntel } from '@/lib/vybemap/types';
import { LocationIntelBadge } from '@/components/vybemap/LocationIntelPanel';

interface MapRouteBarProps {
  label: string;
  durationMinutes: number;
  distanceMiles: number;
  onClose: () => void;
  onOpenExternal: () => void;
  destIntel?: MapLocationIntel | null;
}

export function MapRouteBar({
  label,
  durationMinutes,
  distanceMiles,
  onClose,
  onOpenExternal,
  destIntel,
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
        <div className="h-10 w-10 rounded-full bg-black/[0.06] flex items-center justify-center shrink-0">
          <Route className="h-5 w-5 text-[#111]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-[#111] truncate">{label}</p>
          <p className="text-[10px] text-black/45 flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" /> {durationMinutes} min
            </span>
            <span>{distanceMiles < 10 ? distanceMiles.toFixed(1) : Math.round(distanceMiles)} mi</span>
            <span className="text-emerald-600 font-semibold">Live ETA</span>
            {destIntel && destIntel.verdict !== 'safe' && (
              <LocationIntelBadge
                verdict={destIntel.verdict}
                topLabel={destIntel.labels[0]?.title}
              />
            )}
          </p>
          {destIntel && destIntel.verdict !== 'safe' && (
            <p className="text-[9px] text-amber-800/80 mt-1 flex items-center gap-1 line-clamp-2">
              <Shield className="h-3 w-3 shrink-0" />
              {destIntel.summary}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onOpenExternal}
          className="h-9 px-3 rounded-xl bg-[#111] text-white text-xs font-bold flex items-center gap-1 shrink-0"
        >
          <Navigation className="h-3.5 w-3.5" /> Go
        </button>
        <button type="button" onClick={onClose} className="h-8 w-8 rounded-full bg-black/[0.06] flex items-center justify-center text-black/60 shrink-0">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </motion.div>
  );
}
