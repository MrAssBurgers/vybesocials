import { memo, useId, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { useVybeMarkColors } from '@/hooks/useVybeMarkColors';
import {
  VYBE_LOGO_GLOW_STROKE,
  VYBE_LOGO_JOINT,
  VYBE_LOGO_LEFT_PATH,
  VYBE_LOGO_RIGHT_PATH,
  VYBE_LOGO_STROKE,
  VYBE_LOGO_VIEWBOX,
} from '@/lib/vybeLogoGeometry';

export interface VybeLogoProps {
  /** Width & height in CSS pixels */
  size?: number;
  leftColor?: string;
  rightColor?: string;
  centerColor?: string;
  glowIntensity?: number;
  animated?: boolean;
  className?: string;
  title?: string;
}

function glowBlur(glowIntensity: number, size: number): number {
  const scale = size >= 160 ? 1 : size >= 80 ? 0.85 : size >= 40 ? 0.65 : 0.45;
  return Math.max(8, 22 * glowIntensity * scale);
}

function jointBlur(glowIntensity: number, size: number): number {
  const scale = size >= 160 ? 1 : size >= 80 ? 0.85 : size >= 40 ? 0.65 : 0.45;
  return Math.max(6, 14 * glowIntensity * scale);
}

/**
 * Fat capsule V — two thick rounded bars overlapping at a soft white joint bulb.
 * left = primary → purple, right = secondary → cyan.
 */
export const VybeLogo = memo(function VybeLogo({
  size = 48,
  leftColor,
  rightColor,
  centerColor,
  glowIntensity = 1,
  animated = false,
  className,
  title,
}: VybeLogoProps) {
  const theme = useVybeMarkColors();
  const rawId = useId().replace(/:/g, '');

  const colors = useMemo(
    () => ({
      left: leftColor ?? theme.primary,
      right: rightColor ?? theme.secondary,
      leftDeep: centerColor ?? theme.deepPrimary ?? theme.secondary,
      rightDeep: theme.accent ?? theme.deepAccent,
    }),
    [leftColor, rightColor, centerColor, theme],
  );

  const leftGrad = `${rawId}-lg`;
  const rightGrad = `${rawId}-rg`;
  const filterGlow = `${rawId}-glow`;
  const filterJoint = `${rawId}-joint`;

  const glowOpacity = 0.28 + glowIntensity * 0.17;
  const armBlur = glowBlur(glowIntensity, size);
  const bulbBlur = jointBlur(glowIntensity, size);

  const armProps = {
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  return (
    <svg
      viewBox={VYBE_LOGO_VIEWBOX}
      width={size}
      height={size}
      fill="none"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      data-themed-svg="true"
      className={cn(
        'vybe-logo-svg shrink-0 overflow-visible bg-transparent',
        animated && 'vybe-logo-svg--animated',
        className,
      )}
    >
      <defs>
        <linearGradient id={leftGrad} x1="70" y1="45" x2="120" y2="150" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={colors.left} />
          <stop offset="55%" stopColor={colors.left} />
          <stop offset="100%" stopColor={colors.leftDeep} />
        </linearGradient>
        <linearGradient id={rightGrad} x1="170" y1="45" x2="120" y2="150" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={colors.right} />
          <stop offset="50%" stopColor={colors.right} stopOpacity={0.95} />
          <stop offset="100%" stopColor={colors.rightDeep} />
        </linearGradient>
        <filter id={filterGlow} x="-80%" y="-80%" width="260%" height="260%" colorInterpolationFilters="sRGB">
          <feGaussianBlur stdDeviation={armBlur} />
        </filter>
        <filter id={filterJoint} x="-120%" y="-120%" width="340%" height="340%" colorInterpolationFilters="sRGB">
          <feGaussianBlur stdDeviation={bulbBlur} />
        </filter>
      </defs>

      {/* Soft outer glow — same paths, wider stroke */}
      <g opacity={glowOpacity} filter={`url(#${filterGlow})`}>
        <path
          d={VYBE_LOGO_LEFT_PATH}
          stroke={colors.left}
          strokeWidth={VYBE_LOGO_GLOW_STROKE}
          {...armProps}
          className={animated ? 'vybe-logo-svg__ambient vybe-logo-svg__ambient--left' : undefined}
        />
        <path
          d={VYBE_LOGO_RIGHT_PATH}
          stroke={colors.rightDeep}
          strokeWidth={VYBE_LOGO_GLOW_STROKE}
          {...armProps}
          className={animated ? 'vybe-logo-svg__ambient vybe-logo-svg__ambient--right' : undefined}
        />
      </g>

      {/* Left arm (under) */}
      <path
        d={VYBE_LOGO_LEFT_PATH}
        stroke={`url(#${leftGrad})`}
        strokeWidth={VYBE_LOGO_STROKE}
        {...armProps}
        className={animated ? 'vybe-logo-svg__stroke vybe-logo-svg__stroke--left' : undefined}
      />

      {/* Right arm (over) */}
      <path
        d={VYBE_LOGO_RIGHT_PATH}
        stroke={`url(#${rightGrad})`}
        strokeWidth={VYBE_LOGO_STROKE}
        {...armProps}
        className={animated ? 'vybe-logo-svg__stroke vybe-logo-svg__stroke--right' : undefined}
      />

      {/* Bottom joint bulb */}
      <circle
        cx={VYBE_LOGO_JOINT.cx}
        cy={VYBE_LOGO_JOINT.cy}
        r={VYBE_LOGO_JOINT.r}
        fill="#ffffff"
        fillOpacity={0.9}
        filter={`url(#${filterJoint})`}
        className={animated ? 'vybe-logo-svg__vertex' : undefined}
      />
    </svg>
  );
});

export default VybeLogo;
