import { memo, useId } from 'react';
import { cn } from '@/lib/utils';
import { useVybeMarkColors } from '@/hooks/useVybeMarkColors';
import {
  DEFAULT_VYBE_LOGO_STROKE,
  VYBE_LOGO_LEFT_PATH,
  VYBE_LOGO_RIGHT_PATH,
  VYBE_LOGO_VERTEX,
} from '@/lib/vybeLogoGeometry';

export interface VybeLogoMarkProps {
  className?: string;
  strokeWidth?: number;
  animated?: boolean;
  /** Extra outer glow on splash / loaders */
  glow?: boolean;
}

/**
 * Neon pill V — theme primary/accent/secondary gradients + bottom bloom.
 * Used by VYBELogo, loaders, splash, favicon generator.
 */
export const VybeLogoMark = memo(function VybeLogoMark({
  className,
  strokeWidth = DEFAULT_VYBE_LOGO_STROKE,
  animated = true,
  glow = false,
}: VybeLogoMarkProps) {
  const colors = useVybeMarkColors();
  const rawId = useId().replace(/:/g, '');
  const leftGrad = `${rawId}-left`;
  const rightGrad = `${rawId}-right`;
  const vertexGrad = `${rawId}-vertex`;
  const neonFilter = `${rawId}-neon`;

  const ambientW = strokeWidth + 10;

  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      data-themed-svg="true"
      className={cn('vybe-logo-mark', animated && 'vybe-logo-mark--animated', className)}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={leftGrad} x1="22" y1="8" x2="47" y2="92" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={colors.primary} />
          <stop offset="45%" stopColor={colors.primary} stopOpacity={0.98} />
          <stop offset="100%" stopColor={colors.secondary} />
        </linearGradient>
        <linearGradient id={rightGrad} x1="78" y1="8" x2="53" y2="92" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={colors.accent} />
          <stop offset="55%" stopColor={colors.accent} stopOpacity={0.92} />
          <stop offset="100%" stopColor={colors.secondary} stopOpacity={0.88} />
        </linearGradient>
        <radialGradient id={vertexGrad} cx={VYBE_LOGO_VERTEX.cx} cy={VYBE_LOGO_VERTEX.cy} r="18" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.98" />
          <stop offset="28%" stopColor={colors.primary} stopOpacity="0.55" />
          <stop offset="58%" stopColor={colors.accent} stopOpacity="0.35" />
          <stop offset="100%" stopColor="transparent" stopOpacity="0" />
        </radialGradient>
        <filter id={neonFilter} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {(glow || animated) && (
        <>
          <path
            d={VYBE_LOGO_LEFT_PATH}
            stroke={colors.primary}
            strokeWidth={ambientW}
            strokeLinecap="round"
            opacity={0.22}
            filter={`url(#${neonFilter})`}
            className={animated ? 'vybe-logo-ambient vybe-logo-ambient--left' : undefined}
          />
          <path
            d={VYBE_LOGO_RIGHT_PATH}
            stroke={colors.accent}
            strokeWidth={ambientW}
            strokeLinecap="round"
            opacity={0.22}
            filter={`url(#${neonFilter})`}
            className={animated ? 'vybe-logo-ambient vybe-logo-ambient--right' : undefined}
          />
        </>
      )}

      <path
        d={VYBE_LOGO_LEFT_PATH}
        stroke={`url(#${leftGrad})`}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        className={animated ? 'vybe-logo-path vybe-logo-path--left' : undefined}
      />
      <path
        d={VYBE_LOGO_RIGHT_PATH}
        stroke={`url(#${rightGrad})`}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        className={animated ? 'vybe-logo-path vybe-logo-path--right' : undefined}
      />

      <ellipse
        cx={VYBE_LOGO_VERTEX.cx}
        cy={VYBE_LOGO_VERTEX.cy}
        rx={VYBE_LOGO_VERTEX.rx}
        ry={VYBE_LOGO_VERTEX.ry}
        fill={`url(#${vertexGrad})`}
        className={animated ? 'vybe-logo-glow' : undefined}
      />
    </svg>
  );
});

export default VybeLogoMark;
