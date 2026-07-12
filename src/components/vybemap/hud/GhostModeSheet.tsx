import { useState } from 'react';
import { Ghost, Eye, EyeOff, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MapLiquidSheet } from '@/components/vybemap/MapLiquidSheet';

const GHOST_DURATIONS = [
  { id: '15m', label: '15 min', ms: 15 * 60_000 },
  { id: '1h', label: '1 hour', ms: 60 * 60_000 },
  { id: '3h', label: '3 hours', ms: 3 * 60 * 60_000 },
  { id: '24h', label: '24 hours', ms: 24 * 60 * 60_000 },
] as const;

interface GhostModeSheetProps {
  sharing: boolean;
  onClose: () => void;
  onToggleSharing: () => void;
  onGhostDuration: (ms: number) => void;
}

export function GhostModeSheet({ sharing, onClose, onToggleSharing, onGhostDuration }: GhostModeSheetProps) {
  const [mode, setMode] = useState<'everyone' | 'friends' | 'ghost'>(
    sharing ? 'everyone' : 'ghost',
  );

  return (
    <MapLiquidSheet
      onClose={onClose}
      title={
        <div>
          <div className="flex items-center gap-2">
            <Ghost className="h-5 w-5 text-violet-400" />
            <h3 className="text-lg font-bold text-foreground">Privacy & Ghost Mode</h3>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">Control who sees you on VybeMap</p>
        </div>
      }
    >
      <div className="grid grid-cols-3 gap-2 mb-4">
        {([
          { id: 'everyone' as const, icon: Eye, label: 'Live', desc: 'Friends see you' },
          { id: 'friends' as const, icon: Eye, label: 'Friends', desc: 'Selected only' },
          { id: 'ghost' as const, icon: EyeOff, label: 'Ghost', desc: 'Invisible' },
        ]).map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => setMode(opt.id)}
            className={cn(
              'flex flex-col items-center gap-1 p-3 rounded-2xl border text-center transition-colors',
              mode === opt.id
                ? 'border-primary bg-primary/15 text-foreground'
                : 'border-border/40 bg-card/30 text-muted-foreground',
            )}
          >
            <opt.icon className="h-5 w-5" />
            <span className="text-[11px] font-bold">{opt.label}</span>
            <span className="text-[9px] opacity-60">{opt.desc}</span>
          </button>
        ))}
      </div>

      {mode === 'ghost' && (
        <div className="mb-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
            <Clock className="h-3 w-3" /> Temporary ghost
          </p>
          <div className="flex flex-wrap gap-2">
            {GHOST_DURATIONS.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => onGhostDuration(d.ms)}
                className="rounded-full px-3 py-1.5 text-xs font-semibold bg-card/50 text-foreground hover:bg-violet-500/30 border border-border/40"
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          if (mode === 'ghost' && sharing) onToggleSharing();
          else if (mode !== 'ghost' && !sharing) onToggleSharing();
          onClose();
        }}
        className="w-full py-3.5 rounded-xl bg-primary font-bold text-primary-foreground"
      >
        {mode === 'ghost' ? 'Enable Ghost Mode' : sharing ? 'Stay Live' : 'Share Live Location'}
      </button>
    </MapLiquidSheet>
  );
}
