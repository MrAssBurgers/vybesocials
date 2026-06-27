import { memo, useId, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { useVybeMarkColors } from '@/hooks/useVybeMarkColors';
import {
  VYBE_LOGO_GLOW_OPACITY,
  VYBE_LOGO_JOINT,
  VYBE_LOGO_JOINT_OPACITY,
  VYBE_LOGO_LEFT_ARM,
  VYBE_LOGO_RIGHT_ARM,
  VYBE_LOGO_VIEWBOX,
  vybeLogoArmTransform,
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
  return Math.max(12, 26 * glowIntensity * scale);
}

function jointBlur(glowIntensity: number, size: number): number {
  const scale = size >= 160 ? 1 : size >= 80 ? 0.85 : size >= 40 ? 0.65 : 0.45;
  return Math.max(10, 22 * glowIntensity * scale);
}

function PillRect({
  arm,
  fill,
  className,
}: {
  arm: typeof VYBE_LOGO_LEFT_ARM;
  fill: string;
  className?: string;
}) {
  return (
    <rect
      x={arm.x}
      y={arm.y}
      width={arm.width}
      height={arm.height}
      rx={arm.rx}
      transform={vybeLogoArmTransform(arm)}
      fill={fill}
      className={className}
    />
  );
}

/**
 * Fat pill V — two thick rotated rounded rectangles overlapping at a soft white joint.
 * left = pink → purple, right = blue → cyan.
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
      rightDeep: theme.deepAccent ?? theme.accent,
    }),
    [leftColor, rightColor, centerColor, theme],
  );

  const leftGrad = `${rawId}-lg`;
  const rightGrad = `${rawId}-rg`;
  const filterGlow = `${rawId}-glow`;
  const filterJoint = `${rawId}-joint`;

  const glowOpacity = VYBE_LOGO_GLOW_OPACITY * (0.75 + glowIntensity * 0.25);
  const armBlur = glowBlur(glowIntensity, size);
  const bulbBlur = jointBlur(glowIntensity, size);

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
        <linearGradient id={leftGrad} x1="162" y1="76" x2="256" y2="346" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={colors.left} />
          <stop offset="100%" stopColor={colors.leftDeep} />
        </linearGradient>
        <linearGradient id={rightGrad} x1="350" y1="76" x2="256" y2="346" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={colors.right} />
          <stop offset="100%" stopColor={colors.rightDeep} />
        </linearGradient>
        <filter id={filterGlow} x="-80%" y="-80%" width="260%" height="260%" colorInterpolationFilters="sRGB">
          <feGaussianBlur stdDeviation={armBlur} />
        </filter>
        <filter id={filterJoint} x="-120%" y="-120%" width="340%" height="340%" colorInterpolationFilters="sRGB">
          <feGaussianBlur stdDeviation={bulbBlur} />
        </filter>
      </defs>

      {/* Soft outer glow — same pills, blurred */}
      <g opacity={glowOpacity} filter={`url(#${filterGlow})`}>
        <PillRect
          arm={VYBE_LOGO_LEFT_ARM}
          fill={colors.left}
          className={animated ? 'vybe-logo-svg__ambient vybe-logo-svg__ambient--left' : undefined}
        />
        <PillRect
          arm={VYBE_LOGO_RIGHT_ARM}
          fill={colors.rightDeep}
          className={animated ? 'vybe-logo-svg__ambient vybe-logo-svg__ambient--right' : undefined}
        />
      </g>

      {/* Left arm (under) */}
      <PillRect
        arm={VYBE_LOGO_LEFT_ARM}
        fill={`url(#${leftGrad})`}
        className={animated ? 'vybe-logo-svg__arm vybe-logo-svg__arm--left' : undefined}
      />

      {/* Right arm (over) */}
      <PillRect
        arm={VYBE_LOGO_RIGHT_ARM}
        fill={`url(#${rightGrad})`}
        className={animated ? 'vybe-logo-svg__arm vybe-logo-svg__arm--right' : undefined}
      />

      {/* Bottom joint bulb */}
      <circle
        cx={VYBE_LOGO_JOINT.cx}
        cy={VYBE_LOGO_JOINT.cy}
        r={VYBE_LOGO_JOINT.r}
        fill="#ffffff"
        fillOpacity={VYBE_LOGO_JOINT_OPACITY}
        filter={`url(#${filterJoint})`}
        className={animated ? 'vybe-logo-svg__vertex' : undefined}
      />
    </svg>
  );
});

export default VybeLogo;
