import { useRef, useState, useCallback } from 'react';
import { motion, useMotionValue, useTransform, PanInfo } from 'framer-motion';
import { Phone, PhoneOff, Video } from 'lucide-react';
import { triggerHaptic } from '@/lib/haptics';

interface SlideToAnswerProps {
  isVideoCall: boolean;
  onAccept: () => void;
  onDecline: () => void;
  disabled?: boolean;
}

export function SlideToAnswer({ isVideoCall, onAccept, onDecline, disabled }: SlideToAnswerProps) {
  const x = useMotionValue(0);
  const [answered, setAnswered] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const THRESHOLD = 220;
  const bgOpacity = useTransform(x, [0, THRESHOLD], [0, 0.3]);
  const iconScale = useTransform(x, [THRESHOLD - 40, THRESHOLD], [1, 1.3]);
  const textOpacity = useTransform(x, [0, 80], [1, 0]);

  const handleDragEnd = useCallback((_: any, info: PanInfo) => {
    if (info.offset.x >= THRESHOLD && !answered) {
      setAnswered(true);
      triggerHaptic('success');
      onAccept();
    }
  }, [onAccept, answered]);

  return (
    <div className="w-full max-w-sm mx-auto space-y-4">
      {/* Decline button */}
      <div className="flex justify-center">
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => { triggerHaptic('medium'); onDecline(); }}
          disabled={disabled}
          className="h-14 w-14 rounded-full bg-gradient-to-br from-red-500 to-red-600 text-white shadow-lg flex items-center justify-center disabled:opacity-50 active:scale-90 transition-transform"
        >
          <PhoneOff className="h-6 w-6" />
        </motion.button>
      </div>

      {/* Slide track */}
      <div
        ref={containerRef}
        className="relative h-16 rounded-full overflow-hidden"
        style={{ backgroundColor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)' }}
      >
        {/* Green fill */}
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: useTransform(x, v => `${Math.max(64, v + 64)}px`),
            background: 'linear-gradient(90deg, hsl(142 70% 45%), hsl(142 70% 55%))',
            opacity: bgOpacity,
          }}
        />

        {/* Text hint */}
        <motion.div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{ opacity: textOpacity }}
        >
          <div className="flex items-center gap-2">
            <motion.div
              animate={{ x: [0, 12, 0] }}
              transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
            >
              <span className="text-white/40 text-sm font-medium">slide to answer →</span>
            </motion.div>
          </div>
        </motion.div>

        {/* Draggable knob */}
        <motion.div
          drag="x"
          dragConstraints={{ left: 0, right: THRESHOLD }}
          dragElastic={0.05}
          onDragEnd={handleDragEnd}
          style={{ x }}
          whileTap={{ scale: 1.1 }}
          className="absolute left-1 top-1 bottom-1 w-14 rounded-full bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center shadow-xl cursor-grab active:cursor-grabbing z-10"
        >
          <motion.div style={{ scale: iconScale }}>
            {isVideoCall ? (
              <Video className="h-6 w-6 text-white" />
            ) : (
              <Phone className="h-6 w-6 text-white" />
            )}
          </motion.div>
        </motion.div>

        {/* End indicator */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
          <motion.div
            animate={{ opacity: [0.2, 0.5, 0.2] }}
            transition={{ repeat: Infinity, duration: 2 }}
          >
            {isVideoCall ? (
              <Video className="h-5 w-5 text-green-400/50" />
            ) : (
              <Phone className="h-5 w-5 text-green-400/50" />
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
