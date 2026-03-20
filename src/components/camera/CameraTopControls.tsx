import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Zap, ZapOff, SwitchCamera, Timer, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/haptics';

interface CameraTopControlsProps {
  onClose: () => void;
  flash: boolean;
  onFlashToggle: () => void;
  onFlipCamera: () => void;
  timer: number; // 0, 3, 10
  onTimerChange: (seconds: number) => void;
}

const TIMER_OPTIONS = [0, 3, 10];

export function CameraTopControls({
  onClose,
  flash,
  onFlashToggle,
  onFlipCamera,
  timer,
  onTimerChange,
}: CameraTopControlsProps) {
  const [showTimerPicker, setShowTimerPicker] = useState(false);

  const cycleTimer = () => {
    triggerHaptic('light');
    const idx = TIMER_OPTIONS.indexOf(timer);
    const next = TIMER_OPTIONS[(idx + 1) % TIMER_OPTIONS.length];
    onTimerChange(next);
  };

  return (
    <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent z-30">
      <Button
        variant="ghost"
        size="icon"
        onClick={onClose}
        className="text-white bg-black/40 hover:bg-black/60 backdrop-blur-sm rounded-full"
      >
        <X className="h-6 w-6" strokeWidth={2.5} />
      </Button>

      <div className="flex gap-1.5">
        {/* Flash */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => { triggerHaptic('light'); onFlashToggle(); }}
          className="text-white bg-black/40 hover:bg-black/60 backdrop-blur-sm rounded-full w-9 h-9"
        >
          {flash ? <Zap className="h-4 w-4 text-yellow-400" /> : <ZapOff className="h-4 w-4" />}
        </Button>

        {/* Timer */}
        <Button
          variant="ghost"
          size="icon"
          onClick={cycleTimer}
          className={cn(
            "text-white bg-black/40 hover:bg-black/60 backdrop-blur-sm rounded-full w-9 h-9 relative",
            timer > 0 && "text-primary"
          )}
        >
          <Timer className="h-4 w-4" />
          {timer > 0 && (
            <span className="absolute -bottom-0.5 -right-0.5 bg-primary text-primary-foreground text-[8px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center">
              {timer}
            </span>
          )}
        </Button>

        {/* Flip Camera */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => { triggerHaptic('light'); onFlipCamera(); }}
          className="text-white bg-black/40 hover:bg-black/60 backdrop-blur-sm rounded-full w-9 h-9"
        >
          <SwitchCamera className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
