import { useRef, useCallback, ReactNode } from 'react';
import { motion, useMotionValue, useTransform, PanInfo, animate } from 'framer-motion';
import { Reply } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SwipeToReplyProps {
  children: ReactNode;
  onReply: () => void;
  onLongPress?: () => void;
  isOwn?: boolean;
  disabled?: boolean;
}

const SWIPE_THRESHOLD = 50;
const MAX_SWIPE = 70;
const DRAG_DEAD_ZONE = 15;
const LONG_PRESS_MS = 400;
// Cancel long-press if finger moves more than 5px in any direction
// This is intentionally lower than DRAG_DEAD_ZONE so even slow swipes cancel
const SWIPE_INTENT_TOLERANCE = 5;

type GestureState = 'idle' | 'pressing' | 'swiping' | 'longpress-fired';

/**
 * Swipe to reply with long-press detection using pointer capture-phase events.
 * Pointer events on the capture phase fire before framer-motion can steal them,
 * ensuring reliable long-press detection on media elements (images, videos).
 */
export function SwipeToReply({ 
  children, 
  onReply, 
  onLongPress,
  isOwn = false,
  disabled = false
}: SwipeToReplyProps) {
  const hasTriggeredRef = useRef(false);
  const isDraggingRef = useRef(false);
  const dragActivatedRef = useRef(false);
  
  // Gesture state machine
  const gestureStateRef = useRef<GestureState>('idle');
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  
  const x = useMotionValue(0);
  
  const replyOpacity = useTransform(x, [0, 15, 25, SWIPE_THRESHOLD], [0, 0, 0.5, 1]);
  const replyScale = useTransform(x, [0, 15, SWIPE_THRESHOLD], [0, 0.5, 1]);
  const replyX = useTransform(x, [0, SWIPE_THRESHOLD], [-20, 8]);
  const replyRotate = useTransform(x, [0, SWIPE_THRESHOLD, MAX_SWIPE], [-45, 0, 10]);

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const cancelToSwipe = useCallback(() => {
    clearLongPress();
    if (gestureStateRef.current === 'pressing') {
      gestureStateRef.current = 'swiping';
    }
  }, [clearLongPress]);

  // --- Pointer capture-phase handlers (fire BEFORE framer-motion) ---
  const handlePointerDownCapture = useCallback((e: React.PointerEvent) => {
    if (disabled || !onLongPress) return;
    // Only handle touch/pen, not mouse (mouse uses right-click context menu)
    if (e.pointerType === 'mouse') return;
    
    gestureStateRef.current = 'pressing';
    pointerStartRef.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
    
    longPressTimerRef.current = setTimeout(() => {
      if (gestureStateRef.current === 'pressing') {
        gestureStateRef.current = 'longpress-fired';
        onLongPress();
        if ('vibrate' in navigator) navigator.vibrate(10);
      }
    }, LONG_PRESS_MS);
  }, [disabled, onLongPress]);

  const handlePointerMoveCapture = useCallback((e: React.PointerEvent) => {
    if (!pointerStartRef.current) return;
    if (e.pointerId !== pointerStartRef.current.pointerId) return;
    
    const dx = Math.abs(e.clientX - pointerStartRef.current.x);
    const dy = Math.abs(e.clientY - pointerStartRef.current.y);
    
    // If finger moved more than the intent tolerance, this is a swipe/scroll, not a hold
    if (dx > SWIPE_INTENT_TOLERANCE || dy > SWIPE_INTENT_TOLERANCE) {
      cancelToSwipe();
    }
  }, [cancelToSwipe]);

  const handlePointerUpCapture = useCallback(() => {
    clearLongPress();
    gestureStateRef.current = 'idle';
    pointerStartRef.current = null;
  }, [clearLongPress]);

  // --- Drag handlers (framer-motion) ---
  const handleDragStart = useCallback(() => {
    isDraggingRef.current = true;
    dragActivatedRef.current = false;
    // Safety net: cancel long-press when drag activates
    cancelToSwipe();
  }, [cancelToSwipe]);

  const handleDrag = useCallback((
    _event: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo
  ) => {
    if (disabled) return;
    // If long-press already fired, don't process drag
    if (gestureStateRef.current === 'longpress-fired') return;
    
    // Cancel long-press on ANY drag movement
    cancelToSwipe();
    
    const rawX = info.offset.x;
    
    if (!dragActivatedRef.current) {
      if (rawX < DRAG_DEAD_ZONE) {
        x.set(0);
        return;
      }
      dragActivatedRef.current = true;
    }
    
    const clampedX = Math.max(0, Math.min(rawX, MAX_SWIPE));
    const resistance = clampedX > SWIPE_THRESHOLD ? 0.3 : 1;
    const finalX = clampedX > SWIPE_THRESHOLD 
      ? SWIPE_THRESHOLD + (clampedX - SWIPE_THRESHOLD) * resistance
      : clampedX;
    
    x.set(finalX);
    
    if (finalX >= SWIPE_THRESHOLD && !hasTriggeredRef.current) {
      hasTriggeredRef.current = true;
      if ('vibrate' in navigator) navigator.vibrate(10);
    } else if (finalX < SWIPE_THRESHOLD * 0.8) {
      hasTriggeredRef.current = false;
    }
  }, [disabled, x, cancelToSwipe]);

  const handleDragEnd = useCallback(() => {
    isDraggingRef.current = false;
    const currentX = x.get();
    
    if (currentX >= SWIPE_THRESHOLD && gestureStateRef.current !== 'longpress-fired') {
      onReply();
      if ('vibrate' in navigator) navigator.vibrate([8, 50, 8]);
    }
    
    animate(x, 0, {
      type: 'spring',
      stiffness: 500,
      damping: 35,
      mass: 0.8,
    });
    
    hasTriggeredRef.current = false;
    // Reset gesture state after drag ends
    gestureStateRef.current = 'idle';
    pointerStartRef.current = null;
  }, [onReply, x]);

  if (disabled) {
    return <>{children}</>;
  }

  return (
    <div 
      className="relative overflow-visible"
      onPointerDownCapture={handlePointerDownCapture}
      onPointerMoveCapture={handlePointerMoveCapture}
      onPointerUpCapture={handlePointerUpCapture}
      onPointerCancelCapture={handlePointerUpCapture}
    >
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
          "h-8 w-8 rounded-full flex items-center justify-center shadow-lg",
          "bg-primary text-primary-foreground"
        )}>
          <Reply className="h-4 w-4" />
        </div>
      </motion.div>

      {/* Swipeable content */}
      <motion.div
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: 0, right: MAX_SWIPE }}
        dragElastic={0.1}
        onDragStart={handleDragStart}
        onDrag={handleDrag}
        onDragEnd={handleDragEnd}
        style={{ x }}
        className="touch-pan-y cursor-grab active:cursor-grabbing"
      >
        {children}
      </motion.div>
    </div>
  );
}
