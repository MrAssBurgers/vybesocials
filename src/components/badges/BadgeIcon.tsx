import { memo, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface BadgeIconProps {
  icon: string;
  name: string;
  description?: string | null;
  gradient_from?: string | null;
  gradient_to?: string | null;
  effect?: string | null;
  is_animated?: boolean;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  showTooltip?: boolean;
  locked?: boolean;
  className?: string;
}

const sizeClasses = {
  xs: 'h-4 w-4 text-xs',
  sm: 'h-5 w-5 text-sm',
  md: 'h-6 w-6 text-base',
  lg: 'h-8 w-8 text-lg',
  xl: 'h-14 w-14 text-3xl',
};

/**
 * BadgeIcon - Renders a single badge with optional effects and tooltip
 * On mobile/tablet: Uses solid color + drop-shadow for consistent visibility
 */
export const BadgeIcon = memo(function BadgeIcon({
  icon,
  name,
  description,
  gradient_from,
  gradient_to,
  effect,
  is_animated,
  size = 'sm',
  showTooltip = true,
  locked = false,
  className,
}: BadgeIconProps) {
  // Generate stable ID for mobile style injection
  const elementId = useMemo(() => `badge-icon-${Math.random().toString(36).slice(2, 9)}`, []);

  const backgroundStyle = useMemo(() => {
    if (locked) {
      return { background: 'hsl(var(--muted))' };
    }
    if (!gradient_from || !gradient_to) {
      return {};
    }
    const from = `hsl(${gradient_from})`;
    const to = `hsl(${gradient_to})`;
    return {
      background: `linear-gradient(135deg, ${from}, ${to})`,
    };
  }, [gradient_from, gradient_to, locked]);

  // Get the primary color for mobile fallback
  const primaryColor = useMemo(() => {
    if (locked || !gradient_from) return null;
    return `hsl(${gradient_from})`;
  }, [gradient_from, locked]);

  const effectClass = useMemo(() => {
    if (locked) return 'opacity-40 blur-[1px]';
    if (!effect) return '';
    
    switch (effect) {
      case 'glow':
        return 'shadow-[0_0_8px_hsl(var(--primary)/0.5)]';
      case 'shimmer':
        return '';
      case 'pulse':
        return '';
      case 'shine':
        return '';
      default:
        return '';
    }
  }, [effect, locked]);

  const badgeContent = (
    <>
      {/* Mobile fallback styles - solid color + drop-shadow */}
      {primaryColor && (
        <style>{`
          @media (max-width: 1024px) {
            #${elementId} {
              background: ${primaryColor} !important;
              filter: drop-shadow(0 2px 4px rgba(0,0,0,0.4));
              opacity: 1 !important;
            }
          }
        `}</style>
      )}
      <motion.div
        id={elementId}
        className={cn(
          'inline-flex items-center justify-center rounded-full',
          sizeClasses[size],
          effectClass,
          className
        )}
        style={backgroundStyle}
        animate={
          is_animated && effect === 'pulse' && !locked
            ? { scale: [1, 1.1, 1] }
            : undefined
        }
        transition={
          is_animated && effect === 'pulse'
            ? { duration: 1.5, repeat: Infinity }
            : undefined
        }
        whileHover={locked ? undefined : { scale: 1.1 }}
      >
        <span className={locked ? 'grayscale' : ''}>
          {icon}
        </span>
      </motion.div>
    </>
  );

  if (!showTooltip) {
    return badgeContent;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {badgeContent}
        </TooltipTrigger>
        <TooltipContent className="max-w-[200px]">
          <p className="font-semibold">{name}</p>
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
          {locked && (
            <p className="text-xs text-primary mt-1">🔒 Locked</p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});
