import { memo, forwardRef } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { VybeWordmark } from '@/components/ui/VybeWordmark';
import { VybeLogo } from '@/components/brand/VybeLogo';

interface VYBELogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'splash';
  showText?: boolean;
  className?: string;
  animated?: boolean;
}

const sizes = {
  sm: { px: 28, gap: 'gap-1', wordmark: 'xs' as const },
  md: { px: 32, gap: 'gap-1.5', wordmark: 'xs' as const },
  lg: { px: 32, gap: 'gap-2', wordmark: 'sm' as const },
  xl: { px: 40, gap: 'gap-2', wordmark: 'md' as const },
  '2xl': { px: 80, gap: 'gap-3', wordmark: 'lg' as const },
  splash: { px: 128, gap: 'gap-4', wordmark: 'splash' as const },
};

/** VYBE mark + optional wordmark — wraps brand `VybeLogo` SVG. */
export const VYBELogo = memo(forwardRef<HTMLDivElement, VYBELogoProps>(function VYBELogo({
  size = 'md',
  showText = true,
  className,
  animated = true,
}, ref) {
  const { px, gap, wordmark } = sizes[size];
  const isSplash = size === 'splash';
  const isHero = isSplash || size === '2xl';
  const isCompact = size === 'sm' || size === 'md';

  return (
    <div ref={ref} className={cn('flex items-center overflow-visible', gap, className)}>
      <motion.div
        whileHover={animated && !isSplash ? { scale: 1.05 } : undefined}
        whileTap={animated && !isSplash ? { scale: 0.95 } : undefined}
        transition={{ type: 'spring', stiffness: 400, damping: 17 }}
        className="relative flex shrink-0 items-center justify-center overflow-visible"
      >
        <VybeLogo
          size={px}
          animated={animated}
          glowIntensity={isHero ? 1 : isCompact ? 0.72 : 0.88}
        />
      </motion.div>

      {showText && (
        <VybeWordmark size={wordmark} className="shrink-0" />
      )}
    </div>
  );
}));

export default VYBELogo;
