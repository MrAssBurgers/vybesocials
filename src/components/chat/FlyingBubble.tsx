import { memo, useEffect, useState, useCallback, useRef } from 'react';
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
  const hasAnimatedRef = useRef(false);

  useEffect(() => {
    if (isVisible && !hasAnimatedRef.current) {
      hasAnimatedRef.current = true;
      // Animation completes in 320ms
      const timer = setTimeout(() => {
        onComplete();
        hasAnimatedRef.current = false;
      }, 320);
      return () => clearTimeout(timer);
    }
  }, [isVisible, onComplete]);

  // Truncate long messages for the flying bubble
  const displayText = text.length > 50 ? text.slice(0, 50) + '...' : text;

  // Calculate movement deltas
  const deltaX = endPosition.x - startPosition.x;
  const deltaY = endPosition.y - startPosition.y;
  
  // Arc curve - bubble rises then falls
  const arcHeight = Math.min(60, Math.abs(deltaY) * 0.25);

  const bubbleContent = (
    <AnimatePresence mode="wait">
      {isVisible && (
        <motion.div
          key="flying-bubble"
          className="fixed pointer-events-none"
          style={{
            left: startPosition.x,
            top: startPosition.y,
            zIndex: 99999,
            willChange: 'transform, opacity',
          }}
          initial={{
            x: 0,
            y: 0,
            scale: 0.5,
            opacity: 0,
          }}
          animate={{
            x: deltaX,
            y: deltaY,
            scale: 1,
            opacity: 1,
          }}
          exit={{
            opacity: 0,
            scale: 0.95,
          }}
          transition={{
            type: 'spring',
            stiffness: 400,
            damping: 32,
            mass: 0.8,
          }}
        >
          {/* Arc trajectory using nested div */}
          <motion.div
            initial={{ y: 0 }}
            animate={{ 
              y: [0, -arcHeight, 0],
            }}
            transition={{
              duration: 0.32,
              ease: [0.25, 0.1, 0.25, 1],
              times: [0, 0.4, 1],
            }}
          >
            <div
              className={cn(
                'px-4 py-2.5 rounded-2xl rounded-br-md max-w-[220px]',
                themeColor.bubble,
                themeColor.text,
                'shadow-xl'
              )}
              style={{
                boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
              }}
            >
              <p className="text-sm break-words whitespace-pre-wrap leading-snug font-medium">
                {displayText}
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  // Render via portal at body level
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

    // Estimate bubble width
    const bubbleWidth = Math.min(220, viewportWidth * 0.6);
    
    // START: Center of input area, right-aligned (where send button is)
    const startX = inputRect.right - bubbleWidth - 16;
    const startY = inputRect.top - 50;

    // END: Right side of screen, higher up where messages appear
    // Account for mobile vs desktop
    const isMobile = viewportWidth < 640;
    
    // Messages appear right-aligned, so end position should be there too
    const endX = isMobile 
      ? viewportWidth - bubbleWidth - 12
      : viewportWidth - bubbleWidth - 24;
    
    // End Y: Higher in the viewport where the message list is
    // Typically around 50-60% of viewport height
    const endY = messagesContainer 
      ? messagesContainer.getBoundingClientRect().bottom - 100
      : viewportHeight * 0.5;

    setFlyingBubble({
      text,
      startPosition: { x: startX, y: startY },
      endPosition: { x: endX, y: Math.max(100, endY) },
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
