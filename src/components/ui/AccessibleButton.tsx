import React, { forwardRef } from 'react';
import { motion, HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/haptics';
import { playSound } from '@/lib/sounds';
import { usePlatform } from '@/hooks/usePlatform';
import { MOTION_CONFIG } from '@/lib/motion';

interface AccessibleButtonProps extends Omit<HTMLMotionProps<'button'>, 'ref'> {
  variant?: 'default' | 'primary' | 'secondary' | 'ghost' | 'destructive';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  haptic?: 'light' | 'medium' | 'heavy' | 'none';
  sound?: 'tap' | 'pop' | 'none';
  loading?: boolean;
  ariaLabel?: string;
}

const variantStyles = {
  default: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
  primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
  secondary: 'bg-muted text-muted-foreground hover:bg-muted/80',
  ghost: 'hover:bg-accent hover:text-accent-foreground',
  destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
};

const sizeStyles = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-base',
  lg: 'h-12 px-6 text-lg',
  icon: 'h-10 w-10 p-0',
};

export const AccessibleButton = forwardRef<HTMLButtonElement, AccessibleButtonProps>(
  function AccessibleButton(
    {
      variant = 'default',
      size = 'md',
      haptic = 'light',
      sound = 'tap',
      loading = false,
      ariaLabel,
      className,
      children,
      onClick,
      disabled,
      ...props
    },
    ref
  ) {
    const { supportsTouch, performanceTier, prefersReducedMotion } = usePlatform();

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (disabled || loading) return;
      
      if (haptic !== 'none') {
        triggerHaptic(haptic);
      }
      if (sound !== 'none') {
        playSound(sound);
      }
      
      onClick?.(e);
    };

    // Reduced motion or low performance = no animations
    const shouldAnimate = !prefersReducedMotion && performanceTier !== 'low';

    return (
      <motion.button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center rounded-lg font-medium',
          'transition-colors focus-visible:outline-none focus-visible:ring-2',
          'focus-visible:ring-ring focus-visible:ring-offset-2',
          'disabled:pointer-events-none disabled:opacity-50',
          // Touch-friendly sizing on touch devices
          supportsTouch && 'touch-target',
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        onClick={handleClick}
        disabled={disabled || loading}
        aria-label={ariaLabel}
        aria-busy={loading}
        whileTap={shouldAnimate ? { scale: 0.96 } : undefined}
        whileHover={shouldAnimate ? { scale: 1.02 } : undefined}
        transition={MOTION_CONFIG.spring.snappy}
        {...props}
      >
        {loading ? (
          <span className="flex items-center gap-2">
            <svg
              className="h-4 w-4 animate-spin"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span className="sr-only">Loading</span>
          </span>
        ) : (
          children
        )}
      </motion.button>
    );
  }
);

// Icon button with enhanced accessibility
interface IconButtonProps extends AccessibleButtonProps {
  icon: React.ReactNode;
  label: string;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton({ icon, label, className, ...props }, ref) {
    return (
      <AccessibleButton
        ref={ref}
        size="icon"
        ariaLabel={label}
        className={cn('rounded-full', className)}
        {...props}
      >
        {icon}
        <span className="sr-only">{label}</span>
      </AccessibleButton>
    );
  }
);
