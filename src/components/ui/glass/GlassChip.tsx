import { forwardRef, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useAccessibility } from '@/providers/AccessibilityProvider';
import { X } from 'lucide-react';

interface GlassChipProps {
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'destructive';
  size?: 'sm' | 'md';
  removable?: boolean;
  onRemove?: () => void;
  className?: string;
  children?: ReactNode;
}

export const GlassChip = forwardRef<HTMLSpanElement, GlassChipProps>(
  ({ className, variant = 'default', size = 'md', removable, onRemove, children, ...props }, ref) => {
    const { reduceMotion } = useAccessibility();

    const variantClasses = {
      default: 'frosted-pill',
      primary: 'frosted-pill bg-gradient-to-r from-primary/20 to-primary/10',
      success: 'frosted-pill bg-gradient-to-r from-success/20 to-success/10',
      warning: 'frosted-pill bg-gradient-to-r from-warning/20 to-warning/10',
      destructive: 'frosted-pill bg-gradient-to-r from-destructive/20 to-destructive/10',
    };

    const sizeClasses = {
      sm: 'px-2 py-0.5 text-xs',
      md: 'px-3 py-1 text-sm',
    };

    return (
      <motion.span
        ref={ref}
        initial={reduceMotion ? false : { scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={reduceMotion ? undefined : { scale: 0.9, opacity: 0 }}
        whileHover={reduceMotion ? undefined : { scale: 1.05 }}
        transition={{ duration: 0.15 }}
        className={cn(
          'inline-flex items-center gap-1 font-medium',
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        {...props}
      >
        {children}
        {removable && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove?.();
            }}
            className="ml-0.5 rounded-full hover:bg-foreground/10 p-0.5 transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </motion.span>
    );
  }
);

GlassChip.displayName = 'GlassChip';
