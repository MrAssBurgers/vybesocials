import { memo } from 'react';
import { cn } from '@/lib/utils';

interface TypingIndicatorProps {
  className?: string;
  size?: 'sm' | 'md';
}

/**
 * Animated typing dots indicator (like iMessage/WhatsApp)
 * Uses CSS animations for better performance (no flickering)
 */
export const TypingIndicator = memo(function TypingIndicator({
  className,
  size = 'md',
}: TypingIndicatorProps) {
  const dotSize = size === 'sm' ? 'h-1.5 w-1.5' : 'h-2 w-2';
  const gap = size === 'sm' ? 'gap-0.5' : 'gap-1';
  
  return (
    <div className={cn('flex items-center', gap, className)}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={cn(dotSize, 'rounded-full bg-muted-foreground/60 typing-dot')}
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </div>
  );
});

interface TypingBubbleProps {
  className?: string;
}

/**
 * Typing indicator in a chat bubble style
 */
export const TypingBubble = memo(function TypingBubble({
  className,
}: TypingBubbleProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center px-4 py-3 rounded-2xl bg-muted/80',
        className
      )}
    >
      <TypingIndicator />
    </div>
  );
});
