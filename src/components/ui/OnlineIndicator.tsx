import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface OnlineIndicatorProps {
  isOnline: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const OnlineIndicator = forwardRef<HTMLSpanElement, OnlineIndicatorProps>(
  function OnlineIndicator({ isOnline, className, size = 'md' }, ref) {
    const sizeClasses = {
      sm: 'h-2 w-2',
      md: 'h-3 w-3',
      lg: 'h-4 w-4',
    };

    if (!isOnline) return null;

    return (
      <span
        ref={ref}
        className={cn(
          'absolute rounded-full bg-green-500 ring-2 ring-background',
          sizeClasses[size],
          className
        )}
      />
    );
  }
);
