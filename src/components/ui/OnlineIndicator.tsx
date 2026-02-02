import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface OnlineIndicatorProps {
  isOnline: boolean;
  className?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  /** Show pulse animation when online */
  pulse?: boolean;
}

/**
 * Online status indicator dot
 * Clean, professional design matching modern chat apps
 */
export const OnlineIndicator = forwardRef<HTMLSpanElement, OnlineIndicatorProps>(
  function OnlineIndicator({ isOnline, className, size = 'md', pulse = false }, ref) {
    const sizeClasses = {
      xs: 'h-2 w-2',
      sm: 'h-2.5 w-2.5',
      md: 'h-3 w-3',
      lg: 'h-3.5 w-3.5',
    };

    if (!isOnline) return null;

    return (
      <span
        ref={ref}
        className={cn(
          'absolute rounded-full bg-emerald-500 ring-2 ring-background z-10 shadow-sm',
          sizeClasses[size],
          pulse && 'animate-pulse',
          className
        )}
        aria-label="Online"
      />
    );
  }
);
