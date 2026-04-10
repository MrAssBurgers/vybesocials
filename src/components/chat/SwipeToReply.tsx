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
const LONG_PRESS_MOVE_TOLERANCE = 10;

/**
 * Snapchat-style swipe to reply with long-press detection ABOVE the drag layer.
 * Long-press fires before framer-motion can steal the touch.
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
  
  // Long-press state (tracked at wrapper level, above framer-motion)
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const longPressFiredRef = useRef(false);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);
  
  const x = useMotionValue(0);
  
  const replyOpacity = useTransform(x, [0, 15, 25, SWIPE_THRESHOLD], [0, 0, 0.5, 1]);
  const replyScale = useTransform(x, [0, 15, SWIPE_THRESHOLD], [0, 0.5, 1]);
  const replyX = useTransform(x, [0, SWIPE_THRESHOLD], [-20, 8]);
  const replyRotate = useTransform(x, [0, SWIPE_THRESHOLD, MAX_SWIPE], [-45, 0, 10]);

  // --- Long-press handlers (on the OUTER wrapper, before framer-motion) ---
  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handleWrapperTouchStart = useCallback((e: React.TouchEvent) => {
    if (disabled || !onLongPress) return;
    longPressFiredRef.current = false;
    const touch = e.touches[0];
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };
    
    longPressTimerRef.current = setTimeout(() => {
      longPressFiredRef.current = true;
      onLongPress();
      if ('vibrate' in navigator) navigator.vibrate(10);
    }, LONG_PRESS_MS);
  }, [disabled, onLongPress, clearLongPress]);

  const handleWrapperTouchMove = useCallback((e: React.TouchEvent) => {
    if (!longPressTimerRef.current || !touchStartPosRef.current) return;
    const touch = e.touches[0];
    const dx = Math.abs(touch.clientX - touchStartPosRef.current.x);
    const dy = Math.abs(touch.clientY - touchStartPosRef.current.y);
    if (dx > LONG_PRESS_MOVE_TOLERANCE || dy > LONG_PRESS_MOVE_TOLERANCE) {
      clearLongPress();
    }
  }, [clearLongPress]);

  const handleWrapperTouchEnd = useCallback(() => {
    clearLongPress();
    touchStartPosRef.current = null;
  }, [clearLongPress]);

  // --- Drag handlers (framer-motion) ---
  const handleDragStart = useCallback(() => {
    isDraggingRef.current = true;
    dragActivatedRef.current = false;
    // If drag starts, cancel any pending long-press
    clearLongPress();
  }, [clearLongPress]);

  const handleDrag = useCallback((
    _event: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo
  ) => {
    if (disabled || longPressFiredRef.current) return;
    
    // Cancel long-press on ANY drag movement detected by framer-motion
    clearLongPress();
    
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
  }, [disabled, x]);

  const handleDragEnd = useCallback(() => {
    isDraggingRef.current = false;
    const currentX = x.get();
    
    if (currentX >= SWIPE_THRESHOLD && !longPressFiredRef.current) {
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
  }, [onReply, x]);

  if (disabled) {
    return <>{children}</>;
  }

  return (
    <div 
      className="relative overflow-visible"
      onTouchStart={handleWrapperTouchStart}
      onTouchMove={handleWrapperTouchMove}
      onTouchEnd={handleWrapperTouchEnd}
      onTouchCancel={handleWrapperTouchEnd}
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
