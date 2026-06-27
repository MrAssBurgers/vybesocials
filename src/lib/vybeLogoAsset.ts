import type { CSSProperties } from 'react';
import vybeLogoSvgRaw from '../../assets/branding/vybe-logo.svg?raw';

export const VYBE_LOGO_VIEWBOX = '0 0 512 512';
export const VYBE_LOGO_SVG_RAW = vybeLogoSvgRaw;

export interface VybeLogoThemeColors {
  primary: string;
  secondary: string;
  accent: string;
  glow: string;
}

/** Prefix all SVG ids so multiple marks can coexist on one page. */
export function uniquifyVybeLogoSvg(markup: string, instanceId: string): string {
  const ids = [...markup.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  let result = markup;
  for (const id of ids) {
    const prefixed = `${instanceId}-${id}`;
    result = result.replace(new RegExp(`\\bid="${id}"`, 'g'), `id="${prefixed}"`);
    result = result.replace(new RegExp(`url\\(#${id}\\)`, 'g'), `url(#${prefixed})`);
    result = result.replace(new RegExp(`href="#${id}"`, 'g'), `href="#${prefixed}"`);
  }
  return result;
}

export function vybeLogoThemeStyle(colors: VybeLogoThemeColors, glowStrength = 1): CSSProperties {
  return {
    '--vybe-logo-primary': colors.primary,
    '--vybe-logo-secondary': colors.secondary,
    '--vybe-logo-accent': colors.accent,
    '--vybe-logo-glow': colors.glow,
    '--vybe-logo-glow-strength': String(Math.max(0, Math.min(1, glowStrength))),
  } as CSSProperties;
}

/** Themed SVG for favicon (geometry from asset; colors via CSS variables on root). */
export function buildThemedVybeLogoSvg(colors: VybeLogoThemeColors, glowStrength = 1, instanceId = 'fav'): string {
  const svg = uniquifyVybeLogoSvg(VYBE_LOGO_SVG_RAW, instanceId);
  const style = vybeLogoThemeStyle(colors, glowStrength);
  const styleAttr = Object.entries(style)
    .map(([key, value]) => `${key}:${value}`)
    .join(';');
  return svg.replace('<svg ', `<svg style="${styleAttr}" `);
}
