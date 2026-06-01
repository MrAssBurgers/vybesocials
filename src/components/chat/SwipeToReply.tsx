import { useRef, useCallback, useEffect, ReactNode } from 'react';
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

// Timing
const HOLD_MS = 400;           // Time before hold fires
const HOLD_CANCEL_PX = 8;      // Movement that cancels hold

// Swipe thresholds
const SWIPE_ACTIVATE_PX = 15;  // Horizontal px before swipe state activates
const SWIPE_THRESHOLD = 50;    // Px needed to trigger reply
const MAX_SWIPE = 70;          // Max visual displacement

type GestureState = 'idle' | 'pending' | 'holding' | 'swiping' | 'scrolling';

/**
 * Gesture state machine — no pointer capture, no drag prop.
 *
 * pointerDown → 'pending' (start hold timer)
 *   move > 8px vertical   → 'scrolling' (do nothing, let page scroll)
 *   move > 15px horizontal → 'swiping'  (manual x translation)
 *   400ms no movement      → 'holding'  (fire onLongPress, suppress click)
 *   pointerUp while pending → clean tap (onClick passes through to children)
 */
export function SwipeToReply({
  children,
  onReply,
  onLongPress,
  isOwn = false,
  disabled = false,
}: SwipeToReplyProps) {
  const stateRef = useRef<GestureState>('idle');
  const startRef = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const replyTriggeredRef = useRef(false);
  const gestureConsumedRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const x = useMotionValue(0);
  const scaleVal = useMotionValue(1);

  // Reply bubble indicator transforms
  const absXOwn = useTransform(x, (v) => Math.abs(v));
  const absX = isOwn ? absXOwn : x;
  const replyOpacity = useTransform(absX, [0, 15, 30, SWIPE_THRESHOLD], [0, 0, 0.4, 1]);
  const replyScale = useTransform(absX, [0, 15, SWIPE_THRESHOLD], [0, 0.5, 1]);
  const replyXPos = useTransform(absX, [0, SWIPE_THRESHOLD], isOwn ? [20, -8] : [-20, 8]);
  const replyRotate = useTransform(absX, [0, SWIPE_THRESHOLD, MAX_SWIPE], isOwn ? [45, 0, -10] : [-45, 0, 10]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const resetVisuals = useCallback(() => {
    animate(x, 0, { type: 'spring', stiffness: 500, damping: 35, mass: 0.8 });
    animate(scaleVal, 1, { type: 'spring', stiffness: 400, damping: 25 });
  }, [x, scaleVal]);

  const cleanup = useCallback(() => {
    clearTimer();
    stateRef.current = 'idle';
    startRef.current = null;
    replyTriggeredRef.current = false;
    resetVisuals();
  }, [clearTimer, resetVisuals]);

  // Use document-level move/up so we don't steal events from children
  const handleDocumentPointerMove = useCallback((e: PointerEvent) => {
    const start = startRef.current;
    if (!start || e.pointerId !== start.pointerId) return;

    const state = stateRef.current;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    // Already decided — holding: ignore movement
    if (state === 'holding') return;
    // Already scrolling: ignore
    if (state === 'scrolling') return;

    // Still pending — decide what gesture this is
    if (state === 'pending') {
      // Vertical movement wins → scrolling
      if (absDy > HOLD_CANCEL_PX && absDy > absDx) {
        clearTimer();
        stateRef.current = 'scrolling';
        animate(scaleVal, 1, { duration: 0.1 });
        return;
      }
      // Horizontal movement wins → swiping
      if (absDx > SWIPE_ACTIVATE_PX) {
        clearTimer();
        stateRef.current = 'swiping';
        gestureConsumedRef.current = true;
        animate(scaleVal, 1, { duration: 0.1 });
      }
      // Small movement — stay pending, don't cancel hold yet
      // But if it exceeds cancel threshold in any direction, cancel hold timer
      if (absDx > HOLD_CANCEL_PX || absDy > HOLD_CANCEL_PX) {
        clearTimer();
      }
      return;
    }

    // In swiping state — update x position
    if (state === 'swiping') {
      const directionalDx = isOwn ? -dx : dx;
      if (directionalDx <= 0) {
        x.set(0);
        return;
      }

      const clamped = Math.min(directionalDx, MAX_SWIPE);
      const withResistance = clamped > SWIPE_THRESHOLD
        ? SWIPE_THRESHOLD + (clamped - SWIPE_THRESHOLD) * 0.3
        : clamped;

      x.set(isOwn ? -withResistance : withResistance);

      // Haptic at threshold
      if (withResistance >= SWIPE_THRESHOLD && !replyTriggeredRef.current) {
        replyTriggeredRef.current = true;
        if ('vibrate' in navigator) navigator.vibrate(10);
      } else if (withResistance < SWIPE_THRESHOLD * 0.7) {
        replyTriggeredRef.current = false;
      }
    }
  }, [x, scaleVal, clearTimer, isOwn]);

  const handleDocumentPointerUp = useCallback((e: PointerEvent) => {
    const start = startRef.current;
    if (!start || e.pointerId !== start.pointerId) return;

    const state = stateRef.current;

    // Swiping — check if past threshold
    if (state === 'swiping' && Math.abs(x.get()) >= SWIPE_THRESHOLD) {
      onReply();
      if ('vibrate' in navigator) navigator.vibrate([8, 50, 8]);
    }

    // If state is still 'pending' → it was a clean tap. Let click propagate naturally.
    // gestureConsumedRef stays false so onClickCapture won't block.

    cleanup();
  }, [x, onReply, cleanup]);

  // Attach/detach document listeners when a gesture is active
  useEffect(() => {
    const doc = document;
    doc.addEventListener('pointermove', handleDocumentPointerMove);
    doc.addEventListener('pointerup', handleDocumentPointerUp);
    doc.addEventListener('pointercancel', cleanup);
    return () => {
      doc.removeEventListener('pointermove', handleDocumentPointerMove);
      doc.removeEventListener('pointerup', handleDocumentPointerUp);
      doc.removeEventListener('pointercancel', cleanup);
    };
  }, [handleDocumentPointerMove, handleDocumentPointerUp, cleanup]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || e.button !== 0) return;

    startRef.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
    stateRef.current = 'pending';
    gestureConsumedRef.current = false;
    replyTriggeredRef.current = false;

    // Subtle scale feedback — only goes to 0.97 (barely visible, not janky)
    animate(scaleVal, 0.97, { type: 'spring', stiffness: 500, damping: 30 });

    // Start hold timer
    clearTimer();
    timerRef.current = setTimeout(() => {
      if (stateRef.current !== 'pending') return;
      stateRef.current = 'holding';
      gestureConsumedRef.current = true;
      animate(scaleVal, 0.95, { type: 'spring', stiffness: 300, damping: 20 });
      if ('vibrate' in navigator) navigator.vibrate(12);
      onLongPress?.();
    }, HOLD_MS);
  }, [disabled, scaleVal, clearTimer, onLongPress]);

  // Block child clicks only when gesture was consumed (hold or swipe)
  const handleClickCapture = useCallback((e: React.MouseEvent) => {
    if (!gestureConsumedRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    // Reset after blocking
    gestureConsumedRef.current = false;
  }, []);

  if (disabled) {
    return <>{children}</>;
  }

  return (
    <div ref={containerRef} className="relative overflow-visible touch-pan-y">
      {/* Reply swipe indicator */}
      <motion.div
        className={cn(
          'absolute top-1/2 -translate-y-1/2 pointer-events-none z-10',
          isOwn ? 'right-0' : 'left-0'
        )}
        style={{
          opacity: replyOpacity,
          scale: replyScale,
          x: replyXPos,
          rotate: replyRotate,
        }}
      >
        <div className="h-8 w-8 rounded-full flex items-center justify-center shadow-lg bg-primary text-primary-foreground">
          <Reply className="h-4 w-4" />
        </div>
      </motion.div>

      {/* Content — no pointer capture, children receive natural events */}
      <motion.div
        onPointerDown={handlePointerDown}
        onClickCapture={handleClickCapture}
        style={{ x, scale: scaleVal }}
        className="touch-pan-y select-none"
      >
        {children}
      </motion.div>
    </div>
  );
}
