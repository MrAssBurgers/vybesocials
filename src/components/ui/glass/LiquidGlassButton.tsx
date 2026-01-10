import { forwardRef, useState, useRef, useEffect } from 'react';
import { motion, HTMLMotionProps, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useAccessibility } from '@/providers/AccessibilityProvider';
import { triggerHaptic } from '@/lib/haptics';
import { playSound } from '@/lib/sounds';

interface LiquidGlassButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  variant?: 'default' | 'primary' | 'ghost' | 'outline' | 'nav' | 'selected';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  haptic?: boolean;
  sound?: boolean;
  shimmer?: boolean;
  selected?: boolean; // For nav items / tabs
  children?: React.ReactNode;
}

export const LiquidGlassButton = forwardRef<HTMLButtonElement, LiquidGlassButtonProps>(
  ({ 
    className, 
    variant = 'default', 
    size = 'md', 
    haptic = true, 
    sound = true,
    shimmer = false,
    selected = false,
    children,
    onClick,
    disabled,
    ...props 
  }, ref) => {
    const { reduceMotion } = useAccessibility();
    const [showRipple, setShowRipple] = useState(false);
    const [ripplePos, setRipplePos] = useState({ x: 0, y: 0 });
    const [isPressed, setIsPressed] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    const [isScrolling, setIsScrolling] = useState(false);
    const shimmerPhase = useRef(0);

    // Detect scrolling to pause shimmer
    useEffect(() => {
      if (!shimmer) return;
      
      let scrollTimeout: NodeJS.Timeout;
      const handleScroll = () => {
        setIsScrolling(true);
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => setIsScrolling(false), 150);
      };

      window.addEventListener('scroll', handleScroll, { passive: true });
      return () => {
        window.removeEventListener('scroll', handleScroll);
        clearTimeout(scrollTimeout);
      };
    }, [shimmer]);

    const variantClasses = {
      default: 'bg-foreground/5 hover:bg-foreground/10 border border-foreground/10',
      primary: 'bg-gradient-to-r from-primary/20 to-accent/20 hover:from-primary/30 hover:to-accent/30 border border-primary/20',
      ghost: 'bg-transparent hover:bg-foreground/5',
      outline: 'bg-transparent border border-foreground/15 hover:bg-foreground/5',
      nav: 'bg-transparent hover:bg-foreground/5',
      selected: 'bg-gradient-to-r from-primary/15 via-accent/10 to-primary/15 border border-primary/25',
    };

    const sizeClasses = {
      sm: 'h-8 px-3 text-sm rounded-lg min-w-[44px]',
      md: 'h-10 px-4 text-sm rounded-xl min-h-[44px] min-w-[44px]',
      lg: 'h-12 px-6 text-base rounded-xl min-h-[44px]',
      icon: 'h-10 w-10 rounded-xl min-h-[44px] min-w-[44px]',
    };

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (disabled) return;
      
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

    const shouldShimmer = shimmer && !reduceMotion && !isScrolling;
    const isSelected = selected || variant === 'selected';

    return (
      <motion.button
        ref={ref}
        onMouseDown={() => setIsPressed(true)}
        onMouseUp={() => setIsPressed(false)}
        onMouseLeave={() => { setIsPressed(false); setIsHovered(false); }}
        onMouseEnter={() => setIsHovered(true)}
        animate={reduceMotion ? undefined : {
          scale: isPressed ? 0.96 : isHovered ? 1.02 : 1,
        }}
        transition={{ type: 'spring', stiffness: 600, damping: 25 }}
        onClick={handleClick}
        disabled={disabled}
        className={cn(
          'relative overflow-hidden font-medium transition-colors backdrop-blur-md',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'disabled:pointer-events-none disabled:opacity-50',
          variantClasses[isSelected ? 'selected' : variant],
          sizeClasses[size],
          className
        )}
        {...props}
      >
        {/* Frosted glass inner glow */}
        <div className="absolute inset-0 rounded-[inherit] pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-black/5 to-transparent" />
        </div>

        {/* Selected state gradient highlight */}
        {isSelected && (
          <motion.div
            className="absolute inset-0 rounded-[inherit] pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{
              background: 'linear-gradient(135deg, hsl(var(--primary) / 0.12), hsl(var(--accent) / 0.08), hsl(var(--primary) / 0.12))',
              boxShadow: 'inset 0 0 0 1px hsl(var(--primary) / 0.2), inset 0 1px 0 hsl(var(--foreground) / 0.05)',
            }}
          />
        )}

        {/* Slow color shimmer (only for important buttons) */}
        {shouldShimmer && (
          <motion.div
            className="absolute inset-0 opacity-30 pointer-events-none rounded-[inherit]"
            animate={{
              background: [
                'linear-gradient(135deg, hsl(330 100% 60% / 0.15), transparent, hsl(185 100% 50% / 0.15))',
                'linear-gradient(135deg, hsl(185 100% 50% / 0.15), transparent, hsl(280 100% 60% / 0.15))',
                'linear-gradient(135deg, hsl(280 100% 60% / 0.15), transparent, hsl(330 100% 60% / 0.15))',
              ],
            }}
            transition={{
              duration: 10,
              repeat: Infinity,
              ease: 'linear',
            }}
          />
        )}

        {/* Glossy sheen on hover */}
        <motion.div
          className="absolute inset-0 pointer-events-none rounded-[inherit]"
          initial={{ opacity: 0, x: '-100%' }}
          animate={isHovered && !reduceMotion ? { opacity: 1, x: '100%' } : { opacity: 0, x: '-100%' }}
          transition={{ duration: 0.6, ease: 'easeInOut' }}
          style={{
            background: 'linear-gradient(105deg, transparent 30%, hsl(var(--foreground) / 0.08) 50%, transparent 70%)',
          }}
        />

        {/* Bubble ripple effect */}
        <AnimatePresence>
          {showRipple && (
            <motion.span
              initial={{ scale: 0, opacity: 0.6 }}
              animate={{ scale: 4, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
              className="absolute rounded-full bg-foreground/15 pointer-events-none"
              style={{
                left: ripplePos.x - 10,
                top: ripplePos.y - 10,
                width: 20,
                height: 20,
              }}
            />
          )}
        </AnimatePresence>

        {/* Button content */}
        <span className="relative z-10 flex items-center justify-center gap-2">
          {children}
        </span>

        {/* Gel compression shadow */}
        <motion.div
          className="absolute inset-x-2 bottom-0 h-1 rounded-full bg-black/20 blur-sm pointer-events-none"
          animate={{
            opacity: isPressed ? 0.4 : 0,
            scaleX: isPressed ? 0.9 : 1,
          }}
          transition={{ duration: 0.1 }}
        />
      </motion.button>
    );
  }
);

LiquidGlassButton.displayName = 'LiquidGlassButton';
