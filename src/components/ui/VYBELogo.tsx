import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface VYBELogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  className?: string;
  animated?: boolean;
}

const sizes = {
  sm: { icon: 'w-6 h-6', text: 'text-sm', gap: 'gap-1.5' },
  md: { icon: 'w-8 h-8', text: 'text-base', gap: 'gap-2' },
  lg: { icon: 'w-10 h-10', text: 'text-xl', gap: 'gap-2' },
  xl: { icon: 'w-12 h-12', text: 'text-2xl', gap: 'gap-3' },
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
        whileHover={animated ? { scale: 1.1, rotate: 5 } : undefined}
        whileTap={animated ? { scale: 0.95 } : undefined}
        transition={{ type: 'spring', stiffness: 400, damping: 17 }}
        className={cn(
          icon,
          'relative rounded-xl overflow-hidden flex items-center justify-center'
        )}
      >
        {/* Animated gradient background */}
        <div className="absolute inset-0 gradient-animated opacity-90" />
        
        {/* Glass overlay */}
        <div className="absolute inset-0 bg-white/10 backdrop-blur-[1px]" />
        
        {/* Logo mark - abstract V shape */}
        <svg
          viewBox="0 0 32 32"
          fill="none"
          className="relative z-10 w-full h-full p-1.5"
        >
          {/* Main V shape with wave effect */}
          <path
            d="M6 8L16 24L26 8"
            stroke="white"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="drop-shadow-lg"
          />
          {/* Sound wave accent lines */}
          <path
            d="M10 6C10 6 12 10 16 10C20 10 22 6 22 6"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            opacity="0.7"
          />
          <circle
            cx="16"
            cy="24"
            r="2"
            fill="white"
            className="drop-shadow-md"
          />
        </svg>
        
        {/* Shine effect */}
        <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-transparent" />
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
