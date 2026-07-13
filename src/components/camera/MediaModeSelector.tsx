import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Infinity as InfinityIcon, RotateCcw, Timer } from 'lucide-react';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/haptics';
import { SNAP_VIEW_MODES, type SnapViewMode } from '@/lib/camera/snapDraft';

function modeIcon(mode: SnapViewMode) {
  switch (mode) {
    case 'view_once':
      return <span className="text-[13px] font-bold leading-none">1</span>;
    case 'replay_once':
      return <RotateCcw className="h-4 w-4" />;
    case '24h':
      return <Timer className="h-4 w-4" />;
    case 'permanent':
      return <InfinityIcon className="h-4 w-4" />;
  }
}

/**
 * Floating media-mode control (view once / replay / timed / keep) for the snap
 * editor. Collapsed it shows the current mode; tap to expand the options.
 */
export function MediaModeSelector({
  value,
  onChange,
}: {
  value: SnapViewMode;
  onChange: (mode: SnapViewMode) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = SNAP_VIEW_MODES.find((m) => m.id === value) ?? SNAP_VIEW_MODES[0];

  return (
    <div className="relative flex flex-col items-center">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.18 }}
            className="absolute bottom-full mb-2 flex flex-col gap-1 rounded-2xl border border-border/40 bg-background/85 p-1.5 backdrop-blur-xl"
          >
            {SNAP_VIEW_MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  onChange(mode.id);
                  setOpen(false);
                }}
                className={cn(
                  'flex items-center gap-2 rounded-xl px-3 py-2 text-left transition-colors',
                  mode.id === value
                    ? 'bg-primary/20 text-primary'
                    : 'text-foreground/80 hover:bg-muted/60',
                )}
              >
                <span className="flex h-6 w-6 items-center justify-center">{modeIcon(mode.id)}</span>
                <span className="flex flex-col">
                  <span className="text-xs font-semibold">{mode.label}</span>
                  <span className="text-[10px] text-muted-foreground">{mode.description}</span>
                </span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <button
        type="button"
        aria-label={`Media mode: ${current.label}`}
        onClick={() => {
          triggerHaptic('light');
          setOpen((v) => !v);
        }}
        className={cn(
          'flex h-11 w-11 items-center justify-center rounded-full border backdrop-blur-xl transition-colors',
          open
            ? 'border-primary/50 bg-primary/25 text-primary'
            : 'border-border/30 bg-background/40 text-foreground',
        )}
      >
        {modeIcon(current.id)}
      </button>
      <span className="mt-0.5 text-[9px] font-medium text-foreground/70">{current.label}</span>
    </div>
  );
}
