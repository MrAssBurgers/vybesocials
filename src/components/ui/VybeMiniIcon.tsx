import { memo } from 'react';
import { cn } from '@/lib/utils';
import { VybeLogo } from '@/components/brand/VybeLogo';

interface VybeMiniIconProps {
  size?: number;
  className?: string;
  animated?: boolean;
  /** @deprecated sparkles removed — kept for API compat */
  showSparkles?: boolean;
  leftColor?: string;
  rightColor?: string;
  centerColor?: string;
  glowIntensity?: number;
}

/** Compact themed V mark for inline UI. */
export const VybeMiniIcon = memo(function VybeMiniIcon({
  size = 16,
  className,
  animated = true,
  leftColor,
  rightColor,
  centerColor,
  glowIntensity,
}: VybeMiniIconProps) {
  return (
    <VybeLogo
      size={size}
      animated={animated}
      leftColor={leftColor}
      rightColor={rightColor}
      centerColor={centerColor}
      glow={glowIntensity ?? (size >= 32 ? 0.88 : 0.65)}
      className={cn('inline-block', className)}
    />
  );
});

export default VybeMiniIcon;
