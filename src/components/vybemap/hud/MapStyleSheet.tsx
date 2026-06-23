import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { MAP_VIEW_MODES, type MapViewMode } from '@/lib/vybemap/mapbox/config';
import { cn } from '@/lib/utils';

interface MapStyleSheetProps {
  mode: MapViewMode;
  onSelect: (mode: MapViewMode) => void;
  onClose: () => void;
}

export function MapStyleSheet({ mode, onSelect, onClose }: MapStyleSheetProps) {
  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[2000] bg-black/40" onClick={onClose} />
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        className="fixed inset-x-0 bottom-0 z-[2001] rounded-t-3xl bg-black/95 border-t border-white/10 p-5 pb-safe"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-white">Map Style</h3>
          <button type="button" onClick={onClose} className="p-2 text-white/50"><X className="h-5 w-5" /></button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {MAP_VIEW_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => { onSelect(m.id); onClose(); }}
              className={cn(
                'flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all',
                mode === m.id
                  ? 'border-primary bg-primary/20 text-white'
                  : 'border-white/10 bg-white/5 text-white/60',
              )}
            >
              <span className="text-2xl">{m.icon}</span>
              <span className="text-xs font-bold">{m.label}</span>
            </button>
          ))}
        </div>
        <p className="text-[10px] text-white/35 text-center mt-4">
          3D mode enables buildings, terrain elevation, and smooth tilt
        </p>
      </motion.div>
    </>
  );
}
