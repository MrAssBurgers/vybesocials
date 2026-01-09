import { forwardRef, ButtonHTMLAttributes, useState } from 'react';
import { motion, HTMLMotionProps, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useGlassIntensity } from './GlassIntensityProvider';
import { useAccessibility } from '@/providers/AccessibilityProvider';
import { triggerHaptic } from '@/lib/haptics';
import { playSound } from '@/lib/sounds';

interface GlassButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  variant?: 'default' | 'primary' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  haptic?: boolean;
  sound?: boolean;
  children?: React.ReactNode;
}

export const GlassButton = forwardRef<HTMLButtonElement, GlassButtonProps>(
  ({ 
    className, 
    variant = 'default', 
    size = 'md', 
    haptic = true, 
    sound = true,
    children,
    onClick,
    ...props 
  }, ref) => {
    const { reduceMotion } = useAccessibility();
    const [showRipple, setShowRipple] = useState(false);
    const [ripplePos, setRipplePos] = useState({ x: 0, y: 0 });

    const variantClasses = {
      default: 'liquid-glass-button',
      primary: 'liquid-glass-button bg-gradient-to-r from-primary/20 to-accent/20 hover:from-primary/30 hover:to-accent/30',
      ghost: 'bg-transparent hover:bg-foreground/5 border-transparent',
      outline: 'bg-transparent border border-foreground/10 hover:bg-foreground/5',
    };

    const sizeClasses = {
      sm: 'h-8 px-3 text-sm rounded-lg',
      md: 'h-10 px-4 text-sm rounded-xl',
      lg: 'h-12 px-6 text-base rounded-xl',
      icon: 'h-10 w-10 rounded-xl',
    };

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (haptic) triggerHaptic('light');
      if (sound) playSound('tap');

      // Ripple effect
      if (!reduceMotion) {
        const rect = e.currentTarget.getBoundingClientRect();
        setRipplePos({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        });
        setShowRipple(true);
        setTimeout(() => setShowRipple(false), 400);
      }

      onClick?.(e);
    };

    return (
      <motion.button
        ref={ref}
        whileTap={reduceMotion ? undefined : { scale: 0.96 }}
        whileHover={reduceMotion ? undefined : { scale: 1.02 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        onClick={handleClick}
        className={cn(
          'relative overflow-hidden font-medium transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'disabled:pointer-events-none disabled:opacity-50',
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        {...props}
      >
        {/* Sheen effect on hover */}
        <motion.div
          className="absolute inset-0 opacity-0 pointer-events-none"
          initial={false}
          whileHover={{ opacity: 1 }}
          style={{
            background: 'linear-gradient(105deg, transparent 40%, hsl(var(--foreground) / 0.05) 50%, transparent 60%)',
          }}
        />

        {/* Ripple effect */}
        <AnimatePresence>
          {showRipple && (
            <motion.span
              initial={{ scale: 0, opacity: 0.5 }}
              animate={{ scale: 4, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
              className="absolute rounded-full bg-foreground/10 pointer-events-none"
              style={{
                left: ripplePos.x - 10,
                top: ripplePos.y - 10,
                width: 20,
                height: 20,
              }}
            />
          )}
        </AnimatePresence>

        <span className="relative z-10 flex items-center justify-center gap-2">
          {children}
        </span>
      </motion.button>
    );
  }
);

GlassButton.displayName = 'GlassButton';
