import { memo, forwardRef } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { VybeWordmark } from '@/components/ui/VybeWordmark';
import { VybeLogoMark } from '@/components/ui/VybeLogoMark';

interface VYBELogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'splash';
  showText?: boolean;
  className?: string;
  animated?: boolean;
}

const sizes = {
  sm: { icon: 'w-6 h-6 sm:w-7 sm:h-7', gap: 'gap-1', strokeWidth: 18 },
  md: { icon: 'w-7 h-7 sm:w-8 sm:h-8', gap: 'gap-1.5', strokeWidth: 19 },
  lg: { icon: 'w-8 h-8', gap: 'gap-2', strokeWidth: 20 },
  xl: { icon: 'w-10 h-10', gap: 'gap-2', strokeWidth: 21 },
  '2xl': { icon: 'w-16 h-16 sm:w-20 sm:h-20', gap: 'gap-3', strokeWidth: 22 },
  splash: { icon: 'w-24 h-24 sm:w-32 sm:h-32', gap: 'gap-4', strokeWidth: 24 },
};

/**
 * VYBE mark — neon pill V themed to the user's equipped vybe (primary / accent / secondary).
 */
export const VYBELogo = memo(forwardRef<HTMLDivElement, VYBELogoProps>(function VYBELogo({
  size = 'md',
  showText = true,
  className,
  animated = true,
}, ref) {
  const { icon, gap, strokeWidth } = sizes[size];
  const isSplash = size === 'splash';

  return (
    <div ref={ref} className={cn('flex items-end overflow-visible', gap, className)}>
      <motion.div
        whileHover={animated && !isSplash ? { scale: 1.05 } : undefined}
        whileTap={animated && !isSplash ? { scale: 0.95 } : undefined}
        transition={{ type: 'spring', stiffness: 400, damping: 17 }}
        className={cn(icon, 'relative flex items-center justify-center')}
        initial={isSplash && animated ? { scale: 0.72, opacity: 0 } : undefined}
        animate={isSplash && animated ? { scale: 1, opacity: 1 } : undefined}
      >
        <VybeLogoMark
          className={cn(icon, 'relative z-10')}
          strokeWidth={strokeWidth}
          animated={animated}
          glow={isSplash || size === '2xl'}
        />
      </motion.div>

      {showText && (
        <VybeWordmark size={size === 'splash' ? 'splash' : size === '2xl' ? 'lg' : size === 'xl' ? 'md' : 'sm'} />
      )}
    </div>
  );
}));

export default VYBELogo;
