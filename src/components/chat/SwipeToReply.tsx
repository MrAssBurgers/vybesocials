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
const CLICK_SUPPRESS_MS = 320;

type GestureState = 'idle' | 'holding' | 'swiping';

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
  const suppressClickRef = useRef(false);

  const x = useMotionValue(0);
  const scale = useMotionValue(1);

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

  const armClickSuppression = useCallback(() => {
    suppressClickRef.current = true;
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, CLICK_SUPPRESS_MS);
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
    if (disabled || e.pointerType === 'mouse') return;

    e.currentTarget.setPointerCapture(e.pointerId);
    startRef.current = { x: e.clientX, y: e.clientY };
    stateRef.current = 'idle';
    replyTriggeredRef.current = false;

    animate(scale, 0.96, { type: 'spring', stiffness: 400, damping: 25 });

    clearTimer();
    timerRef.current = setTimeout(() => {
      if (stateRef.current !== 'idle') return;
      stateRef.current = 'holding';
      armClickSuppression();
      if ('vibrate' in navigator) navigator.vibrate(10);
      onLongPress?.();
    }, HOLD_MS);
  }, [disabled, scale, clearTimer, armClickSuppression, onLongPress]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!startRef.current) return;

    const dx = e.clientX - startRef.current.x;
    const dy = e.clientY - startRef.current.y;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (stateRef.current === 'holding') return;

    if (stateRef.current === 'idle' && (absDx > HOLD_CANCEL_PX || absDy > HOLD_CANCEL_PX)) {
      clearTimer();

      if (absDy > absDx) {
        resetAll();
        return;
      }

      stateRef.current = 'swiping';
      armClickSuppression();
      animate(scale, 1, { type: 'spring', stiffness: 400, damping: 25 });
    }

    if (stateRef.current !== 'swiping') return;

    const clampedX = Math.max(0, Math.min(dx, MAX_SWIPE));
    const finalX = clampedX > SWIPE_THRESHOLD
      ? SWIPE_THRESHOLD + (clampedX - SWIPE_THRESHOLD) * 0.3
      : clampedX;

    x.set(finalX);

    if (finalX >= SWIPE_THRESHOLD && !replyTriggeredRef.current) {
      replyTriggeredRef.current = true;
      if ('vibrate' in navigator) navigator.vibrate(10);
    } else if (finalX < SWIPE_THRESHOLD * 0.8) {
      replyTriggeredRef.current = false;
    }
  }, [x, scale, clearTimer, resetAll, armClickSuppression]);

  const handlePointerUp = useCallback(() => {
    if (!startRef.current) return;

    const state = stateRef.current;
    if (state !== 'idle') {
      armClickSuppression();
    }

    if (state === 'swiping' && x.get() >= SWIPE_THRESHOLD) {
      onReply();
      if ('vibrate' in navigator) navigator.vibrate([8, 50, 8]);
    }

    resetAll();
  }, [x, onReply, resetAll, armClickSuppression]);

  const handlePointerCancel = useCallback(() => {
    resetAll();
  }, [resetAll]);

  const handleClickCapture = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!suppressClickRef.current) return;
    e.preventDefault();
    e.stopPropagation();
  }, []);

  if (disabled) {
    return <>{children}</>;
  }

  return (
    <div className="relative overflow-visible touch-pan-y">
      <motion.div
        className={cn(
          'absolute left-0 top-1/2 -translate-y-1/2 pointer-events-none z-10',
          isOwn && 'left-auto right-0 translate-x-2'
        )}
        style={{
          opacity: replyOpacity,
          scale: replyScale,
          x: replyX,
          rotate: replyRotate,
        }}
      >
        <div className="h-8 w-8 rounded-full flex items-center justify-center shadow-lg bg-primary text-primary-foreground">
          <Reply className="h-4 w-4" />
        </div>
      </motion.div>

      <motion.div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onClickCapture={handleClickCapture}
        style={{ x, scale }}
        className="touch-pan-y"
      >
        {children}
      </motion.div>
    </div>
  );
}
