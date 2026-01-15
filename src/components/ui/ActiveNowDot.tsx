import { memo } from 'react';
import { cn } from '@/lib/utils';

interface ActiveNowDotProps {
  isOnline?: boolean;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
  showRing?: boolean;
}

/**
 * Active Now indicator dot - shows green when online
 * Subtle, non-intrusive presence indicator for avatars
 */
export const ActiveNowDot = memo(function ActiveNowDot({
  isOnline = false,
  size = 'sm',
  className,
  showRing = true,
}: ActiveNowDotProps) {
  if (!isOnline) return null;

  const sizeClasses = {
    xs: 'h-2 w-2',
    sm: 'h-2.5 w-2.5',
    md: 'h-3 w-3',
    lg: 'h-3.5 w-3.5',
  };

  return (
    <span
      className={cn(
        'absolute rounded-full bg-green-500',
        sizeClasses[size],
        showRing && 'ring-2 ring-background',
        className
      )}
      aria-label="Online now"
    />
  );
});
