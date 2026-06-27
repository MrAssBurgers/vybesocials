import type { CSSProperties } from 'react';
import vybeLogoSvgRaw from '../../assets/branding/vybe-logo.svg?raw';

export const VYBE_LOGO_VIEWBOX = '0 0 512 512';
export const VYBE_LOGO_SVG_RAW = vybeLogoSvgRaw;

export interface VybeLogoThemeColors {
  left: string;
  leftDeep: string;
  right: string;
  rightDeep: string;
  overlap: string;
}

/** Prefix gradient/filter ids so multiple marks can coexist on one page. */
export function uniquifyVybeLogoSvg(markup: string, instanceId: string): string {
  return markup
    .replace(/\bid="vybe-/g, `id="${instanceId}-vybe-`)
    .replace(/url\(#vybe-/g, `url(#${instanceId}-vybe-`)
    .replace(/href="#vybe-/g, `href="#${instanceId}-vybe-`);
}

export function vybeLogoThemeStyle(colors: VybeLogoThemeColors, glow: number): CSSProperties {
  const glowOpacity = 0.28 + glow * 0.22;
  const glowBlur = Math.max(12, 26 * glow);
  const bloomBlur = Math.max(10, 22 * glow);

  return {
    '--vybe-logo-left': colors.left,
    '--vybe-logo-left-deep': colors.leftDeep,
    '--vybe-logo-right': colors.right,
    '--vybe-logo-right-deep': colors.rightDeep,
    '--vybe-logo-overlap': colors.overlap,
    '--vybe-logo-glow-opacity': String(glowOpacity),
    '--vybe-logo-glow-blur': String(glowBlur),
    '--vybe-logo-bloom-blur': String(bloomBlur),
  } as CSSProperties;
}

/** Themed SVG string for favicon / static boot (inline CSS variables on root svg). */
export function buildThemedVybeLogoSvg(colors: VybeLogoThemeColors, glow: number, instanceId = 'vybe'): string {
  const svg = uniquifyVybeLogoSvg(VYBE_LOGO_SVG_RAW, instanceId);
  const style = vybeLogoThemeStyle(colors, glow);
  const styleAttr = Object.entries(style)
    .map(([key, value]) => `${key}:${value}`)
    .join(';');

  return svg.replace('<svg ', `<svg style="${styleAttr}" `);
}
