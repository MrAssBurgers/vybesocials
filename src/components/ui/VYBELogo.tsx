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

export function VYBELogo({ 
  size = 'md', 
  showText = true, 
  className,
  animated = true 
}: VYBELogoProps) {
  const { icon, text, gap } = sizes[size];

  return (
    <div className={cn('flex items-center', gap, className)}>
      <motion.div
        whileHover={animated ? { scale: 1.1 } : undefined}
        whileTap={animated ? { scale: 0.95 } : undefined}
        transition={{ type: 'spring', stiffness: 400, damping: 17 }}
        className={cn(
          icon,
          'relative flex items-center justify-center'
        )}
      >
        {/* Animated glow effect */}
        {animated && (
          <>
            <motion.div
              className="absolute inset-0 rounded-lg blur-md"
              style={{
                background: 'linear-gradient(135deg, #ff006e 0%, #00f5d4 100%)',
              }}
              animate={{
                opacity: [0.5, 0.8, 0.5],
                scale: [0.9, 1.1, 0.9],
              }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            />
          </>
        )}
        
        {/* Neon V Logo SVG */}
        <motion.svg
          viewBox="0 0 100 100"
          fill="none"
          className={cn(icon, 'relative z-10')}
          animate={animated ? {
            filter: [
              'drop-shadow(0 0 8px rgba(255, 0, 110, 0.8)) drop-shadow(0 0 16px rgba(0, 245, 212, 0.6))',
              'drop-shadow(0 0 12px rgba(0, 245, 212, 0.8)) drop-shadow(0 0 20px rgba(255, 0, 110, 0.6))',
              'drop-shadow(0 0 8px rgba(255, 0, 110, 0.8)) drop-shadow(0 0 16px rgba(0, 245, 212, 0.6))',
            ],
          } : undefined}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
        >
          <defs>
            {/* Gradient for left stroke - pink to purple */}
            <linearGradient id="leftGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ff006e" />
              <stop offset="100%" stopColor="#8b5cf6" />
            </linearGradient>
            
            {/* Gradient for right stroke - purple to cyan */}
            <linearGradient id="rightGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#8b5cf6" />
              <stop offset="100%" stopColor="#00f5d4" />
            </linearGradient>
            
            {/* Glow filters */}
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>
          
          {/* Left leg of V - pink side */}
          <motion.path
            d="M20 15 L50 85"
            stroke="url(#leftGradient)"
            strokeWidth="14"
            strokeLinecap="round"
            filter="url(#glow)"
            initial={animated ? { pathLength: 0, opacity: 0 } : undefined}
            animate={animated ? { pathLength: 1, opacity: 1 } : undefined}
            transition={{ duration: 0.8, delay: 0.2, ease: 'easeOut' }}
          />
          
          {/* Right leg of V - cyan side */}
          <motion.path
            d="M80 15 L50 85"
            stroke="url(#rightGradient)"
            strokeWidth="14"
            strokeLinecap="round"
            filter="url(#glow)"
            initial={animated ? { pathLength: 0, opacity: 0 } : undefined}
            animate={animated ? { pathLength: 1, opacity: 1 } : undefined}
            transition={{ duration: 0.8, delay: 0.4, ease: 'easeOut' }}
          />
          
          {/* Center highlight at the meeting point */}
          <motion.circle
            cx="50"
            cy="85"
            r="4"
            fill="white"
            filter="url(#glow)"
            initial={animated ? { scale: 0, opacity: 0 } : undefined}
            animate={animated ? { scale: 1, opacity: 0.8 } : undefined}
            transition={{ duration: 0.4, delay: 0.8, ease: 'easeOut' }}
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
