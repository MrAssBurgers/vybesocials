import {
  VYBE_MARK_GRADIENTS,
  VYBE_MARK_JOINT,
  VYBE_MARK_LEFT_ARM,
  VYBE_MARK_LEFT_SPECULAR,
  VYBE_MARK_OVERLAP,
  VYBE_MARK_RIGHT_ARM,
  VYBE_MARK_RIGHT_SPECULAR,
  VYBE_MARK_VIEWBOX,
} from '@/lib/vybeMarkPaths';

export interface VybeLogoSvgColors {
  leftColor: string;
  rightColor: string;
  leftDeep: string;
  rightDeep: string;
  overlapColor?: string;
}

export interface BuildVybeLogoSvgOptions extends VybeLogoSvgColors {
  glowIntensity?: number;
  blurScale?: number;
  idPrefix?: string;
}

/** Static SVG — favicon & boot HTML. Paths from vybe-mark.svg; colors only. */
export function buildVybeLogoSvg({
  leftColor,
  rightColor,
  leftDeep,
  rightDeep,
  overlapColor = '#6d28d9',
  glowIntensity = 0.85,
  blurScale = 1,
  idPrefix = 'vybe',
}: BuildVybeLogoSvgOptions): string {
  const p = idPrefix;
  const pinkBlur = Math.max(10, 28 * glowIntensity * blurScale);
  const blueBlur = Math.max(10, 28 * glowIntensity * blurScale);
  const bloomBlur = Math.max(8, 24 * glowIntensity * blurScale);
  const ambient = 0.32 + glowIntensity * 0.18;
  const { leftLinear, rightLinear } = VYBE_MARK_GRADIENTS;
  const joint = VYBE_MARK_JOINT;
  const overlap = VYBE_MARK_OVERLAP;

  return `<svg viewBox="${VYBE_MARK_VIEWBOX}" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="${p}-ll" x1="${leftLinear.x1}" y1="${leftLinear.y1}" x2="${leftLinear.x2}" y2="${leftLinear.y2}" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="${leftColor}"/><stop offset="100%" stop-color="${leftDeep}"/>
    </linearGradient>
    <radialGradient id="${p}-lt" cx="42%" cy="38%" r="58%"><stop offset="0%" stop-color="#fff" stop-opacity="0.35"/><stop offset="100%" stop-color="#000" stop-opacity="0.4"/></radialGradient>
    <linearGradient id="${p}-rl" x1="${rightLinear.x1}" y1="${rightLinear.y1}" x2="${rightLinear.x2}" y2="${rightLinear.y2}" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="${rightColor}"/><stop offset="100%" stop-color="${rightDeep}"/>
    </linearGradient>
    <radialGradient id="${p}-rt" cx="58%" cy="38%" r="58%"><stop offset="0%" stop-color="#fff" stop-opacity="0.32"/><stop offset="100%" stop-color="#000" stop-opacity="0.38"/></radialGradient>
    <linearGradient id="${p}-ls" x1="130" y1="70" x2="250" y2="360" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#fff" stop-opacity="0.5"/><stop offset="100%" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <linearGradient id="${p}-rs" x1="382" y1="70" x2="262" y2="360" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#fff" stop-opacity="0.45"/><stop offset="100%" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <radialGradient id="${p}-ov" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="${overlapColor}" stop-opacity="0.5"/><stop offset="100%" stop-color="${overlapColor}" stop-opacity="0"/></radialGradient>
    <radialGradient id="${p}-jn" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#fff"/><stop offset="100%" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <filter id="${p}-gp"><feGaussianBlur stdDeviation="${pinkBlur}"/></filter>
    <filter id="${p}-gb"><feGaussianBlur stdDeviation="${blueBlur}"/></filter>
    <filter id="${p}-bl"><feGaussianBlur stdDeviation="${bloomBlur}"/></filter>
  </defs>
  <path d="${VYBE_MARK_LEFT_ARM}" fill="${leftColor}" opacity="${ambient}" filter="url(#${p}-gp)"/>
  <path d="${VYBE_MARK_RIGHT_ARM}" fill="${rightDeep}" opacity="${ambient}" filter="url(#${p}-gb)"/>
  <path d="${VYBE_MARK_LEFT_ARM}" fill="url(#${p}-ll)"/><path d="${VYBE_MARK_LEFT_ARM}" fill="url(#${p}-lt)" style="mix-blend-mode:soft-light"/>
  <ellipse cx="${overlap.cx}" cy="${overlap.cy}" rx="${overlap.rx}" ry="${overlap.ry}" fill="url(#${p}-ov)" style="mix-blend-mode:multiply"/>
  <path d="${VYBE_MARK_RIGHT_ARM}" fill="url(#${p}-rl)"/><path d="${VYBE_MARK_RIGHT_ARM}" fill="url(#${p}-rt)" style="mix-blend-mode:soft-light"/>
  <path d="${VYBE_MARK_LEFT_SPECULAR}" fill="url(#${p}-ls)" opacity="0.4"/>
  <path d="${VYBE_MARK_RIGHT_SPECULAR}" fill="url(#${p}-rs)" opacity="0.34"/>
  <circle cx="${joint.cx}" cy="${joint.cy}" r="${joint.r}" fill="url(#${p}-jn)" filter="url(#${p}-bl)" opacity="0.95"/>
</svg>`;
}
