import { memo, forwardRef } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface VYBELogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'splash';
  showText?: boolean;
  className?: string;
  animated?: boolean;
}

const sizes = {
  sm: { icon: 'w-6 h-6 sm:w-7 sm:h-7', text: 'text-sm', gap: 'gap-1', strokeWidth: 16 },
  md: { icon: 'w-7 h-7 sm:w-8 sm:h-8', text: 'text-base', gap: 'gap-1.5', strokeWidth: 14 },
  lg: { icon: 'w-8 h-8', text: 'text-lg', gap: 'gap-2', strokeWidth: 13 },
  xl: { icon: 'w-10 h-10', text: 'text-xl', gap: 'gap-2', strokeWidth: 12 },
  '2xl': { icon: 'w-16 h-16 sm:w-20 sm:h-20', text: 'text-2xl', gap: 'gap-3', strokeWidth: 12 },
  'splash': { icon: 'w-28 h-28 sm:w-36 sm:h-36', text: 'text-3xl', gap: 'gap-4', strokeWidth: 14 },
};

// Generate unique IDs to avoid conflicts when multiple logos are rendered
let logoIdCounter = 0;

/**
 * VYBE Logo component with forwardRef support to prevent React warnings
 */
export const VYBELogo = memo(forwardRef<HTMLDivElement, VYBELogoProps>(function VYBELogo({ 
  size = 'md', 
  showText = true, 
  className,
  animated = true 
}, ref) {
  const { icon, text, gap, strokeWidth } = sizes[size];
  const uniqueId = `vybe-logo-${++logoIdCounter}`;
  const isSplash = size === 'splash';

  return (
    <div ref={ref} className={cn('flex items-center', gap, className)}>
      <motion.div
        whileHover={animated && !isSplash ? { scale: 1.05 } : undefined}
        whileTap={animated && !isSplash ? { scale: 0.95 } : undefined}
        transition={{ type: 'spring', stiffness: 400, damping: 17 }}
        className={cn(
          icon,
          'relative flex items-center justify-center'
        )}
        initial={isSplash ? { scale: 0.5, opacity: 0 } : undefined}
        animate={isSplash ? { scale: 1, opacity: 1 } : undefined}
      >
        {/* Neon V Logo SVG - NO drop-shadow on non-splash to prevent color film on mobile */}
        <svg
          viewBox="0 0 100 100"
          fill="none"
          className={cn(icon, 'relative z-10 vybe-logo-animated')}
          style={{
            // Only apply subtle shadow on splash screen, none otherwise to prevent artifacts
            filter: isSplash 
              ? 'drop-shadow(0 0 4px hsl(var(--primary) / 0.3))'
              : 'none',
          }}
        >
          <defs>
            {/* Primary color gradient for left leg */}
            <linearGradient id={`${uniqueId}-primary`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="hsl(var(--primary))" />
              <stop offset="50%" stopColor="hsl(var(--neon-purple, var(--primary)))" />
              <stop offset="100%" stopColor="hsl(var(--primary))" />
            </linearGradient>
            
            {/* Accent color gradient for right leg */}
            <linearGradient id={`${uniqueId}-accent`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="hsl(var(--accent))" />
              <stop offset="50%" stopColor="hsl(var(--neon-cyan, var(--accent)))" />
              <stop offset="100%" stopColor="hsl(var(--accent))" />
            </linearGradient>
          </defs>
          
          {/* Left leg of V - primary color */}
          <motion.path
            d="M18 12 L50 88"
            stroke={`url(#${uniqueId}-primary)`}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            initial={animated ? { pathLength: 0, opacity: 0 } : { pathLength: 1, opacity: 1 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: isSplash ? 1 : 0.6, delay: isSplash ? 0.4 : 0.1, ease: 'easeOut' }}
          />
          
          {/* Right leg of V - accent color */}
          <motion.path
            d="M82 12 L50 88"
            stroke={`url(#${uniqueId}-accent)`}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            initial={animated ? { pathLength: 0, opacity: 0 } : { pathLength: 1, opacity: 1 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: isSplash ? 1 : 0.6, delay: isSplash ? 0.6 : 0.2, ease: 'easeOut' }}
          />
          
          {/* Bright center point where legs meet - pulsing */}
          <motion.circle
            cx="50"
            cy="88"
            r={isSplash ? 5 : 4}
            className="fill-foreground"
            initial={animated ? { scale: 0, opacity: 0 } : { scale: 1, opacity: 1 }}
            animate={animated ? { 
              scale: [1, 1.3, 1], 
              opacity: [0.9, 1, 0.9],
            } : { scale: 1, opacity: 1 }}
            transition={animated ? { 
              duration: 1.5, 
              repeat: Infinity, 
              ease: 'easeInOut',
              delay: isSplash ? 1.2 : 0.5 
            } : { duration: 0.3, delay: 0.5, ease: 'easeOut' }}
          />
        </svg>
      </motion.div>

      {showText && (
        <motion.span 
          className={cn(
            'font-display font-black tracking-tight',
            text
          )}
          style={{
            background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--neon-purple, var(--primary))), hsl(var(--accent)))',
            backgroundSize: '200% 200%',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            animation: animated ? 'gradient-shift 4s ease infinite' : 'none',
          }}
        >
          VYBE
        </motion.span>
      )}
    </div>
  );
}));

// Default export for backwards compatibility
export default VYBELogo;
