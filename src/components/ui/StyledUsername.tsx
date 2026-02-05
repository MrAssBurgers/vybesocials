import { memo, useMemo } from 'react';
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
 * 
 * IMPORTANT: Uses inline styles with explicit background-clip to prevent
 * any background color leakage (yellow rectangles, etc.)
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
  
  const hasGradient = badge?.gradient_from && badge?.gradient_to;

  // No badge styling - render plain text
  if (!hasGradient) {
    return <span className={className}>{nameToShow}</span>;
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
    // Prevent inheritance issues
    display: 'inline',
    padding: 0,
    margin: 0,
  };

  // Add text shadow for shine effect (no filter to avoid artifacts)
  if (badge?.effect === 'shine') {
    gradientStyle.textShadow = '0 1px 1px rgba(255,255,255,0.2)';
  }

  return (
    <span 
      style={gradientStyle} 
      className={cn(className)}
    >
      {nameToShow}
    </span>
  );
});

export default StyledUsername;
