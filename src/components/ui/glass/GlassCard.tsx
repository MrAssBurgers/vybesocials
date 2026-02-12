import { forwardRef, ReactNode, memo } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { liquidSpring } from '@/motion/liquidConfig';
import { useGlassIntensity } from './GlassIntensityProvider';
import { useAccessibility } from '@/providers/AccessibilityProvider';

interface GlassCardProps {
  variant?: 'default' | 'elevated' | 'subtle';
  interactive?: boolean;
  noiseOverlay?: boolean;
  className?: string;
  children?: ReactNode;
}

export const GlassCard = memo(forwardRef<HTMLDivElement, GlassCardProps>(
  ({ className, variant = 'default', interactive = false, noiseOverlay = true, children, ...props }, ref) => {
    const { intensity, isScrolling, contrast } = useGlassIntensity();
    const { reduceMotion } = useAccessibility();

    const variantClasses = {
      default: 'liquid-glass-card',
      elevated: 'liquid-glass-card shadow-xl',
      subtle: 'liquid-glass-subtle',
    };

    const intensityClasses = {
      calm: 'glass-calm',
      normal: '',
      max: 'glass-max',
    };

    return (
      <motion.div
        ref={ref}
        initial={reduceMotion ? false : { opacity: 0, y: 8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={liquidSpring}
        whileHover={interactive && !reduceMotion ? { 
          y: -3,
          scale: 1.01,
          transition: liquidSpring,
        } : undefined}
        className={cn(
          'relative overflow-hidden rounded-xl',
          variantClasses[variant],
          intensityClasses[intensity],
          interactive && 'cursor-pointer',
          isScrolling && 'glass-paused',
          contrast === 'high' && 'high-contrast',
          className
        )}
        {...props}
      >
        {/* Top edge highlight for depth */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-foreground/15 to-transparent pointer-events-none z-10" />
        
        {/* Left edge accent for premium feel */}
        <div className="absolute top-0 left-0 bottom-0 w-px bg-gradient-to-b from-foreground/10 via-transparent to-foreground/5 pointer-events-none z-10" />
        
        {/* Content wrapper with proper z-index */}
        <div className="relative z-[1]">
          {children}
        </div>
      </motion.div>
    );
  }
));

GlassCard.displayName = 'GlassCard';
