import { memo, useEffect, useState, useCallback } from 'react';
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
 * Flying message bubble animation
 * Creates a smooth arc from input to message position when sending
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
      // Animation completes in 350ms
      const timer = setTimeout(onComplete, 350);
      return () => clearTimeout(timer);
    }
  }, [isVisible, onComplete]);

  // Truncate long messages for the flying bubble
  const displayText = text.length > 50 ? text.slice(0, 50) + '...' : text;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className="fixed pointer-events-none z-[100]"
          initial={{
            left: startPosition.x,
            top: startPosition.y,
            scale: 0.8,
            opacity: 0.9,
          }}
          animate={{
            left: endPosition.x,
            top: endPosition.y,
            scale: 1,
            opacity: 1,
          }}
          exit={{
            scale: 0.95,
            opacity: 0,
          }}
          transition={{
            type: 'spring',
            stiffness: 300,
            damping: 28,
            mass: 0.6,
          }}
          style={{
            willChange: 'transform, opacity, left, top',
          }}
        >
          <div
            className={cn(
              'px-4 py-2.5 rounded-2xl rounded-br-md max-w-[240px]',
              themeColor.bubble,
              themeColor.text,
              'shadow-xl'
            )}
          >
            <p className="text-sm break-words whitespace-pre-wrap">{displayText}</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

/**
 * Hook to manage flying bubble animation state
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
    if (!inputElement || !messagesContainer || !text.trim()) {
      console.log('[FlyingBubble] Missing elements:', { 
        hasInput: !!inputElement, 
        hasContainer: !!messagesContainer,
        hasText: !!text.trim()
      });
      return;
    }

    const inputRect = inputElement.getBoundingClientRect();
    const containerRect = messagesContainer.getBoundingClientRect();
    const viewportWidth = window.innerWidth;

    // Start position: above the input, centered on it
    const bubbleWidth = Math.min(240, viewportWidth - 32);
    const startX = inputRect.left + (inputRect.width / 2) - (bubbleWidth / 2);
    const startY = inputRect.top - 50;

    // End position: bottom-right of messages container (where sent messages appear)
    // For mobile, align to the right side with padding
    const endX = Math.min(containerRect.right - bubbleWidth - 16, viewportWidth - bubbleWidth - 16);
    const endY = containerRect.bottom - 80;

    console.log('[FlyingBubble] Triggering animation:', { startX, startY, endX, endY });

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
