import { memo, useMemo } from 'react';
import { cn } from '@/lib/utils';

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
 * 
 * IMPORTANT: Uses inline styles with explicit background-clip to prevent
 * any background color leakage (yellow rectangles, etc.)
 */
export const StyledDisplayName = memo(function StyledDisplayName({
  name,
  badge,
  className,
  as: Component = 'span',
}: StyledDisplayNameProps) {
  const hasGradient = badge?.gradient_from && badge?.gradient_to;

  // No gradient - render plain text
  if (!hasGradient) {
    return (
      <Component className={className}>
        {name}
      </Component>
    );
  }

  const from = `hsl(${badge.gradient_from})`;
  const to = `hsl(${badge.gradient_to})`;
  const via = badge.gradient_via ? `hsl(${badge.gradient_via})` : null;
  
  const gradient = via 
    ? `linear-gradient(135deg, ${from}, ${via}, ${to})`
    : `linear-gradient(135deg, ${from}, ${to})`;

  // Base style for gradient text - MUST have all these properties to prevent background leakage
  const gradientStyle: React.CSSProperties = {
    background: gradient,
    backgroundClip: 'text',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    color: 'transparent',
    // Ensure no box background shows through
    backgroundColor: 'transparent',
    boxShadow: 'none',
  };

  // Add text shadow for shine effect (no filter to avoid artifacts)
  if (badge?.effect === 'shine') {
    gradientStyle.textShadow = '0 1px 1px rgba(255,255,255,0.2)';
  }

  return (
    <Component 
      style={gradientStyle} 
      className={cn('font-bold inline', className)}
    >
      {name}
    </Component>
  );
});
