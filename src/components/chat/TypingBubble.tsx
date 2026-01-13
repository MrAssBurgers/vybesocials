import { memo } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface TypingBubbleProps {
  className?: string;
  size?: 'sm' | 'md';
}

/**
 * Snapchat-style typing indicator bubble
 * Three dots with smooth wave animation
 */
export const TypingBubble = memo(function TypingBubble({
  className,
  size = 'sm',
}: TypingBubbleProps) {
  const dotSize = size === 'sm' ? 'w-1 h-1' : 'w-1.5 h-1.5';
  
  return (
    <div 
      className={cn(
        "flex items-center justify-center gap-[3px] bg-muted/90 backdrop-blur-sm rounded-full shadow-sm border border-border/30",
        size === 'sm' ? 'px-2 py-1' : 'px-2.5 py-1.5',
        className
      )}
    >
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className={cn(dotSize, "bg-primary rounded-full")}
          animate={{
            y: [0, -4, 0],
            scale: [1, 1.1, 1],
            opacity: [0.5, 1, 0.5],
          }}
          transition={{
            duration: 0.8,
            repeat: Infinity,
            delay: i * 0.15,
            ease: [0.4, 0, 0.6, 1], // Custom easing for smooth wave
          }}
        />
      ))}
    </div>
  );
});

export default TypingBubble;
