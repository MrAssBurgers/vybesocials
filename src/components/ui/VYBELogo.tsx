import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface VYBELogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'splash';
  showText?: boolean;
  className?: string;
  animated?: boolean;
}

const sizes = {
  sm: { icon: 'w-7 h-7 sm:w-8 sm:h-8', text: 'text-sm', gap: 'gap-1.5' },
  md: { icon: 'w-8 h-8 sm:w-9 sm:h-9', text: 'text-base', gap: 'gap-2' },
  lg: { icon: 'w-10 h-10', text: 'text-xl', gap: 'gap-2' },
  xl: { icon: 'w-12 h-12', text: 'text-2xl', gap: 'gap-3' },
  '2xl': { icon: 'w-20 h-20 sm:w-24 sm:h-24', text: 'text-3xl', gap: 'gap-4' },
  'splash': { icon: 'w-28 h-28 sm:w-36 sm:h-36', text: 'text-4xl', gap: 'gap-4' },
};

// Generate unique IDs to avoid conflicts when multiple logos are rendered
let logoIdCounter = 0;

export function VYBELogo({ 
  size = 'md', 
  showText = true, 
  className,
  animated = true 
}: VYBELogoProps) {
  const { icon, text, gap } = sizes[size];
  const uniqueId = `vybe-logo-${++logoIdCounter}`;
  const isSplash = size === 'splash';

  return (
    <div className={cn('flex items-center', gap, className)}>
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
        {/* Neon V Logo SVG - using theme colors with animated gradients */}
        <svg
          viewBox="0 0 100 100"
          fill="none"
          className={cn(icon, 'relative z-10')}
        >
          <defs>
            {/* Primary color gradient for left leg - animated colors */}
            <linearGradient id={`${uniqueId}-primary`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%">
                <animate 
                  attributeName="stop-color" 
                  values="hsl(330, 100%, 60%); hsl(280, 100%, 65%); hsl(350, 100%, 55%); hsl(330, 100%, 60%)" 
                  dur="4s" 
                  repeatCount="indefinite" 
                />
              </stop>
              <stop offset="50%">
                <animate 
                  attributeName="stop-color" 
                  values="hsl(280, 100%, 60%); hsl(320, 100%, 55%); hsl(300, 100%, 65%); hsl(280, 100%, 60%)" 
                  dur="4s" 
                  repeatCount="indefinite" 
                />
              </stop>
              <stop offset="100%">
                <animate 
                  attributeName="stop-color" 
                  values="hsl(260, 100%, 65%); hsl(330, 100%, 60%); hsl(280, 100%, 60%); hsl(260, 100%, 65%)" 
                  dur="4s" 
                  repeatCount="indefinite" 
                />
              </stop>
            </linearGradient>
            
            {/* Accent color gradient for right leg - animated colors */}
            <linearGradient id={`${uniqueId}-accent`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%">
                <animate 
                  attributeName="stop-color" 
                  values="hsl(185, 100%, 50%); hsl(200, 100%, 55%); hsl(170, 100%, 50%); hsl(185, 100%, 50%)" 
                  dur="4s" 
                  repeatCount="indefinite" 
                />
              </stop>
              <stop offset="50%">
                <animate 
                  attributeName="stop-color" 
                  values="hsl(175, 100%, 55%); hsl(185, 100%, 60%); hsl(195, 100%, 50%); hsl(175, 100%, 55%)" 
                  dur="4s" 
                  repeatCount="indefinite" 
                />
              </stop>
              <stop offset="100%">
                <animate 
                  attributeName="stop-color" 
                  values="hsl(160, 100%, 50%); hsl(180, 100%, 55%); hsl(200, 100%, 60%); hsl(160, 100%, 50%)" 
                  dur="4s" 
                  repeatCount="indefinite" 
                />
              </stop>
            </linearGradient>
            
            {/* Intense glow filter */}
            <filter id={`${uniqueId}-glow`} x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation={isSplash ? "4" : "2"} result="blur1"/>
              <feGaussianBlur stdDeviation={isSplash ? "8" : "5"} result="blur2"/>
              <feMerge>
                <feMergeNode in="blur2"/>
                <feMergeNode in="blur1"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>

            {/* Animated glow intensity */}
            <filter id={`${uniqueId}-pulse-glow`} x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur result="blur">
                <animate 
                  attributeName="stdDeviation" 
                  values={isSplash ? "3;6;3" : "2;4;2"}
                  dur="2s" 
                  repeatCount="indefinite" 
                />
              </feGaussianBlur>
              <feMerge>
                <feMergeNode in="blur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>
          
          {/* Left leg of V - primary color */}
          <motion.path
            d="M18 12 L50 88"
            stroke={`url(#${uniqueId}-primary)`}
            strokeWidth={isSplash ? 14 : 12}
            strokeLinecap="round"
            filter={`url(#${uniqueId}-pulse-glow)`}
            initial={animated ? { pathLength: 0, opacity: 0 } : { pathLength: 1, opacity: 1 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: isSplash ? 1 : 0.6, delay: isSplash ? 0.4 : 0.1, ease: 'easeOut' }}
          />
          
          {/* Right leg of V - accent color */}
          <motion.path
            d="M82 12 L50 88"
            stroke={`url(#${uniqueId}-accent)`}
            strokeWidth={isSplash ? 14 : 12}
            strokeLinecap="round"
            filter={`url(#${uniqueId}-pulse-glow)`}
            initial={animated ? { pathLength: 0, opacity: 0 } : { pathLength: 1, opacity: 1 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: isSplash ? 1 : 0.6, delay: isSplash ? 0.6 : 0.2, ease: 'easeOut' }}
          />
          
          {/* Bright center point where legs meet - pulsing */}
          <motion.circle
            cx="50"
            cy="88"
            r={isSplash ? 5 : 4}
            fill="white"
            filter={`url(#${uniqueId}-glow)`}
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
            background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--neon-purple)), hsl(var(--accent)))',
            backgroundSize: '200% 200%',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            animation: 'gradient-shift 4s ease infinite',
          }}
        >
          VYBE
        </motion.span>
      )}
    </div>
  );
}