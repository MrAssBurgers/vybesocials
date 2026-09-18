import { MapPin, Navigation, Crosshair } from 'lucide-react';
import { motion } from 'framer-motion';

export type RouteOriginChoice = 'live' | 'map';

interface RouteOriginPickerProps {
  label: string;
  hasLiveLocation: boolean;
  hasMapPosition: boolean;
  onChoose: (origin: RouteOriginChoice) => void;
  onCancel: () => void;
}

/**
 * When starting or changing a route, pick whether the path starts from
 * live GPS or the current map camera (spoofed / explored position).
 */
export function RouteOriginPicker({
  label,
  hasLiveLocation,
  hasMapPosition,
  onChoose,
  onCancel,
}: RouteOriginPickerProps) {
  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[2200] bg-black/45"
        onClick={onCancel}
      />
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 32, stiffness: 380 }}
        className="fixed inset-x-0 bottom-0 z-[2201] rounded-t-[1.75rem] bg-[#121212]/96 backdrop-blur-2xl border-t border-white/8 px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20" />
        <h3 className="text-base font-bold text-white tracking-tight mb-1">Start navigation</h3>
        <p className="text-[12px] text-white/50 mb-4 truncate">To {label.replace(/^Route to /, '')}</p>
        <div className="space-y-2">
          <button
            type="button"
            disabled={!hasLiveLocation}
            onClick={() => onChoose('live')}
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-white/8 border border-white/10 text-left disabled:opacity-40"
          >
            <span className="h-10 w-10 rounded-xl bg-emerald-500/20 flex items-center justify-center shrink-0">
              <Navigation className="h-5 w-5 text-emerald-300" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-white">Live location</span>
              <span className="block text-[11px] text-white/45">Route from where you are right now</span>
            </span>
          </button>
          <button
            type="button"
            disabled={!hasMapPosition}
            onClick={() => onChoose('map')}
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-white/8 border border-white/10 text-left disabled:opacity-40"
          >
            <span className="h-10 w-10 rounded-xl bg-sky-500/20 flex items-center justify-center shrink-0">
              <Crosshair className="h-5 w-5 text-sky-300" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-white">Map position</span>
              <span className="block text-[11px] text-white/45">
                From the pin where you are looking on the map
              </span>
            </span>
          </button>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="mt-3 w-full h-11 rounded-xl text-sm font-semibold text-white/60"
        >
          Cancel
        </button>
        <p className="mt-1 text-[10px] text-white/35 text-center flex items-center justify-center gap-1">
          <MapPin className="h-3 w-3" /> Existing route stays on the map until you end it
        </p>
      </motion.div>
    </>
  );
}
