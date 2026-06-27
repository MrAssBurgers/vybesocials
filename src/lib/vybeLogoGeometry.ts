/** Fat pill V — 512×512 viewBox (rounded rects, not strokes). */
export const VYBE_LOGO_VIEWBOX = '0 0 512 512';

export interface VybeLogoArmRect {
  x: number;
  y: number;
  width: number;
  height: number;
  rx: number;
  rotate: number;
  pivotX: number;
  pivotY: number;
}

export const VYBE_LOGO_LEFT_ARM: VybeLogoArmRect = {
  x: 116,
  y: 76,
  width: 92,
  height: 340,
  rx: 46,
  rotate: -28,
  pivotX: 162,
  pivotY: 246,
};

export const VYBE_LOGO_RIGHT_ARM: VybeLogoArmRect = {
  x: 304,
  y: 76,
  width: 92,
  height: 340,
  rx: 46,
  rotate: 28,
  pivotX: 350,
  pivotY: 246,
};

/** Bottom joint — white core bulb */
export const VYBE_LOGO_JOINT = { cx: 256, cy: 346, r: 34 };

export const VYBE_LOGO_GLOW_BLUR = 26;
export const VYBE_LOGO_JOINT_BLUR = 22;
export const VYBE_LOGO_GLOW_OPACITY = 0.45;
export const VYBE_LOGO_JOINT_OPACITY = 0.95;

export function vybeLogoArmTransform(arm: VybeLogoArmRect): string {
  return `rotate(${arm.rotate} ${arm.pivotX} ${arm.pivotY})`;
}

export const VYBE_LOGO_DEFAULTS = {
  left: '#f80a7c',
  leftDeep: '#9333ea',
  right: '#2563eb',
  rightDeep: '#06c0fb',
} as const;
