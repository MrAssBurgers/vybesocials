import { memo, useId } from 'react';
import { cn } from '@/lib/utils';
import { useVybeMarkColors } from '@/hooks/useVybeMarkColors';
import {
  VYBE_LOGO_LEFT_PATH,
  VYBE_LOGO_RIGHT_PATH,
  VYBE_LOGO_VERTEX,
} from '@/lib/vybeLogoGeometry';

interface VybeMiniIconProps {
  size?: number;
  className?: string;
  animated?: boolean;
  showSparkles?: boolean;
}

/** Compact themed V mark for inline UI (settings, labels). */
export const VybeMiniIcon = memo(function VybeMiniIcon({
  size = 16,
  className,
  animated = true,
  showSparkles = false,
}: VybeMiniIconProps) {
  const colors = useVybeMarkColors();
  const rawId = useId().replace(/:/g, '');
  const stroke = Math.max(10, size * 0.72);

  return (
    <div
      className={cn('relative inline-flex items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 100 100" fill="none" data-themed-svg="true" style={{ width: size, height: size }}>
        <defs>
          <linearGradient id={`${rawId}-l`} x1="22" y1="8" x2="47" y2="92" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={colors.primary} />
            <stop offset="100%" stopColor={colors.secondary} />
          </linearGradient>
          <linearGradient id={`${rawId}-r`} x1="78" y1="8" x2="53" y2="92" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={colors.accent} />
            <stop offset="100%" stopColor={colors.secondary} stopOpacity={0.9} />
          </linearGradient>
          <radialGradient id={`${rawId}-v`} cx={VYBE_LOGO_VERTEX.cx} cy={VYBE_LOGO_VERTEX.cy} r="16" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
            <stop offset="100%" stopColor="transparent" stopOpacity="0" />
          </radialGradient>
        </defs>
        <path
          d={VYBE_LOGO_LEFT_PATH}
          stroke={`url(#${rawId}-l)`}
          strokeWidth={stroke}
          strokeLinecap="round"
          className={animated ? 'vybe-logo-path vybe-logo-path--left' : undefined}
        />
        <path
          d={VYBE_LOGO_RIGHT_PATH}
          stroke={`url(#${rawId}-r)`}
          strokeWidth={stroke}
          strokeLinecap="round"
          className={animated ? 'vybe-logo-path vybe-logo-path--right' : undefined}
        />
        <ellipse
          cx={VYBE_LOGO_VERTEX.cx}
          cy={VYBE_LOGO_VERTEX.cy}
          rx={VYBE_LOGO_VERTEX.rx * 0.85}
          ry={VYBE_LOGO_VERTEX.ry * 0.85}
          fill={`url(#${rawId}-v)`}
          className={animated ? 'vybe-logo-glow' : undefined}
        />
        {showSparkles && animated && (
          <>
            <circle cx="88" cy="14" r="2.5" fill={colors.accent} className="vybe-logo-sparkle" style={{ animationDelay: '0s' }} />
            <circle cx="12" cy="14" r="2" fill={colors.primary} className="vybe-logo-sparkle" style={{ animationDelay: '0.6s' }} />
          </>
        )}
      </svg>
    </div>
  );
});

export default VybeMiniIcon;
