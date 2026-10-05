import { motion } from 'framer-motion';
import { Ghost, Layers, MapPin, Plus, Sparkles, X, Compass, Footprints } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { MAP_VIEW_MODES, type MapViewMode } from '@/lib/vybemap/mapbox/config';
import { LAYER_LABELS, type MapLayer } from '@/lib/vybemap/types';
import { cn } from '@/lib/utils';

interface MapSettingsSheetProps {
  mapMode: MapViewMode;
  layers: Record<MapLayer, boolean>;
  sharing: boolean;
  sharingStatus?: string;
  hasMapbox: boolean;
  followHeading?: boolean;
  onFollowHeading?: (enabled: boolean) => void;
  onMapMode: (mode: MapViewMode) => void;
  onReturnTo3D?: () => void;
  onToggleLayer: (layer: MapLayer) => void;
  onGhost: () => void;
  onSquads: () => void;
  onDropSpot: () => void;
  onPlanMeetup: () => void;
  onWander?: () => void;
  onClose: () => void;
}

export function MapSettingsSheet({
  mapMode,
  layers,
  sharing, sharingStatus,
  hasMapbox,
  followHeading = false,
  onFollowHeading,
  onMapMode,
  onReturnTo3D,
  onToggleLayer,
  onGhost,
  onSquads,
  onDropSpot,
  onPlanMeetup,
  onWander,
  onClose,
}: MapSettingsSheetProps) {
  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[2100] bg-black/35"
        onClick={onClose}
      />
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 32, stiffness: 380 }}
        className="fixed inset-x-0 bottom-0 z-[2101] max-h-[78vh] overflow-y-auto rounded-t-[1.75rem] bg-[#121212]/96 backdrop-blur-2xl border-t border-white/8 px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20" />
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-bold text-white tracking-tight">Map settings</h3>
          <button type="button" aria-label="Close map settings" onClick={onClose} className="h-9 w-9 rounded-full bg-white/8 flex items-center justify-center text-white/70">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-6">
          {!hasMapbox && onReturnTo3D && (
            <section className="rounded-2xl border border-white/10 bg-white/4 p-4">
              <p className="text-sm font-semibold text-white">Flat map active</p>
              <button
                type="button"
                onClick={() => { onReturnTo3D(); onClose(); }}
                className="mt-3 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
              >
                Return to 3D world map
              </button>
            </section>
          )}
          <section>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-white/40 mb-2">Quick actions</p>
            <div className="grid grid-cols-2 gap-2">
              <QuickBtn icon={Ghost} label={sharingStatus || (sharing ? 'You\'re live' : 'Ghost mode')} onClick={onGhost} active={!sharing} />
              <QuickBtn icon={Sparkles} label="Squads" onClick={onSquads} />
              <QuickBtn icon={Plus} label="Drop a spot" onClick={onDropSpot} />
              <QuickBtn icon={MapPin} label="Plan meetup" onClick={onPlanMeetup} />
              {onWander && (
                <QuickBtn
                  icon={Footprints}
                  label="Wander"
                  onClick={() => {
                    onWander();
                    onClose();
                  }}
                />
              )}
            </div>
          </section>

          {hasMapbox && onFollowHeading && (
            <section>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-white/40 mb-2">Navigation</p>
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/4 px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-9 w-9 rounded-xl bg-white/8 flex items-center justify-center shrink-0">
                    <Compass className="h-4 w-4 text-white/80" />
                  </div>
                  <div className="min-w-0">
                    <Label htmlFor="follow-heading" className="text-sm font-semibold text-white">
                      Follow phone direction
                    </Label>
                    <p className="text-[11px] text-white/45 leading-snug">
                      Off lets you pan, zoom, and rotate freely
                    </p>
                  </div>
                </div>
                <Switch
                  id="follow-heading"
                  checked={followHeading}
                  onCheckedChange={onFollowHeading}
                />
              </div>
            </section>
          )}

          {hasMapbox && (
            <section>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-white/40 mb-2">Map look</p>
              <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                {MAP_VIEW_MODES.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onMapMode(m.id)}
                    aria-pressed={mapMode === m.id}
                    className={cn(
                      'shrink-0 flex flex-col items-center gap-1.5 min-w-[4.5rem] px-3 py-2.5 rounded-2xl border text-center transition-colors',
                      mapMode === m.id
                        ? 'border-white/30 bg-white/12 text-white'
                        : 'border-white/8 bg-white/4 text-white/55',
                    )}
                  >
                    <span className="text-lg leading-none">{m.icon}</span>
                    <span className="text-[10px] font-bold">{m.label}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          <section>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-white/40 mb-2 flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5" /> Layers
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {(Object.keys(LAYER_LABELS) as MapLayer[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => onToggleLayer(key)}
                  aria-pressed={layers[key]}
                  className={cn(
                    'flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors',
                    layers[key] ? 'bg-white/14 text-white' : 'bg-white/4 text-white/45',
                  )}
                >
                  {LAYER_LABELS[key]}
                  <span className={cn('h-2 w-2 rounded-full', layers[key] ? 'bg-emerald-400' : 'bg-white/20')} />
                </button>
              ))}
            </div>
          </section>
        </div>
      </motion.div>
    </>
  );
}

function QuickBtn({
  icon: Icon,
  label,
  onClick,
  active,
}: {
  icon: typeof Ghost;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-2.5 px-3 py-3 rounded-2xl text-left text-xs font-semibold transition-colors',
        active ? 'bg-amber-500/20 text-amber-100 border border-amber-400/25' : 'bg-white/6 text-white/80 border border-white/6',
      )}
    >
      <Icon className="h-4 w-4 shrink-0 opacity-80" />
      {label}
    </button>
  );
}
