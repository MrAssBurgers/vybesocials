import { memo, useId, useMemo } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useVybeMarkColors } from '@/hooks/useVybeMarkColors';
import {
  VYBE_LOGO_SVG_RAW,
  uniquifyVybeLogoSvg,
  vybeLogoThemeStyle,
} from '@/lib/vybeLogoAsset';
import './VybeLogo.css';

export interface VybeLogoProps {
  size?: number;
  leftColor?: string;
  rightColor?: string;
  /** Glow strength 0–1, or boolean to toggle. */
  glow?: number | boolean;
  /** @deprecated use `glow` */
  glowIntensity?: number;
  /** Maps to `--vybe-logo-accent` when set. */
  centerColor?: string;
  animated?: boolean;
  className?: string;
  title?: string;
}

function resolveGlow(glow: number | boolean | undefined, glowIntensity: number | undefined): number {
  if (typeof glow === 'boolean') return glow ? 1 : 0;
  if (typeof glow === 'number') return glow;
  if (typeof glowIntensity === 'number') return glowIntensity;
  return 1;
}

/**
 * Vybe mark — geometry from `assets/branding/vybe-logo.svg` only.
 * Themes CSS variables and animates glow / press scale. Never draws paths in React.
 */
export const VybeLogo = memo(function VybeLogo({
  size = 48,
  leftColor,
  rightColor,
  centerColor,
  glow,
  glowIntensity,
  animated = false,
  className,
  title,
}: VybeLogoProps) {
  const theme = useVybeMarkColors();
  const instanceId = useId().replace(/:/g, '');
  const glowLevel = resolveGlow(glow, glowIntensity);
  const glowOn = glowLevel > 0;

  const colors = useMemo(
    () => ({
      primary: leftColor ?? theme.primary,
      secondary: rightColor ?? theme.secondary,
      accent: centerColor ?? theme.accent,
      glow: theme.deepPrimary ?? theme.primary,
    }),
    [leftColor, rightColor, centerColor, theme],
  );

  const svgMarkup = useMemo(
    () => uniquifyVybeLogoSvg(VYBE_LOGO_SVG_RAW, instanceId),
    [instanceId],
  );

  const themeStyle = useMemo(
    () => ({
      width: size,
      height: size,
      ...vybeLogoThemeStyle(colors, glowLevel),
    }),
    [colors, glowLevel, size],
  );

  return (
    <motion.span
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      data-vybe-logo-asset="assets/branding/vybe-logo.svg"
      className={cn(
        'vybe-logo shrink-0 overflow-visible bg-transparent',
        glowOn && 'vybe-logo--glow',
        animated && glowOn && 'vybe-logo--animated',
        className,
      )}
      style={themeStyle}
      whileTap={animated ? { scale: 0.94 } : undefined}
      transition={{ type: 'spring', stiffness: 420, damping: 22 }}
    >
      <div
        className="vybe-logo__svg"
        dangerouslySetInnerHTML={{ __html: svgMarkup }}
      />
      {title ? <span className="sr-only">{title}</span> : null}
    </motion.span>
  );
});

export default VybeLogo;
