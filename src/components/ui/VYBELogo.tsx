import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface VYBELogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
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

  return (
    <div className={cn('flex items-center', gap, className)}>
      <motion.div
        whileHover={animated ? { scale: 1.05 } : undefined}
        whileTap={animated ? { scale: 0.95 } : undefined}
        transition={{ type: 'spring', stiffness: 400, damping: 17 }}
        className={cn(
          icon,
          'relative flex items-center justify-center'
        )}
      >
        {/* Neon V Logo SVG - using theme colors */}
        <motion.svg
          viewBox="0 0 100 100"
          fill="none"
          className={cn(icon, 'relative z-10')}
          style={{
            filter: 'drop-shadow(0 0 8px hsl(var(--primary) / 0.6)) drop-shadow(0 0 16px hsl(var(--accent) / 0.4))',
          }}
          animate={animated ? {
            filter: [
              'drop-shadow(0 0 6px hsl(var(--primary) / 0.5)) drop-shadow(0 0 12px hsl(var(--accent) / 0.3))',
              'drop-shadow(0 0 16px hsl(var(--primary) / 0.9)) drop-shadow(0 0 32px hsl(var(--accent) / 0.7))',
              'drop-shadow(0 0 6px hsl(var(--primary) / 0.5)) drop-shadow(0 0 12px hsl(var(--accent) / 0.3))',
            ],
          } : undefined}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
        >
          <defs>
            {/* Primary color gradient for left leg - animated */}
            <linearGradient id={`${uniqueId}-primary`} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" className="[stop-color:hsl(var(--primary))]">
                <animate attributeName="stop-color" values="hsl(330, 100%, 60%); hsl(280, 100%, 60%); hsl(330, 100%, 60%)" dur="3s" repeatCount="indefinite" />
              </stop>
              <stop offset="50%" className="[stop-color:hsl(var(--neon-purple))]">
                <animate attributeName="stop-color" values="hsl(280, 100%, 60%); hsl(330, 100%, 70%); hsl(280, 100%, 60%)" dur="3s" repeatCount="indefinite" />
              </stop>
              <stop offset="100%" className="[stop-color:hsl(var(--primary))]">
                <animate attributeName="stop-color" values="hsl(330, 100%, 60%); hsl(280, 100%, 60%); hsl(330, 100%, 60%)" dur="3s" repeatCount="indefinite" />
              </stop>
            </linearGradient>
            
            {/* Accent color gradient for right leg - animated */}
            <linearGradient id={`${uniqueId}-accent`} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" className="[stop-color:hsl(var(--accent))]">
                <animate attributeName="stop-color" values="hsl(185, 100%, 50%); hsl(160, 100%, 50%); hsl(185, 100%, 50%)" dur="3s" repeatCount="indefinite" />
              </stop>
              <stop offset="50%" className="[stop-color:hsl(var(--neon-cyan))]">
                <animate attributeName="stop-color" values="hsl(185, 100%, 60%); hsl(200, 100%, 50%); hsl(185, 100%, 60%)" dur="3s" repeatCount="indefinite" />
              </stop>
              <stop offset="100%" className="[stop-color:hsl(var(--accent))]">
                <animate attributeName="stop-color" values="hsl(185, 100%, 50%); hsl(160, 100%, 50%); hsl(185, 100%, 50%)" dur="3s" repeatCount="indefinite" />
              </stop>
            </linearGradient>
            
            {/* Intense glow filter */}
            <filter id={`${uniqueId}-glow`} x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="2" result="blur1"/>
              <feGaussianBlur stdDeviation="5" result="blur2"/>
              <feMerge>
                <feMergeNode in="blur2"/>
                <feMergeNode in="blur1"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>
          
          {/* Left leg of V - primary color */}
          <motion.path
            d="M18 12 L50 88"
            stroke={`url(#${uniqueId}-primary)`}
            strokeWidth="12"
            strokeLinecap="round"
            filter={`url(#${uniqueId}-glow)`}
            initial={animated ? { pathLength: 0, opacity: 0 } : { pathLength: 1, opacity: 1 }}
            animate={animated ? { 
              pathLength: 1, 
              opacity: 1,
              strokeWidth: [12, 14, 12]
            } : { pathLength: 1, opacity: 1 }}
            transition={animated ? { 
              pathLength: { duration: 0.6, delay: 0.1, ease: 'easeOut' },
              opacity: { duration: 0.6, delay: 0.1, ease: 'easeOut' },
              strokeWidth: { duration: 2, repeat: Infinity, ease: 'easeInOut' }
            } : undefined}
          />
          
          {/* Right leg of V - accent color */}
          <motion.path
            d="M82 12 L50 88"
            stroke={`url(#${uniqueId}-accent)`}
            strokeWidth="12"
            strokeLinecap="round"
            filter={`url(#${uniqueId}-glow)`}
            initial={animated ? { pathLength: 0, opacity: 0 } : { pathLength: 1, opacity: 1 }}
            animate={animated ? { 
              pathLength: 1, 
              opacity: 1,
              strokeWidth: [12, 14, 12]
            } : { pathLength: 1, opacity: 1 }}
            transition={animated ? { 
              pathLength: { duration: 0.6, delay: 0.2, ease: 'easeOut' },
              opacity: { duration: 0.6, delay: 0.2, ease: 'easeOut' },
              strokeWidth: { duration: 2, delay: 0.5, repeat: Infinity, ease: 'easeInOut' }
            } : undefined}
          />
          
          {/* Bright center point where legs meet - pulsing */}
          <motion.circle
            cx="50"
            cy="88"
            r="4"
            className="fill-foreground"
            filter={`url(#${uniqueId}-glow)`}
            initial={animated ? { scale: 0, opacity: 0 } : { scale: 1, opacity: 1 }}
            animate={animated ? { 
              scale: [1, 1.5, 1], 
              opacity: [0.8, 1, 0.8],
              r: [4, 6, 4]
            } : { scale: 1, opacity: 1 }}
            transition={animated ? { 
              duration: 1.2, 
              repeat: Infinity, 
              ease: 'easeInOut',
              delay: 0.6 
            } : { duration: 0.3, delay: 0.5, ease: 'easeOut' }}
          />
        </motion.svg>
      </motion.div>

      {showText && (
        <span className={cn(
          'font-display font-black tracking-tight gradient-text',
          text
        )}>
          VYBE
        </span>
      )}
    </div>
  );
}
