import { forwardRef, InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface GlassInputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const GlassInput = forwardRef<HTMLInputElement, GlassInputProps>(
  ({ className, error, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          'liquid-glass-input w-full px-4 py-2.5 text-sm transition-all duration-150',
          'placeholder:text-muted-foreground',
          'focus:outline-none focus:scale-[1.01]',
          'disabled:cursor-not-allowed disabled:opacity-50',
          error && 'border-destructive focus:border-destructive',
          className
        )}
        {...props}
      />
    );
  }
);

GlassInput.displayName = 'GlassInput';
