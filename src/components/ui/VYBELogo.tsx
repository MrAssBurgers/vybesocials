import { memo, forwardRef, useMemo } from 'react';
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
  'splash': { icon: 'w-24 h-24 sm:w-32 sm:h-32', text: 'text-3xl', gap: 'gap-4', strokeWidth: 14 },
};

// Generate unique IDs to avoid conflicts when multiple logos are rendered
let logoIdCounter = 0;

/**
 * VYBE Logo component with forwardRef support to prevent React warnings
 * On mobile/tablet: Falls back to solid color + drop-shadow (matches WelcomeHeader)
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
  
  // Generate stable ID for mobile style injection
  const styleId = useMemo(() => `vybe-text-${Math.random().toString(36).slice(2, 9)}`, []);

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
          data-themed-svg="true"
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
          <path
            d="M18 12 L50 88"
            stroke={`url(#${uniqueId}-primary)`}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            className={animated ? 'vybe-path-left' : ''}
            style={animated ? {
              strokeDasharray: 100,
              strokeDashoffset: 0,
              animation: isSplash ? 'vybe-draw 0.8s ease-out 0.2s backwards' : 'vybe-draw 0.5s ease-out backwards',
            } : undefined}
          />
          
          {/* Right leg of V - accent color */}
          <path
            d="M82 12 L50 88"
            stroke={`url(#${uniqueId}-accent)`}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            className={animated ? 'vybe-path-right' : ''}
            style={animated ? {
              strokeDasharray: 100,
              strokeDashoffset: 0,
              animation: isSplash ? 'vybe-draw 0.8s ease-out 0.4s backwards' : 'vybe-draw 0.5s ease-out 0.1s backwards',
            } : undefined}
          />
          
          {/* Bright center point where legs meet - CSS pulse for reliability */}
          <circle
            cx="50"
            cy="88"
            r={isSplash ? 5 : 4}
            className="fill-foreground"
            style={animated ? {
              animation: 'vybe-pulse 1.5s ease-in-out infinite',
              animationDelay: isSplash ? '1s' : '0.4s',
              transformOrigin: '50px 88px',
            } : undefined}
          />
          
          {/* CSS keyframes for reliable animations */}
          <style>{`
            @keyframes vybe-draw {
              from { stroke-dashoffset: 100; opacity: 0; }
              to { stroke-dashoffset: 0; opacity: 1; }
            }
            @keyframes vybe-pulse {
              0%, 100% { transform: scale(1); opacity: 0.9; }
              50% { transform: scale(1.3); opacity: 1; }
            }
          `}</style>
        </svg>
      </motion.div>

      {showText && (
        <>
          <motion.span 
            id={styleId}
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
        </>
      )}
    </div>
  );
}));

// Default export for backwards compatibility
export default VYBELogo;
