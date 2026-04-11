import { useRef, useCallback, ReactNode } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { Reply } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SwipeToReplyProps {
  children: ReactNode;
  onReply: () => void;
  onLongPress?: () => void;
  isOwn?: boolean;
  disabled?: boolean;
}

const HOLD_MS = 300;
const HOLD_CANCEL_PX = 10;
const SWIPE_DEAD_ZONE = 40;
const SWIPE_THRESHOLD = 50;
const MAX_SWIPE = 70;

type GestureState = 'idle' | 'holding' | 'swiping';

/**
 * Gesture state machine:
 *   idle → holding  (300ms timer, < 10px movement)
 *   idle → swiping  (> 10px horizontal movement before timer fires)
 * Once a state is entered the other is locked out.
 * Tap (pointerUp while idle) passes through to children.
 */
export function SwipeToReply({
  children,
  onReply,
  onLongPress,
  isOwn = false,
  disabled = false,
}: SwipeToReplyProps) {
  const stateRef = useRef<GestureState>('idle');
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const replyTriggeredRef = useRef(false);

  const x = useMotionValue(0);
  const scale = useMotionValue(1);

  // Reply indicator transforms
  const replyOpacity = useTransform(x, [0, 20, SWIPE_DEAD_ZONE, SWIPE_THRESHOLD], [0, 0, 0.5, 1]);
  const replyScale = useTransform(x, [0, 20, SWIPE_THRESHOLD], [0, 0.5, 1]);
  const replyX = useTransform(x, [0, SWIPE_THRESHOLD], [-20, 8]);
  const replyRotate = useTransform(x, [0, SWIPE_THRESHOLD, MAX_SWIPE], [-45, 0, 10]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const resetAll = useCallback(() => {
    stateRef.current = 'idle';
    startRef.current = null;
    replyTriggeredRef.current = false;
    clearTimer();
    animate(x, 0, { type: 'spring', stiffness: 500, damping: 35, mass: 0.8 });
    animate(scale, 1, { type: 'spring', stiffness: 400, damping: 25 });
  }, [x, scale, clearTimer]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    // Only handle touch
    if (e.pointerType === 'mouse') return;

    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    startRef.current = { x: e.clientX, y: e.clientY };
    stateRef.current = 'idle';
    replyTriggeredRef.current = false;

    // Visual press feedback
    animate(scale, 0.96, { type: 'spring', stiffness: 400, damping: 25 });

    // Start hold timer
    clearTimer();
    timerRef.current = setTimeout(() => {
      if (stateRef.current !== 'idle') return; // already swiping
      stateRef.current = 'holding';
      animate(scale, 0.96, { duration: 0 }); // keep scale
      if ('vibrate' in navigator) navigator.vibrate(10);
      onLongPress?.();
    }, HOLD_MS);
  }, [disabled, clearTimer, onLongPress, scale]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!startRef.current) return;
    const state = stateRef.current;

    const dx = e.clientX - startRef.current.x;
    const dy = e.clientY - startRef.current.y;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    // If holding, ignore all movement
    if (state === 'holding') return;

    // Check if movement exceeds cancel threshold
    if (state === 'idle' && (absDx > HOLD_CANCEL_PX || absDy > HOLD_CANCEL_PX)) {
      clearTimer();
      // If mostly vertical, don't enter swiping — let scroll happen
      if (absDy > absDx) {
        resetAll();
        return;
      }
      stateRef.current = 'swiping';
      animate(scale, 1, { type: 'spring', stiffness: 400, damping: 25 });
    }

    if (stateRef.current === 'swiping') {
      // Only allow right swipe
      const clampedX = Math.max(0, Math.min(dx, MAX_SWIPE));
      const resistance = clampedX > SWIPE_THRESHOLD ? 0.3 : 1;
      const finalX = clampedX > SWIPE_THRESHOLD
        ? SWIPE_THRESHOLD + (clampedX - SWIPE_THRESHOLD) * resistance
        : clampedX;

      x.set(finalX);

      if (finalX >= SWIPE_THRESHOLD && !replyTriggeredRef.current) {
        replyTriggeredRef.current = true;
        if ('vibrate' in navigator) navigator.vibrate(10);
      } else if (finalX < SWIPE_THRESHOLD * 0.8) {
        replyTriggeredRef.current = false;
      }
    }
  }, [x, scale, clearTimer, resetAll]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!startRef.current) return;

    const state = stateRef.current;

    if (state === 'swiping' && x.get() >= SWIPE_THRESHOLD) {
      onReply();
      if ('vibrate' in navigator) navigator.vibrate([8, 50, 8]);
    }

    // If state is still idle (no hold fired, no swipe), it's a tap — let it through naturally
    resetAll();
  }, [x, onReply, resetAll]);

  const handlePointerCancel = useCallback(() => {
    resetAll();
  }, [resetAll]);

  if (disabled) {
    return <>{children}</>;
  }

  return (
    <div className="relative overflow-visible touch-pan-y">
      {/* Reply indicator */}
      <motion.div
        className="absolute left-0 top-1/2 -translate-y-1/2 pointer-events-none z-10"
        style={{
          opacity: replyOpacity,
          scale: replyScale,
          x: replyX,
          rotate: replyRotate,
        }}
      >
        <div className={cn(
          'h-8 w-8 rounded-full flex items-center justify-center shadow-lg',
          'bg-primary text-primary-foreground'
        )}>
          <Reply className="h-4 w-4" />
        </div>
      </motion.div>

      {/* Message content */}
      <motion.div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        style={{ x, scale }}
        className="touch-pan-y"
      >
        {children}
      </motion.div>
    </div>
  );
}
