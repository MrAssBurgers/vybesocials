import { useState, useRef, useCallback, ReactNode } from 'react';
import { motion, useMotionValue, useTransform, useSpring, PanInfo } from 'framer-motion';
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

/**
 * Snapchat-style swipe to reply
 * - Swipe right to reveal reply indicator
 * - Smooth spring animation snaps back
 * - Haptic feedback when threshold crossed
 */
export function SwipeToReply({ 
  children, 
  onReply, 
  isOwn = false,
  disabled = false
}: SwipeToReplyProps) {
  const [hasTriggered, setHasTriggered] = useState(false);
  const triggeredRef = useRef(false);
  
  // Raw motion value for drag
  const rawX = useMotionValue(0);
  
  // Spring for smooth snap-back animation (Snapchat feel)
  const x = useSpring(rawX, {
    stiffness: 400,
    damping: 30,
    mass: 0.8
  });
  
  // Reply icon transforms - appears from left
  const replyOpacity = useTransform(rawX, [0, 20, SWIPE_THRESHOLD], [0, 0.3, 1]);
  const replyScale = useTransform(rawX, [0, SWIPE_THRESHOLD], [0.6, 1]);
  const replyX = useTransform(rawX, [0, SWIPE_THRESHOLD], [-20, 0]);
  
  // Background indicator
  const bgOpacity = useTransform(rawX, [0, SWIPE_THRESHOLD], [0, 0.1]);

  const handleDrag = useCallback((
    _event: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo
  ) => {
    if (disabled) return;
    
    // Only allow right swipe
    const offsetX = Math.max(0, Math.min(info.offset.x, MAX_SWIPE));
    rawX.set(offsetX);
    
    // Trigger haptic when crossing threshold (once per gesture)
    if (offsetX >= SWIPE_THRESHOLD && !triggeredRef.current) {
      triggeredRef.current = true;
      setHasTriggered(true);
      
      if ('vibrate' in navigator) {
        navigator.vibrate(15);
      }
    } else if (offsetX < SWIPE_THRESHOLD && triggeredRef.current) {
      triggeredRef.current = false;
      setHasTriggered(false);
    }
  }, [disabled, rawX]);

  const handleDragEnd = useCallback((
    _event: MouseEvent | TouchEvent | PointerEvent, 
    info: PanInfo
  ) => {
    // Fire reply if we crossed threshold
    if (info.offset.x >= SWIPE_THRESHOLD) {
      onReply();
      
      // Extra haptic on release
      if ('vibrate' in navigator) {
        navigator.vibrate([10, 30, 10]);
      }
    }
    
    // Always snap back to origin
    rawX.set(0);
    triggeredRef.current = false;
    setHasTriggered(false);
  }, [onReply, rawX]);

  if (disabled) {
    return <>{children}</>;
  }

  return (
    <div className="relative overflow-visible">
      {/* Reply indicator - positioned to the left */}
      <motion.div
        className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-full pl-2"
        style={{ 
          opacity: replyOpacity,
          scale: replyScale,
          x: replyX
        }}
      >
        <div className={cn(
          "h-9 w-9 rounded-full flex items-center justify-center transition-colors duration-150",
          hasTriggered 
            ? "bg-primary shadow-lg shadow-primary/30" 
            : "bg-muted/80"
        )}>
          <Reply className={cn(
            "h-4 w-4 transition-colors duration-150",
            hasTriggered ? "text-primary-foreground" : "text-muted-foreground"
          )} />
        </div>
      </motion.div>

      {/* Swipeable content */}
      <motion.div
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0}
        onDrag={handleDrag}
        onDragEnd={handleDragEnd}
        style={{ x }}
        className="touch-pan-y cursor-grab active:cursor-grabbing"
      >
        {/* Subtle background indicator */}
        <motion.div 
          className="absolute inset-0 rounded-[20px] bg-primary pointer-events-none"
          style={{ opacity: bgOpacity }}
        />
        {children}
      </motion.div>
    </div>
  );
}
