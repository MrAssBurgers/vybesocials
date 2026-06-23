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
      className="pointer-events-auto absolute inset-x-3 top-[max(calc(var(--sat,0px)+4.5rem),5rem)] z-[1100]"
    >
      <div className="vybe-map-glass rounded-2xl px-4 py-3 flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
          <Route className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-white truncate">{label}</p>
          <p className="text-[10px] text-white/50 flex items-center gap-2 mt-0.5">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" /> {durationMinutes} min
            </span>
            <span>{distanceMiles < 10 ? distanceMiles.toFixed(1) : Math.round(distanceMiles)} mi</span>
            <span className="text-emerald-400 font-semibold">Live ETA</span>
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
          className="h-9 px-3 rounded-xl bg-primary text-primary-foreground text-xs font-bold flex items-center gap-1 shrink-0"
        >
          <Navigation className="h-3.5 w-3.5" /> Go
        </button>
        <button type="button" onClick={onClose} className="h-8 w-8 rounded-full bg-white/10 flex items-center justify-center text-white shrink-0">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </motion.div>
  );
}
