import { memo, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

export interface BadgeStyle {
  gradient_from?: string | null;
  gradient_to?: string | null;
  gradient_via?: string | null;
  effect?: string | null;
  is_animated?: boolean;
}

interface StyledDisplayNameProps {
  name: string;
  badge?: BadgeStyle | null;
  className?: string;
  as?: 'span' | 'h1' | 'h2' | 'p';
}

/**
 * StyledDisplayName - Renders a user's display name with badge-based styling
 * Includes gradient colors and effects based on their highest priority badge
 */
export const StyledDisplayName = memo(function StyledDisplayName({
  name,
  badge,
  className,
  as: Component = 'span',
}: StyledDisplayNameProps) {
  const style = useMemo(() => {
    if (!badge?.gradient_from || !badge?.gradient_to) {
      return {};
    }
    
    const from = `hsl(${badge.gradient_from})`;
    const to = `hsl(${badge.gradient_to})`;
    const via = badge.gradient_via ? `hsl(${badge.gradient_via})` : null;
    
    const gradient = via 
      ? `linear-gradient(135deg, ${from}, ${via}, ${to})`
      : `linear-gradient(135deg, ${from}, ${to})`;
    
    return {
      background: gradient,
      backgroundClip: 'text',
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      backgroundSize: badge.is_animated ? '200% 200%' : '100% 100%',
    };
  }, [badge]);

  const effectClass = useMemo(() => {
    if (!badge?.effect) return '';
    
    switch (badge.effect) {
      case 'glow':
        return 'drop-shadow-[0_0_8px_hsl(var(--primary)/0.5)]';
      case 'shimmer':
        return 'animate-shimmer';
      case 'pulse':
        return 'animate-badge-pulse';
      case 'shine':
        return 'animate-shine';
      default:
        return '';
    }
  }, [badge?.effect]);

  const hasGradient = badge?.gradient_from && badge?.gradient_to;

  if (!hasGradient) {
    return (
      <Component className={className}>
        {name}
      </Component>
    );
  }

  // Animated gradient shift
  if (badge?.is_animated && badge.effect === 'shimmer') {
    return (
      <motion.span
        animate={{ backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
        style={style}
        className={cn('font-bold', effectClass, className)}
      >
        {name}
      </motion.span>
    );
  }

  // Static shiny/metallic texture effect - NO filters to avoid color film on mobile
  if (badge?.effect === 'shine') {
    const shinyStyle = {
      ...style,
      textShadow: '0 1px 1px rgba(255,255,255,0.2)',
      // Explicitly no filter property - prevents glow artifacts on mobile/tablet
    };
    return (
      <Component style={shinyStyle} className={cn('font-bold', className)}>
        {name}
      </Component>
    );
  }

  // Static gradient - NO pulse filter animation to avoid color film artifacts
  if (badge?.effect === 'pulse') {
    return (
      <motion.span
        style={style}
        className={cn('font-bold', className)}
        animate={{ opacity: [1, 0.85, 1] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        {name}
      </motion.span>
    );
  }

  // Static gradient or glow effect - use opacity animation instead of filter
  return (
    <motion.span
      style={style}
      className={cn('font-bold', effectClass, className)}
    >
      {name}
    </motion.span>
  );
});
