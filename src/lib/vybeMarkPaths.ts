/**
 * Canonical Vybe mark geometry — synced from assets/brand/vybe-mark.svg (Figma export).
 * App code only themes gradients, glow, and opacity. Never rebuild geometry here.
 */
export const VYBE_MARK_VIEWBOX = '0 0 512 512';

/** Left capsule arm (~92px diameter Bézier outline) */
export const VYBE_MARK_LEFT_ARM =
  'M 62.40 84.20 L 192.40 388.20 A 46 46 0 0 1 278.60 351.80 L 148.60 47.80 A 46 46 0 0 1 62.40 84.20 Z';

/** Right capsule arm — renders above left */
export const VYBE_MARK_RIGHT_ARM =
  'M 364.40 47.80 L 234.40 351.80 A 46 46 0 0 1 320.60 388.20 L 450.60 84.20 A 46 46 0 0 1 364.40 47.80 Z';

/** Inner-edge specular highlight strips */
export const VYBE_MARK_LEFT_SPECULAR =
  'M 112.80 63.40 L 242.80 367.40 A 10.12 10.12 0 0 1 261.41 359.44 L 131.41 55.44 A 10.12 10.12 0 0 1 112.80 63.40 Z';

export const VYBE_MARK_RIGHT_SPECULAR =
  'M 382.53 56.23 L 252.53 360.23 A 10.12 10.12 0 0 1 271.14 368.19 L 401.14 64.19 A 10.12 10.12 0 0 1 382.53 56.23 Z';

/** Bottom joint bloom anchor */
export const VYBE_MARK_JOINT = { cx: 256, cy: 372, r: 38 } as const;

/** Purple overlap mix where right arm crosses left */
export const VYBE_MARK_OVERLAP = { cx: 272, cy: 338, rx: 52, ry: 44 } as const;

/** Gradient anchor points (userSpaceOnUse) */
export const VYBE_MARK_GRADIENTS = {
  leftLinear: { x1: 105, y1: 64, x2: 248, y2: 378 },
  rightLinear: { x1: 407, y1: 64, x2: 264, y2: 378 },
} as const;

export const VYBE_MARK_DEFAULTS = {
  left: '#f80a7c',
  leftDeep: '#9333ea',
  right: '#2563eb',
  rightDeep: '#06c0fb',
  overlap: '#6d28d9',
} as const;
