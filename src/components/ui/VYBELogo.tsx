import { memo, forwardRef } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { VybeWordmark } from '@/components/ui/VybeWordmark';
import { useVybeMarkColors } from '@/hooks/useVybeMarkColors';

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
  splash: { icon: 'w-24 h-24 sm:w-32 sm:h-32', text: 'text-3xl', gap: 'gap-4', strokeWidth: 14 },
};

/**
 * VYBE mark — resolved theme HSL on SVG strokes (WebKit-safe).
 */
export const VYBELogo = memo(forwardRef<HTMLDivElement, VYBELogoProps>(function VYBELogo({
  size = 'md',
  showText = true,
  className,
  animated = true,
}, ref) {
  const { icon, gap, strokeWidth } = sizes[size];
  const isSplash = size === 'splash';
  const colors = useVybeMarkColors();

  return (
    <div ref={ref} className={cn('flex items-end overflow-visible', gap, className)}>
      <motion.div
        whileHover={animated && !isSplash ? { scale: 1.05 } : undefined}
        whileTap={animated && !isSplash ? { scale: 0.95 } : undefined}
        transition={{ type: 'spring', stiffness: 400, damping: 17 }}
        className={cn(icon, 'relative flex items-center justify-center')}
        initial={isSplash && animated ? { scale: 0.5, opacity: 0 } : undefined}
        animate={isSplash && animated ? { scale: 1, opacity: 1 } : undefined}
      >
        <svg
          viewBox="0 0 100 100"
          fill="none"
          data-themed-svg="true"
          className={cn(icon, 'relative z-10 vybe-logo-mark')}
          style={{
            filter: isSplash ? 'drop-shadow(0 0 8px hsl(var(--primary) / 0.35))' : 'none',
          }}
        >
          <path
            d="M18 12 L50 88"
            stroke={colors.primary}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            className={animated ? 'vybe-logo-path vybe-logo-path--left' : undefined}
          />
          <path
            d="M82 12 L50 88"
            stroke={colors.accent}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            className={animated ? 'vybe-logo-path vybe-logo-path--right' : undefined}
          />
          <circle
            cx="50"
            cy="88"
            r={isSplash ? 5 : 4}
            fill={colors.primary}
            className={animated ? 'vybe-logo-dot' : undefined}
          />
        </svg>
      </motion.div>

      {showText && (
        <VybeWordmark size={size === 'splash' ? 'splash' : size === '2xl' ? 'lg' : size === 'xl' ? 'md' : 'sm'} />
      )}
    </div>
  );
}));

export default VYBELogo;
