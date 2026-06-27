import {
  VYBE_LOGO_GLOW_STROKE,
  VYBE_LOGO_JOINT,
  VYBE_LOGO_LEFT_PATH,
  VYBE_LOGO_RIGHT_PATH,
  VYBE_LOGO_STROKE,
  VYBE_LOGO_VIEWBOX,
} from '@/lib/vybeLogoGeometry';

export interface VybeLogoSvgColors {
  leftColor: string;
  rightColor: string;
  leftDeep: string;
  rightDeep: string;
}

export interface BuildVybeLogoSvgOptions extends VybeLogoSvgColors {
  glowIntensity?: number;
  blurScale?: number;
  idPrefix?: string;
}

/** Static SVG markup — favicon, boot HTML. */
export function buildVybeLogoSvg({
  leftColor,
  rightColor,
  leftDeep,
  rightDeep,
  glowIntensity = 0.85,
  blurScale = 1,
  idPrefix = 'vybe',
}: BuildVybeLogoSvgOptions): string {
  const p = idPrefix;
  const armBlur = Math.max(8, 22 * glowIntensity * blurScale);
  const bulbBlur = Math.max(6, 14 * glowIntensity * blurScale);
  const glowOpacity = 0.28 + glowIntensity * 0.17;

  return `<svg viewBox="${VYBE_LOGO_VIEWBOX}" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="${p}-lg" x1="70" y1="45" x2="120" y2="150" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="${leftColor}"/>
      <stop offset="100%" stop-color="${leftDeep}"/>
    </linearGradient>
    <linearGradient id="${p}-rg" x1="170" y1="45" x2="120" y2="150" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="${rightColor}"/>
      <stop offset="100%" stop-color="${rightDeep}"/>
    </linearGradient>
    <filter id="${p}-glow" x="-80%" y="-80%" width="260%" height="260%">
      <feGaussianBlur stdDeviation="${armBlur}"/>
    </filter>
    <filter id="${p}-joint" x="-120%" y="-120%" width="340%" height="340%">
      <feGaussianBlur stdDeviation="${bulbBlur}"/>
    </filter>
  </defs>
  <g opacity="${glowOpacity}" filter="url(#${p}-glow)">
    <path d="${VYBE_LOGO_LEFT_PATH}" stroke="${leftColor}" stroke-width="${VYBE_LOGO_GLOW_STROKE}" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${VYBE_LOGO_RIGHT_PATH}" stroke="${rightDeep}" stroke-width="${VYBE_LOGO_GLOW_STROKE}" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
  <path d="${VYBE_LOGO_LEFT_PATH}" stroke="url(#${p}-lg)" stroke-width="${VYBE_LOGO_STROKE}" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="${VYBE_LOGO_RIGHT_PATH}" stroke="url(#${p}-rg)" stroke-width="${VYBE_LOGO_STROKE}" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="${VYBE_LOGO_JOINT.cx}" cy="${VYBE_LOGO_JOINT.cy}" r="${VYBE_LOGO_JOINT.r}" fill="#ffffff" fill-opacity="0.9" filter="url(#${p}-joint)"/>
</svg>`;
}
