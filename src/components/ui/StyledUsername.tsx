import { memo, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { useDisplayStyle } from '@/hooks/useDisplayStyle';
import { NAME_COLOR_MAP } from '@/lib/cosmeticConstants';

// Helper: allow stored values to be either raw HSL parts ("330 100% 70%"),
// full CSS colors ("hsl(...)"/"rgb(...)"), or hex ("#ff00ff").
const normalizeCssColor = (value: string) => {
  const v = value.trim();
  if (
    v.startsWith('hsl(') ||
    v.startsWith('hsla(') ||
    v.startsWith('rgb(') ||
    v.startsWith('rgba(') ||
    v.startsWith('#') ||
    v.startsWith('var(')
  ) {
    return v;
  }

  // If stored as raw HSL parts with an alpha ("... / 0.6"), force opaque for readability.
  const raw = v.includes('/') ? v.split('/')[0].trim() : v;
  return `hsl(${raw})`;
};
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
  /** Override color from equipped name_color cosmetic (takes priority over badge styling) */
  nameColorOverride?: string | null;
}

/**
 * StyledUsername - Universal component for rendering usernames with badge-based styling
 * 
 * Use this component EVERYWHERE a username needs to be displayed to ensure consistent
 * badge-based styling across the entire app.
 * 
 * On desktop: Uses CSS gradient for premium visual effect
 * On mobile/tablet: Falls back to solid color + drop-shadow (matches WelcomeHeader)
 */
export const StyledUsername = memo(function StyledUsername({
  userId,
  username,
  displayName,
  className,
  showAtSymbol = false,
  preferDisplayName = true,
  badgeStyle: preloadedStyle,
  nameColorOverride,
}: StyledUsernameProps) {
  // Generate unique ID early (before conditions)
  const elementId = useMemo(() => `styled-username-${Math.random().toString(36).slice(2, 9)}`, []);

  // Fetch badge style if not pre-loaded
  const { data: fetchedStyle } = useDisplayStyle(preloadedStyle !== undefined ? undefined : userId);
  
  const badge = preloadedStyle ?? fetchedStyle;

  // Resolve equipped name color: prop override > fetched equipped color
  const resolvedNameColor = useMemo(() => {
    if (nameColorOverride) return nameColorOverride;
    const equipped = fetchedStyle?.equippedNameColor;
    if (equipped) return NAME_COLOR_MAP[equipped] || null;
    return null;
  }, [nameColorOverride, fetchedStyle?.equippedNameColor]);

  const nameToShow = useMemo(() => {
    if (preferDisplayName && displayName) {
      return displayName;
    }
    return showAtSymbol ? `@${username}` : username;
  }, [preferDisplayName, displayName, showAtSymbol, username]);
  
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

  // CRITICAL: Only use transparent text-fill when the browser confirms the gradient is valid.
  // Otherwise, we'd end up with invisible/transparent text after badge style loads.
  const canUseGradientText = useMemo(() => {
    if (!gradient) return false;
    if (typeof window === 'undefined') return true;
    const supports = (window as any).CSS?.supports;
    if (typeof supports !== 'function') return true;
    return supports('background-image', gradient);
  }, [gradient]);

  // If equipped name color is set, it takes priority over badge styling
  if (resolvedNameColor) {
    const isGrad = resolvedNameColor.startsWith('linear');
    if (isGrad) {
      return (
        <span
          className={className}
          style={{
            backgroundImage: resolvedNameColor,
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            color: 'transparent',
            display: 'inline-block',
          }}
        >
          {nameToShow}
        </span>
      );
    }
    return (
      <span
        className={className}
        style={{ color: resolvedNameColor, textShadow: `0 0 10px ${resolvedNameColor}40` }}
      >
        {nameToShow}
      </span>
    );
  }

  // No badge styling OR unsupported/invalid gradient => render plain text (fully opaque)
  if (!gradient || !canUseGradientText) {
    return <span className={className}>{nameToShow}</span>;
  }

  // Base style for gradient text - MUST have all these properties to prevent background leakage
  const gradientStyle: React.CSSProperties = {
    backgroundImage: gradient,
    backgroundClip: 'text',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    color: 'transparent',
    // Ensure no box background shows through
    backgroundColor: 'transparent',
    boxShadow: 'none',
    // Prevent inheritance issues
    display: 'inline-block',
    padding: 0,
    margin: 0,
  };

  // Add text shadow for shine effect (no filter to avoid artifacts)
  if (badge?.effect === 'shine') {
    gradientStyle.textShadow = '0 1px 1px rgba(255,255,255,0.2)';
  }

  // Extract start color for mobile fallback
  const startColor = normalizeCssColor(badge!.gradient_from!);

  return (
    <>
      <style>{`
        @media (max-width: 1024px) {
          #${elementId} {
            color: ${startColor} !important;
            -webkit-text-fill-color: ${startColor} !important;
            background-clip: unset !important;
            -webkit-background-clip: unset !important;
            background-image: none !important;
            filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));
            opacity: 1 !important;
          }
        }
      `}</style>
      <span
        id={elementId}
        style={gradientStyle}
        className={cn(className)}
      >
        {nameToShow}
      </span>
    </>
  );
});

export default StyledUsername;
