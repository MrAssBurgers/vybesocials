import { memo, useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface FlyingBubbleProps {
  text: string;
  isVisible: boolean;
  startPosition: { x: number; y: number };
  endPosition: { x: number; y: number };
  onComplete: () => void;
  themeColor?: { bubble: string; text: string };
}

/**
 * Flying message bubble animation with portal rendering
 * Uses GPU-accelerated transforms for smooth 60fps animation
 * Renders at document.body level to escape CSS transform contexts
 */
export const FlyingBubble = memo(function FlyingBubble({
  text,
  isVisible,
  startPosition,
  endPosition,
  onComplete,
  themeColor = { bubble: 'bg-primary', text: 'text-primary-foreground' },
}: FlyingBubbleProps) {
  useEffect(() => {
    if (isVisible) {
      // Animation completes in 280ms
      const timer = setTimeout(onComplete, 280);
      return () => clearTimeout(timer);
    }
  }, [isVisible, onComplete]);

  // Truncate long messages for the flying bubble
  const displayText = text.length > 50 ? text.slice(0, 50) + '...' : text;

  // Calculate the delta for transform animation
  const deltaX = endPosition.x - startPosition.x;
  const deltaY = endPosition.y - startPosition.y;
  
  // Arc offset - bubble curves upward during flight
  const arcHeight = Math.min(80, Math.abs(deltaY) * 0.3);

  const bubbleContent = (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className="fixed pointer-events-none z-[100000]"
          style={{
            left: startPosition.x,
            top: startPosition.y,
            willChange: 'transform, opacity',
          }}
          initial={{
            x: 0,
            y: 0,
            scale: 0.7,
            opacity: 1,
          }}
          animate={{
            x: deltaX,
            y: deltaY,
            scale: 1,
            opacity: 0.85,
          }}
          exit={{
            scale: 0.9,
            opacity: 0,
          }}
          transition={{
            type: 'spring',
            stiffness: 500,
            damping: 35,
            mass: 0.5,
          }}
        >
          {/* Arc effect using a nested motion div */}
          <motion.div
            initial={{ y: 0 }}
            animate={{ y: [0, -arcHeight, 0] }}
            transition={{
              duration: 0.28,
              ease: [0.2, 0.8, 0.4, 1],
            }}
          >
            <div
              className={cn(
                'px-4 py-2.5 rounded-2xl rounded-br-md max-w-[240px]',
                themeColor.bubble,
                themeColor.text,
                'shadow-2xl shadow-black/20'
              )}
            >
              <p className="text-sm break-words whitespace-pre-wrap leading-snug">
                {displayText}
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  // Render via portal at body level to escape all CSS transform contexts
  if (typeof document === 'undefined') return null;
  
  return createPortal(bubbleContent, document.body);
});

/**
 * Hook to manage flying bubble animation state
 * Calculates positions relative to viewport for portal rendering
 */
export function useFlyingBubble() {
  const [flyingBubble, setFlyingBubble] = useState<{
    text: string;
    startPosition: { x: number; y: number };
    endPosition: { x: number; y: number };
  } | null>(null);

  const triggerFlyingBubble = useCallback((
    text: string,
    inputElement: HTMLElement | null,
    messagesContainer: HTMLElement | null
  ) => {
    if (!inputElement || !text.trim()) {
      return;
    }

    const inputRect = inputElement.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Estimate bubble width (max 240px)
    const bubbleWidth = Math.min(240, viewportWidth - 32);
    
    // Start position: centered above the input field
    const startX = inputRect.left + (inputRect.width / 2) - (bubbleWidth / 2);
    const startY = inputRect.top - 60;

    // End position: right side of viewport where sent messages appear
    // Mobile: right-aligned with padding
    // Desktop: slightly more centered
    const isMobile = viewportWidth < 640;
    const endX = isMobile 
      ? viewportWidth - bubbleWidth - 16  // Right edge with padding
      : viewportWidth * 0.6;              // 60% from left on desktop
    
    // End Y: around 60% down the viewport (where messages typically are)
    const endY = viewportHeight * 0.55;

    setFlyingBubble({
      text,
      startPosition: { x: startX, y: startY },
      endPosition: { x: endX, y: endY },
    });
  }, []);

  const clearFlyingBubble = useCallback(() => {
    setFlyingBubble(null);
  }, []);

  return {
    flyingBubble,
    triggerFlyingBubble,
    clearFlyingBubble,
  };
}
