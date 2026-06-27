import { memo, useId, useMemo } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useVybeMarkColors } from '@/hooks/useVybeMarkColors';
import {
  uniquifyVybeLogoSvg,
  vybeLogoThemeStyle,
  VYBE_LOGO_SVG_RAW,
  VYBE_LOGO_VIEWBOX,
} from '@/lib/vybeLogoAsset';

export interface VybeLogoProps {
  size?: number;
  leftColor?: string;
  rightColor?: string;
  /** Glow intensity 0–1 (ambient opacity + blur). */
  glow?: number;
  /** @deprecated use `glow` */
  glowIntensity?: number;
  animated?: boolean;
  className?: string;
  title?: string;
}

/**
 * Vybe mark — loads geometry from `assets/branding/vybe-logo.svg` only.
 * Themes gradient CSS variables and animates glow / press scale. Never draws paths in code.
 *
 * Web: inline SVG + CSS variables (same workflow as react-native-svg + asset on native).
 */
export const VybeLogo = memo(function VybeLogo({
  size = 48,
  leftColor,
  rightColor,
  glow,
  glowIntensity,
  animated = false,
  className,
  title,
}: VybeLogoProps) {
  const theme = useVybeMarkColors();
  const instanceId = useId().replace(/:/g, '');
  const glowLevel = glow ?? glowIntensity ?? 1;

  const colors = useMemo(
    () => ({
      left: leftColor ?? theme.primary,
      right: rightColor ?? theme.secondary,
      leftDeep: theme.deepPrimary ?? theme.secondary,
      rightDeep: theme.deepAccent ?? theme.accent,
      overlap: theme.deepPrimary ?? theme.secondary,
    }),
    [leftColor, rightColor, theme],
  );

  const svgMarkup = useMemo(
    () => uniquifyVybeLogoSvg(VYBE_LOGO_SVG_RAW, instanceId),
    [instanceId],
  );

  const themeStyle = useMemo(
    () => vybeLogoThemeStyle(colors, glowLevel),
    [colors, glowLevel],
  );

  return (
    <motion.div
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      data-themed-svg="true"
      data-vybe-logo-asset="assets/branding/vybe-logo.svg"
      className={cn(
        'vybe-logo-root shrink-0 overflow-visible bg-transparent',
        animated && 'vybe-logo-root--animated',
        className,
      )}
      style={{ width: size, height: size, ...themeStyle }}
      whileTap={animated ? { scale: 0.94 } : undefined}
      transition={{ type: 'spring', stiffness: 420, damping: 22 }}
    >
      <div
        className="vybe-logo-root__svg h-full w-full [&>svg]:h-full [&>svg]:w-full"
        dangerouslySetInnerHTML={{ __html: svgMarkup }}
      />
      {title ? <span className="sr-only">{title}</span> : null}
    </motion.div>
  );
});

export { VYBE_LOGO_VIEWBOX };
export default VybeLogo;
