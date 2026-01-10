import { useState, useRef, useCallback, ReactNode } from 'react';
import { motion, useMotionValue, useTransform, PanInfo } from 'framer-motion';
import { Reply } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SwipeToReplyProps {
  children: ReactNode;
  onReply: () => void;
  isOwn?: boolean;
  disabled?: boolean;
}

const SWIPE_THRESHOLD = 60;
const MAX_SWIPE = 80;

export function SwipeToReply({ 
  children, 
  onReply, 
  isOwn = false,
  disabled = false
}: SwipeToReplyProps) {
  const [isReplyTriggered, setIsReplyTriggered] = useState(false);
  const x = useMotionValue(0);
  const hasTriggeredRef = useRef(false);
  
  // Transform for reply icon opacity and scale
  const replyOpacity = useTransform(x, [0, SWIPE_THRESHOLD * 0.5, SWIPE_THRESHOLD], [0, 0.5, 1]);
  const replyScale = useTransform(x, [0, SWIPE_THRESHOLD], [0.5, 1]);
  
  const handleDragEnd = useCallback((
    event: MouseEvent | TouchEvent | PointerEvent, 
    info: PanInfo
  ) => {
    if (disabled) return;
    
    if (info.offset.x >= SWIPE_THRESHOLD && !hasTriggeredRef.current) {
      hasTriggeredRef.current = true;
      setIsReplyTriggered(true);
      onReply();
      
      // Reset after a short delay
      setTimeout(() => {
        setIsReplyTriggered(false);
        hasTriggeredRef.current = false;
      }, 200);
    }
  }, [onReply, disabled]);

  const handleDrag = useCallback((
    event: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo
  ) => {
    // Provide haptic feedback when crossing threshold
    if (info.offset.x >= SWIPE_THRESHOLD && !hasTriggeredRef.current) {
      if ('vibrate' in navigator) {
        navigator.vibrate(10);
      }
    }
  }, []);

  if (disabled) {
    return <>{children}</>;
  }

  return (
    <div className="relative overflow-hidden">
      {/* Reply indicator */}
      <motion.div
        className={cn(
          "absolute top-1/2 -translate-y-1/2 flex items-center justify-center",
          isOwn ? "right-full mr-2" : "left-0 -ml-8"
        )}
        style={{ 
          opacity: replyOpacity,
          scale: replyScale
        }}
      >
        <div className={cn(
          "h-8 w-8 rounded-full flex items-center justify-center",
          isReplyTriggered ? "bg-primary" : "bg-muted"
        )}>
          <Reply className={cn(
            "h-4 w-4",
            isReplyTriggered ? "text-primary-foreground" : "text-muted-foreground"
          )} />
        </div>
      </motion.div>

      {/* Swipeable content */}
      <motion.div
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: 0, right: MAX_SWIPE }}
        dragElastic={{ left: 0, right: 0.3 }}
        onDrag={handleDrag}
        onDragEnd={handleDragEnd}
        style={{ x }}
        className="touch-pan-y"
      >
        {children}
      </motion.div>
    </div>
  );
}
