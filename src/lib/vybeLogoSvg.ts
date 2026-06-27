import {
  VYBE_LOGO_GLOW_OPACITY,
  VYBE_LOGO_JOINT,
  VYBE_LOGO_JOINT_OPACITY,
  VYBE_LOGO_LEFT_ARM,
  VYBE_LOGO_RIGHT_ARM,
  VYBE_LOGO_VIEWBOX,
  vybeLogoArmTransform,
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

function pillRectMarkup(
  arm: typeof VYBE_LOGO_LEFT_ARM,
  fill: string,
): string {
  return `<rect x="${arm.x}" y="${arm.y}" width="${arm.width}" height="${arm.height}" rx="${arm.rx}" transform="${vybeLogoArmTransform(arm)}" fill="${fill}"/>`;
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
  const armBlur = Math.max(12, 26 * glowIntensity * blurScale);
  const bulbBlur = Math.max(10, 22 * glowIntensity * blurScale);
  const glowOpacity = VYBE_LOGO_GLOW_OPACITY * (0.75 + glowIntensity * 0.25);

  return `<svg viewBox="${VYBE_LOGO_VIEWBOX}" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="${p}-lg" x1="162" y1="76" x2="256" y2="346" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="${leftColor}"/>
      <stop offset="100%" stop-color="${leftDeep}"/>
    </linearGradient>
    <linearGradient id="${p}-rg" x1="350" y1="76" x2="256" y2="346" gradientUnits="userSpaceOnUse">
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
    ${pillRectMarkup(VYBE_LOGO_LEFT_ARM, leftColor)}
    ${pillRectMarkup(VYBE_LOGO_RIGHT_ARM, rightDeep)}
  </g>
  ${pillRectMarkup(VYBE_LOGO_LEFT_ARM, `url(#${p}-lg)`)}
  ${pillRectMarkup(VYBE_LOGO_RIGHT_ARM, `url(#${p}-rg)`)}
  <circle cx="${VYBE_LOGO_JOINT.cx}" cy="${VYBE_LOGO_JOINT.cy}" r="${VYBE_LOGO_JOINT.r}" fill="#ffffff" fill-opacity="${VYBE_LOGO_JOINT_OPACITY}" filter="url(#${p}-joint)"/>
</svg>`;
}
