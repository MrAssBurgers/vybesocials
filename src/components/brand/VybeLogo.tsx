import { memo, useId, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { useVybeMarkColors } from '@/hooks/useVybeMarkColors';
import {
  VYBE_MARK_DEFAULTS,
  VYBE_MARK_GRADIENTS,
  VYBE_MARK_JOINT,
  VYBE_MARK_LEFT_ARM,
  VYBE_MARK_LEFT_SPECULAR,
  VYBE_MARK_OVERLAP,
  VYBE_MARK_RIGHT_ARM,
  VYBE_MARK_RIGHT_SPECULAR,
  VYBE_MARK_VIEWBOX,
} from '@/lib/vybeMarkPaths';

export interface VybeLogoProps {
  size?: number;
  leftColor?: string;
  rightColor?: string;
  centerColor?: string;
  glowIntensity?: number;
  animated?: boolean;
  className?: string;
  title?: string;
}

function scaledBlur(base: number, glowIntensity: number, size: number): number {
  const scale = size >= 160 ? 1 : size >= 80 ? 0.85 : size >= 40 ? 0.65 : 0.45;
  return Math.max(6, base * glowIntensity * scale);
}

/**
 * Vybe mark — Figma-export Bézier paths with theme-driven gradients & glow only.
 * Geometry lives in assets/brand/vybe-mark.svg / vybeMarkPaths.ts.
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
      leftDeep: centerColor ?? theme.deepPrimary ?? VYBE_MARK_DEFAULTS.leftDeep,
      rightDeep: theme.deepAccent ?? theme.accent ?? VYBE_MARK_DEFAULTS.rightDeep,
      overlap: theme.deepPrimary ?? VYBE_MARK_DEFAULTS.overlap,
    }),
    [leftColor, rightColor, centerColor, theme],
  );

  const ids = useMemo(
    () => ({
      leftLinear: `${rawId}-ll`,
      leftTube: `${rawId}-lt`,
      rightLinear: `${rawId}-rl`,
      rightTube: `${rawId}-rt`,
      leftSpec: `${rawId}-ls`,
      rightSpec: `${rawId}-rs`,
      overlap: `${rawId}-ov`,
      joint: `${rawId}-jn`,
      glowPink: `${rawId}-gp`,
      glowBlue: `${rawId}-gb`,
      bloom: `${rawId}-bl`,
    }),
    [rawId],
  );

  const pinkBlur = scaledBlur(28, glowIntensity, size);
  const blueBlur = scaledBlur(28, glowIntensity, size);
  const bloomBlur = scaledBlur(24, glowIntensity, size);
  const ambientOpacity = 0.32 + glowIntensity * 0.18;

  const { leftLinear, rightLinear } = VYBE_MARK_GRADIENTS;
  const joint = VYBE_MARK_JOINT;
  const overlap = VYBE_MARK_OVERLAP;

  return (
    <svg
      viewBox={VYBE_MARK_VIEWBOX}
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
        <linearGradient id={ids.leftLinear} x1={leftLinear.x1} y1={leftLinear.y1} x2={leftLinear.x2} y2={leftLinear.y2} gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={colors.left} />
          <stop offset="55%" stopColor={colors.left} />
          <stop offset="100%" stopColor={colors.leftDeep} />
        </linearGradient>
        <radialGradient id={ids.leftTube} cx="42%" cy="38%" r="58%" gradientUnits="objectBoundingBox">
          <stop offset="0%" stopColor="#ffffff" stopOpacity={0.38} />
          <stop offset="42%" stopColor="#ffffff" stopOpacity={0.08} />
          <stop offset="100%" stopColor="#000000" stopOpacity={0.42} />
        </radialGradient>

        <linearGradient id={ids.rightLinear} x1={rightLinear.x1} y1={rightLinear.y1} x2={rightLinear.x2} y2={rightLinear.y2} gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={colors.right} />
          <stop offset="50%" stopColor={colors.right} stopOpacity={0.96} />
          <stop offset="100%" stopColor={colors.rightDeep} />
        </linearGradient>
        <radialGradient id={ids.rightTube} cx="58%" cy="38%" r="58%" gradientUnits="objectBoundingBox">
          <stop offset="0%" stopColor="#ffffff" stopOpacity={0.34} />
          <stop offset="42%" stopColor="#ffffff" stopOpacity={0.06} />
          <stop offset="100%" stopColor="#000000" stopOpacity={0.4} />
        </radialGradient>

        <linearGradient id={ids.leftSpec} x1="130" y1="70" x2="250" y2="360" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffffff" stopOpacity={0.55} />
          <stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
        </linearGradient>
        <linearGradient id={ids.rightSpec} x1="382" y1="70" x2="262" y2="360" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffffff" stopOpacity={0.48} />
          <stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
        </linearGradient>

        <radialGradient id={ids.overlap} cx="50%" cy="50%" r="50%" gradientUnits="objectBoundingBox">
          <stop offset="0%" stopColor={colors.overlap} stopOpacity={0.55} />
          <stop offset="70%" stopColor={colors.overlap} stopOpacity={0.12} />
          <stop offset="100%" stopColor={colors.overlap} stopOpacity={0} />
        </radialGradient>

        <radialGradient id={ids.joint} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity={1} />
          <stop offset="35%" stopColor="#ffffff" stopOpacity={0.72} />
          <stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
        </radialGradient>

        <filter id={ids.glowPink} x="-90%" y="-90%" width="280%" height="280%" colorInterpolationFilters="sRGB">
          <feGaussianBlur stdDeviation={pinkBlur} />
        </filter>
        <filter id={ids.glowBlue} x="-90%" y="-90%" width="280%" height="280%" colorInterpolationFilters="sRGB">
          <feGaussianBlur stdDeviation={blueBlur} />
        </filter>
        <filter id={ids.bloom} x="-150%" y="-150%" width="400%" height="400%" colorInterpolationFilters="sRGB">
          <feGaussianBlur stdDeviation={bloomBlur} />
        </filter>
      </defs>

      {/* Ambient pink glow — left arm silhouette */}
      <path
        d={VYBE_MARK_LEFT_ARM}
        fill={colors.left}
        opacity={ambientOpacity}
        filter={`url(#${ids.glowPink})`}
        className={animated ? 'vybe-logo-svg__ambient vybe-logo-svg__ambient--left' : undefined}
      />

      {/* Ambient blue glow — right arm silhouette */}
      <path
        d={VYBE_MARK_RIGHT_ARM}
        fill={colors.rightDeep}
        opacity={ambientOpacity}
        filter={`url(#${ids.glowBlue})`}
        className={animated ? 'vybe-logo-svg__ambient vybe-logo-svg__ambient--right' : undefined}
      />

      {/* Left arm body (under) */}
      <g className={animated ? 'vybe-logo-svg__arm vybe-logo-svg__arm--left' : undefined}>
        <path d={VYBE_MARK_LEFT_ARM} fill={`url(#${ids.leftLinear})`} />
        <path d={VYBE_MARK_LEFT_ARM} fill={`url(#${ids.leftTube})`} style={{ mixBlendMode: 'soft-light' }} />
      </g>

      {/* Overlap color mix */}
      <ellipse
        cx={overlap.cx}
        cy={overlap.cy}
        rx={overlap.rx}
        ry={overlap.ry}
        fill={`url(#${ids.overlap})`}
        style={{ mixBlendMode: 'multiply' }}
      />

      {/* Right arm body (over) */}
      <g className={animated ? 'vybe-logo-svg__arm vybe-logo-svg__arm--right' : undefined}>
        <path d={VYBE_MARK_RIGHT_ARM} fill={`url(#${ids.rightLinear})`} />
        <path d={VYBE_MARK_RIGHT_ARM} fill={`url(#${ids.rightTube})`} style={{ mixBlendMode: 'soft-light' }} />
      </g>

      {/* Inner specular highlights */}
      <path d={VYBE_MARK_LEFT_SPECULAR} fill={`url(#${ids.leftSpec})`} opacity={0.42} />
      <path d={VYBE_MARK_RIGHT_SPECULAR} fill={`url(#${ids.rightSpec})`} opacity={0.36} />

      {/* Bottom joint bloom */}
      <circle
        cx={joint.cx}
        cy={joint.cy}
        r={joint.r}
        fill={`url(#${ids.joint})`}
        filter={`url(#${ids.bloom})`}
        opacity={0.96}
        className={animated ? 'vybe-logo-svg__vertex' : undefined}
      />
    </svg>
  );
});

export default VybeLogo;
