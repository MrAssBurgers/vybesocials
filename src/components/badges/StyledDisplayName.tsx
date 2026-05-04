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

// Accept raw HSL parts ("330 100% 70%"), full CSS colors, or hex.
const normalizeCssColor = (value: string) => {
  const v = value.trim();
  if (
    v.startsWith('hsl(') || v.startsWith('hsla(') ||
    v.startsWith('rgb(') || v.startsWith('rgba(') ||
    v.startsWith('#') || v.startsWith('var(')
  ) return v;
  const raw = v.includes('/') ? v.split('/')[0].trim() : v;
  return `hsl(${raw})`;
};

/**
 * StyledDisplayName - Renders a user's display name with badge-based styling
 *
 * Uses a SINGLE element across loading & loaded states (no early-return swap)
 * to prevent React remounts and the visible flicker that comes with them.
 */
export const StyledDisplayName = memo(function StyledDisplayName({
  name,
  badge,
  className,
  as: Component = 'span',
}: StyledDisplayNameProps) {
  const hasGradient = !!(badge?.gradient_from && badge?.gradient_to);

  const gradient = useMemo(() => {
    if (!hasGradient) return null;
    const from = normalizeCssColor(badge!.gradient_from!);
    const to = normalizeCssColor(badge!.gradient_to!);
    const via = badge?.gradient_via ? normalizeCssColor(badge.gradient_via) : null;
    return via
      ? `linear-gradient(135deg, ${from}, ${via}, ${to})`
      : `linear-gradient(135deg, ${from}, ${to})`;
  }, [hasGradient, badge?.gradient_from, badge?.gradient_to, badge?.gradient_via]);

  const canUseGradientText = useMemo(() => {
    if (!gradient) return false;
    if (typeof window === 'undefined') return true;
    const supports = (window as any).CSS?.supports;
    if (typeof supports !== 'function') return true;
    return supports('background-image', gradient);
  }, [gradient]);

  const computedStyle: React.CSSProperties = useMemo(() => {
    if (gradient && canUseGradientText) {
      const style: React.CSSProperties = {
        backgroundImage: gradient,
        backgroundClip: 'text',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        color: 'transparent',
        backgroundColor: 'transparent',
        boxShadow: 'none',
        display: 'inline-block',
        contain: 'paint',
      };
      if (badge?.effect === 'shine') {
        style.textShadow = '0 1px 1px rgba(255,255,255,0.2)';
      }
      return style;
    }
    return { display: 'inline-block' };
  }, [gradient, canUseGradientText, badge?.effect]);

  return (
    <Component
      style={computedStyle}
      className={cn(hasGradient && 'font-bold', className)}
    >
      {name}
    </Component>
  );
});
