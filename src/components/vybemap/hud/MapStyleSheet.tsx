import { MAP_VIEW_MODES, type MapViewMode } from '@/lib/vybemap/mapbox/config';
import { cn } from '@/lib/utils';
import { MapLiquidSheet } from '@/components/vybemap/MapLiquidSheet';

interface MapStyleSheetProps {
  mode: MapViewMode;
  onSelect: (mode: MapViewMode) => void;
  onClose: () => void;
}

export function MapStyleSheet({ mode, onSelect, onClose }: MapStyleSheetProps) {
  return (
    <MapLiquidSheet
      onClose={onClose}
      title={<h3 className="text-lg font-bold text-foreground">Map Style</h3>}
    >
      <div className="grid grid-cols-3 gap-2">
        {MAP_VIEW_MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => { onSelect(m.id); onClose(); }}
            className={cn(
              'flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all',
              mode === m.id
                ? 'border-primary bg-primary/20 text-foreground'
                : 'border-border/40 bg-card/30 text-muted-foreground',
            )}
          >
            <span className="text-2xl">{m.icon}</span>
            <span className="text-xs font-bold">{m.label}</span>
          </button>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground text-center mt-4">
        3D mode enables buildings, terrain elevation, and smooth tilt
      </p>
    </MapLiquidSheet>
  );
}
