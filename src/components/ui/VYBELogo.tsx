import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import vybeLogo from '@/assets/vybe-logo.png';

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
        {/* Glow effect behind logo */}
        {animated && (
          <motion.div
            className="absolute inset-0 rounded-full blur-lg"
            style={{
              background: 'linear-gradient(135deg, #ff006e 0%, #00f5d4 100%)',
            }}
            animate={{
              opacity: [0.4, 0.7, 0.4],
              scale: [1, 1.2, 1],
            }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
        
        {/* Logo image */}
        <motion.img
          src={vybeLogo}
          alt="VYBE"
          className={cn(icon, 'relative z-10 object-contain')}
          animate={animated ? {
            filter: [
              'drop-shadow(0 0 8px rgba(255, 0, 110, 0.5))',
              'drop-shadow(0 0 16px rgba(0, 245, 212, 0.5))',
              'drop-shadow(0 0 8px rgba(255, 0, 110, 0.5))',
            ],
          } : undefined}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        />
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
