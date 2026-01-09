import { forwardRef, ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useGlassIntensity } from './GlassIntensityProvider';
import { useAccessibility } from '@/providers/AccessibilityProvider';

interface GlassCardProps {
  variant?: 'default' | 'elevated' | 'subtle';
  interactive?: boolean;
  noiseOverlay?: boolean;
  className?: string;
  children?: ReactNode;
}

export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  ({ className, variant = 'default', interactive = false, noiseOverlay = true, children, ...props }, ref) => {
    const { intensity, isScrolling } = useGlassIntensity();
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
        initial={reduceMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
        whileHover={interactive && !reduceMotion ? { 
          y: -2,
          transition: { duration: 0.2 }
        } : undefined}
        className={cn(
          'relative overflow-hidden rounded-xl',
          variantClasses[variant],
          intensityClasses[intensity],
          interactive && 'cursor-pointer',
          isScrolling && 'glass-paused',
          className
        )}
        {...props}
      >
        {/* Subtle noise texture overlay */}
        {noiseOverlay && intensity !== 'calm' && (
          <div 
            className="absolute inset-0 opacity-[0.02] pointer-events-none mix-blend-overlay"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
            }}
          />
        )}
        
        {/* Top highlight */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-foreground/10 to-transparent pointer-events-none" />
        
        {children}
      </motion.div>
    );
  }
);

GlassCard.displayName = 'GlassCard';
