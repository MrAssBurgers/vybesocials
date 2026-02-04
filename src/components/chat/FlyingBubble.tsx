import { memo, useEffect, useState } from 'react';
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
      // Animation completes in 300ms
      const timer = setTimeout(onComplete, 300);
      return () => clearTimeout(timer);
    }
  }, [isVisible, onComplete]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className="fixed pointer-events-none z-50"
          initial={{
            x: startPosition.x,
            y: startPosition.y,
            scale: 0.6,
            opacity: 0,
          }}
          animate={{
            x: endPosition.x,
            y: endPosition.y,
            scale: 1,
            opacity: 1,
          }}
          exit={{
            scale: 0.9,
            opacity: 0,
          }}
          transition={{
            type: 'spring',
            stiffness: 400,
            damping: 30,
            mass: 0.8,
          }}
          style={{
            willChange: 'transform, opacity',
            transform: 'translateZ(0)',
          }}
        >
          <div
            className={cn(
              'px-4 py-2.5 rounded-2xl rounded-br-lg max-w-[260px]',
              themeColor.bubble,
              themeColor.text,
              'shadow-lg'
            )}
          >
            <p className="text-sm break-words">{text}</p>
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

  const triggerFlyingBubble = (
    text: string,
    inputElement: HTMLElement | null,
    messagesContainer: HTMLElement | null
  ) => {
    if (!inputElement || !messagesContainer) {
      return;
    }

    const inputRect = inputElement.getBoundingClientRect();
    const containerRect = messagesContainer.getBoundingClientRect();

    // Start from center of input
    const startX = inputRect.left + inputRect.width / 2 - 130; // Center bubble
    const startY = inputRect.top - 40;

    // End at top-right of messages area (where new message will appear)
    const endX = containerRect.right - 280;
    const endY = containerRect.bottom - 100;

    setFlyingBubble({
      text,
      startPosition: { x: startX, y: startY },
      endPosition: { x: endX, y: endY },
    });
  };

  const clearFlyingBubble = () => {
    setFlyingBubble(null);
  };

  return {
    flyingBubble,
    triggerFlyingBubble,
    clearFlyingBubble,
  };
}
