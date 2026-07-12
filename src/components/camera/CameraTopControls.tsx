import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { X, Zap, ZapOff, SwitchCamera, Timer, ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/haptics';

interface CameraTopControlsProps {
  onClose: () => void;
  flash: boolean;
  onFlashToggle: () => void;
  onFlipCamera: () => void;
  timer: number;
  onTimerChange: (seconds: number) => void;
  showBackArrow?: boolean;
}

const TIMER_OPTIONS = [0, 3, 10];

function ControlChip({
  children,
  onClick,
  active,
  label,
}: {
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
  label?: string;
}) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.92 }}
      onClick={onClick}
      aria-label={label}
      className={cn(
        'relative min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full',
        'bg-black/35 backdrop-blur-xl border border-white/10 text-white touch-manipulation',
        active && 'border-primary/50 bg-primary/20',
      )}
    >
      {children}
    </motion.button>
  );
}

export function CameraTopControls({
  onClose,
  flash,
  onFlashToggle,
  onFlipCamera,
  timer,
  onTimerChange,
  showBackArrow = false,
}: CameraTopControlsProps) {
  const cycleTimer = () => {
    triggerHaptic('light');
    const idx = TIMER_OPTIONS.indexOf(timer);
    onTimerChange(TIMER_OPTIONS[(idx + 1) % TIMER_OPTIONS.length]);
  };

  return (
    <div className="absolute top-0 left-0 right-0 z-30 pt-safe px-3 pb-6 bg-gradient-to-b from-black/70 via-black/30 to-transparent pointer-events-none">
      <div className="flex items-start justify-between pointer-events-auto">
        <ControlChip onClick={onClose} label={showBackArrow ? 'Back' : 'Close camera'}>
          {showBackArrow ? (
            <ChevronLeft className="h-6 w-6" strokeWidth={2.5} />
          ) : (
            <X className="h-6 w-6" strokeWidth={2.5} />
          )}
        </ControlChip>

        <div className="flex items-center gap-2">
          <ControlChip
            onClick={() => {
              triggerHaptic('light');
              onFlashToggle();
            }}
            active={flash}
            label="Flash"
          >
            {flash ? <Zap className="h-5 w-5 text-amber-300" /> : <ZapOff className="h-5 w-5" />}
          </ControlChip>

          <ControlChip onClick={cycleTimer} active={timer > 0} label="Timer">
            <Timer className="h-5 w-5" />
            {timer > 0 && (
              <span className="absolute -bottom-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-primary text-[9px] font-bold flex items-center justify-center">
                {timer}
              </span>
            )}
          </ControlChip>

          <ControlChip
            onClick={() => {
              triggerHaptic('light');
              onFlipCamera();
            }}
            label="Flip camera"
          >
            <SwitchCamera className="h-5 w-5" />
          </ControlChip>
        </div>
      </div>
    </div>
  );
}
