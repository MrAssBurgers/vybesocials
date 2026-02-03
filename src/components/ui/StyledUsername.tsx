import { memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useDisplayStyle } from '@/hooks/useDisplayStyle';

interface StyledUsernameProps {
  userId: string;
  username: string;
  displayName?: string | null;
  className?: string;
  showAtSymbol?: boolean;
  /** If true, use display name if available, otherwise username */
  preferDisplayName?: boolean;
  /** Optional pre-fetched badge style to avoid refetching */
  badgeStyle?: {
    gradient_from?: string | null;
    gradient_to?: string | null;
    gradient_via?: string | null;
    effect?: string | null;
    is_animated?: boolean;
  } | null;
}

/**
 * StyledUsername - Universal component for rendering usernames with badge-based styling
 * 
 * Use this component EVERYWHERE a username needs to be displayed to ensure consistent
 * badge-based styling across the entire app.
 */
export const StyledUsername = memo(function StyledUsername({
  userId,
  username,
  displayName,
  className,
  showAtSymbol = false,
  preferDisplayName = true,
  badgeStyle: preloadedStyle,
}: StyledUsernameProps) {
  // Fetch badge style if not pre-loaded
  const { data: fetchedStyle } = useDisplayStyle(preloadedStyle !== undefined ? undefined : userId);
  
  const badge = preloadedStyle ?? fetchedStyle;
  
  const nameToShow = useMemo(() => {
    if (preferDisplayName && displayName) {
      return displayName;
    }
    return showAtSymbol ? `@${username}` : username;
  }, [preferDisplayName, displayName, showAtSymbol, username]);
  
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

  // No badge styling - render plain text
  if (!hasGradient) {
    return <span className={className}>{nameToShow}</span>;
  }

  // Animated shimmer gradient
  if (badge?.is_animated && badge.effect === 'shimmer') {
    return (
      <motion.span
        animate={{ backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
        style={style}
        className={cn('font-semibold', effectClass, className)}
      >
        {nameToShow}
      </motion.span>
    );
  }

  // Static shiny/metallic texture effect (no animation)
  if (badge?.effect === 'shine') {
    const shinyStyle = {
      ...style,
      textShadow: '0 1px 2px rgba(255,255,255,0.4), 0 0 8px rgba(255,255,255,0.15)',
      filter: 'contrast(1.1) brightness(1.08)',
    };
    return (
      <span style={shinyStyle} className={cn('font-semibold', className)}>
        {nameToShow}
      </span>
    );
  }

  // Static gradient or pulse effect
  return (
    <motion.span
      style={style}
      className={cn('font-semibold', effectClass, className)}
      animate={badge?.effect === 'pulse' ? { 
        filter: ['drop-shadow(0 0 4px hsl(var(--primary)/0.3))', 'drop-shadow(0 0 12px hsl(var(--primary)/0.6))', 'drop-shadow(0 0 4px hsl(var(--primary)/0.3))']
      } : undefined}
      transition={badge?.effect === 'pulse' ? { duration: 2, repeat: Infinity } : undefined}
    >
      {nameToShow}
    </motion.span>
  );
});

export default StyledUsername;
