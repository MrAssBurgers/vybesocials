/** Fat capsule V — 240×240 viewBox (reference geometry). */
export const VYBE_LOGO_VIEWBOX = '0 0 240 240';

export const VYBE_LOGO_LEFT_PATH = 'M 70 45 L 120 150';
export const VYBE_LOGO_RIGHT_PATH = 'M 170 45 L 120 150';

/** Bottom joint — rounded bulb center */
export const VYBE_LOGO_JOINT = { cx: 120, cy: 150, r: 22 };

/** Core capsule stroke width (viewBox units) */
export const VYBE_LOGO_STROKE = 64;

/** Soft glow halo stroke */
export const VYBE_LOGO_GLOW_STROKE = 72;

/** Approximate path length for draw animation */
export const VYBE_LOGO_PATH_LENGTH = 116;

export const VYBE_LOGO_DEFAULTS = {
  left: '#f80a7c',
  leftDeep: '#9333ea',
  right: '#a855f7',
  rightDeep: '#06c0fb',
} as const;
