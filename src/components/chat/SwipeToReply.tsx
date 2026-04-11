import { useRef, useCallback, ReactNode } from 'react';
import { motion, useMotionValue, useTransform, PanInfo, animate } from 'framer-motion';
import { Reply } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SwipeToReplyProps {
  children: ReactNode;
  onReply: () => void;
  isOwn?: boolean;
  disabled?: boolean;
}

const SWIPE_THRESHOLD = 50;
const MAX_SWIPE = 70;
const DRAG_DEAD_ZONE = 15;

/**
 * Swipe to reply — horizontal drag only.
 * Long-press is handled independently on the message bubble.
 */
export function SwipeToReply({ 
  children, 
  onReply, 
  isOwn = false,
  disabled = false
}: SwipeToReplyProps) {
  const hasTriggeredRef = useRef(false);
  const dragActivatedRef = useRef(false);
  
  const x = useMotionValue(0);
  
  const replyOpacity = useTransform(x, [0, 15, 25, SWIPE_THRESHOLD], [0, 0, 0.5, 1]);
  const replyScale = useTransform(x, [0, 15, SWIPE_THRESHOLD], [0, 0.5, 1]);
  const replyX = useTransform(x, [0, SWIPE_THRESHOLD], [-20, 8]);
  const replyRotate = useTransform(x, [0, SWIPE_THRESHOLD, MAX_SWIPE], [-45, 0, 10]);

  const handleDragStart = useCallback(() => {
    dragActivatedRef.current = false;
  }, []);

  const handleDrag = useCallback((
    _event: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo
  ) => {
    if (disabled) return;
    
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
    const currentX = x.get();
    
    if (currentX >= SWIPE_THRESHOLD) {
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
    <div className="relative overflow-visible">
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
