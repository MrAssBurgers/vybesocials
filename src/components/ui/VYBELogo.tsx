import { memo, forwardRef } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import vybeLogo from '@/assets/vybe-logo.png';

interface VYBELogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'splash';
  showText?: boolean;
  className?: string;
  animated?: boolean;
}

const sizes = {
  sm: { icon: 'w-6 h-6 sm:w-7 sm:h-7', text: 'text-sm', gap: 'gap-1' },
  md: { icon: 'w-7 h-7 sm:w-8 sm:h-8', text: 'text-base', gap: 'gap-1.5' },
  lg: { icon: 'w-8 h-8', text: 'text-lg', gap: 'gap-2' },
  xl: { icon: 'w-10 h-10', text: 'text-xl', gap: 'gap-2' },
  '2xl': { icon: 'w-16 h-16 sm:w-20 sm:h-20', text: 'text-2xl', gap: 'gap-3' },
  'splash': { icon: 'w-24 h-24 sm:w-32 sm:h-32', text: 'text-3xl', gap: 'gap-4' },
};

/**
 * VYBE Logo component with forwardRef support to prevent React warnings
 */
export const VYBELogo = memo(forwardRef<HTMLDivElement, VYBELogoProps>(function VYBELogo({ 
  size = 'md', 
  showText = true, 
  className,
  animated = true 
}, ref) {
  const { icon, text, gap } = sizes[size];
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
        <motion.img
          src={vybeLogo}
          alt="VYBE"
          className={cn(icon, 'relative z-10 object-contain')}
          style={{
            filter: isSplash 
              ? 'drop-shadow(0 0 12px hsl(var(--primary) / 0.7)) drop-shadow(0 0 24px hsl(var(--accent) / 0.5))'
              : 'drop-shadow(0 0 6px hsl(var(--primary) / 0.5)) drop-shadow(0 0 12px hsl(var(--accent) / 0.3))',
          }}
          initial={animated ? { opacity: 0, scale: 0.8 } : { opacity: 1, scale: 1 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: isSplash ? 0.8 : 0.4, ease: 'easeOut' }}
        />
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
