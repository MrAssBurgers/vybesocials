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
 * On desktop: Uses CSS gradient with background-clip for premium effect
 * On mobile/tablet: Falls back to solid color + drop-shadow (matches WelcomeHeader)
 */
export const StyledDisplayName = memo(function StyledDisplayName({
  name,
  badge,
  className,
  as: Component = 'span',
}: StyledDisplayNameProps) {
  // Generate a unique ID for this element to apply mobile styles (must be before early return)
  const elementId = useMemo(() => `styled-display-${Math.random().toString(36).slice(2, 9)}`, []);

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

  // Desktop: gradient text with background-clip
  // Mobile: solid color from gradient start + drop-shadow (like WelcomeHeader)
  const gradientStyle: React.CSSProperties = {
    background: gradient,
    backgroundClip: 'text',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    color: 'transparent',
    backgroundColor: 'transparent',
    boxShadow: 'none',
  };

  // Add text shadow for shine effect (no filter to avoid artifacts)
  if (badge?.effect === 'shine') {
    gradientStyle.textShadow = '0 1px 1px rgba(255,255,255,0.2)';
  }

  return (
    <>
      <style>{`
        @media (max-width: 1024px) {
          #${elementId} {
            color: ${from} !important;
            -webkit-text-fill-color: ${from} !important;
            background-clip: unset !important;
            -webkit-background-clip: unset !important;
            filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));
            opacity: 1 !important;
          }
        }
      `}</style>
      <Component 
        id={elementId}
        style={gradientStyle} 
        className={cn('font-bold inline', className)}
      >
        {name}
      </Component>
    </>
  );
});
