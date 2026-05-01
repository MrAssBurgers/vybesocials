/**
 * Contrast Auto-Guard utilities
 * Pure functions: parse colors, compute WCAG contrast, find effective background.
 */

export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

const TRANSPARENT: RGBA = { r: 0, g: 0, b: 0, a: 0 };

/** Parse a CSS color string (rgb/rgba/hsl/hsla/hex) into linear RGBA 0-255. */
export function parseColor(input: string | null | undefined): RGBA | null {
  if (!input) return null;
  const s = input.trim().toLowerCase();
  if (!s || s === 'transparent' || s === 'none') return TRANSPARENT;

  // rgb / rgba — getComputedStyle always returns this form in practice
  const rgbMatch = s.match(
    /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.%]+))?\s*\)$/,
  );
  if (rgbMatch) {
    const r = clamp255(parseFloat(rgbMatch[1]));
    const g = clamp255(parseFloat(rgbMatch[2]));
    const b = clamp255(parseFloat(rgbMatch[3]));
    let a = 1;
    if (rgbMatch[4] != null) {
      a = rgbMatch[4].endsWith('%')
        ? parseFloat(rgbMatch[4]) / 100
        : parseFloat(rgbMatch[4]);
    }
    return { r, g, b, a: clamp01(a) };
  }

  // hsl / hsla
  const hslMatch = s.match(
    /^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%(?:[\s,/]+([\d.%]+))?\s*\)$/,
  );
  if (hslMatch) {
    const h = parseFloat(hslMatch[1]);
    const sat = parseFloat(hslMatch[2]) / 100;
    const l = parseFloat(hslMatch[3]) / 100;
    let a = 1;
    if (hslMatch[4] != null) {
      a = hslMatch[4].endsWith('%')
        ? parseFloat(hslMatch[4]) / 100
        : parseFloat(hslMatch[4]);
    }
    const { r, g, b } = hslToRgb(h, sat, l);
    return { r, g, b, a: clamp01(a) };
  }

  // hex (#rgb / #rgba / #rrggbb / #rrggbbaa)
  if (s.startsWith('#')) {
    const hex = s.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      const a = hex.length === 4 ? parseInt(hex[3] + hex[3], 16) / 255 : 1;
      return { r, g, b, a };
    }
    if (hex.length === 6 || hex.length === 8) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
      return { r, g, b, a };
    }
  }

  return null;
}

function clamp255(n: number) {
  return Math.max(0, Math.min(255, Math.round(n)));
}
function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function hslToRgb(h: number, s: number, l: number) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r1 = 0,
    g1 = 0,
    b1 = 0;
  if (h < 60) {
    r1 = c;
    g1 = x;
  } else if (h < 120) {
    r1 = x;
    g1 = c;
  } else if (h < 180) {
    g1 = c;
    b1 = x;
  } else if (h < 240) {
    g1 = x;
    b1 = c;
  } else if (h < 300) {
    r1 = x;
    b1 = c;
  } else {
    r1 = c;
    b1 = x;
  }
  return {
    r: clamp255((r1 + m) * 255),
    g: clamp255((g1 + m) * 255),
    b: clamp255((b1 + m) * 255),
  };
}

/** Alpha-composite `over` on top of `under`. Both 0-255 channels. */
export function composite(over: RGBA, under: RGBA): RGBA {
  const a = over.a + under.a * (1 - over.a);
  if (a <= 0) return TRANSPARENT;
  const r = (over.r * over.a + under.r * under.a * (1 - over.a)) / a;
  const g = (over.g * over.a + under.g * under.a * (1 - over.a)) / a;
  const b = (over.b * over.a + under.b * under.a * (1 - over.a)) / a;
  return { r: clamp255(r), g: clamp255(g), b: clamp255(b), a: clamp01(a) };
}

/** WCAG relative luminance from 0-255 sRGB channels. */
export function relativeLuminance({ r, g, b }: RGBA): number {
  const toLinear = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

export function contrastRatio(fg: RGBA, bg: RGBA): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Walk up ancestors compositing semi-transparent backgrounds until a fully
 * opaque color is found. Falls back to the body background, then white.
 */
export function getEffectiveBg(el: Element | null): RGBA {
  let result: RGBA = TRANSPARENT;
  let node: Element | null = el;
  // Hard limit to keep this cheap on deep DOMs
  let safety = 25;
  while (node && safety-- > 0) {
    const cs = window.getComputedStyle(node);
    const bgColor = parseColor(cs.backgroundColor);
    // Treat backdrop-filter / filter as making background effectively opaque-ish:
    // we still need to look upward, but the blurred surface usually contributes
    // ~70% of itself. Approximate by boosting alpha.
    if (bgColor && bgColor.a > 0) {
      const bf = cs.backdropFilter || (cs as any).webkitBackdropFilter || '';
      const boosted =
        bf && bf !== 'none' && bgColor.a < 0.95
          ? { ...bgColor, a: Math.min(1, bgColor.a + 0.25) }
          : bgColor;
      // result is stacked ON TOP of boosted (we're walking outward),
      // so existing result is `over`, ancestor is `under`.
      result = composite(result, boosted);
      if (result.a >= 0.99) return { ...result, a: 1 };
    }
    node = node.parentElement;
  }
  // Body / html fallback
  const bodyBg =
    parseColor(window.getComputedStyle(document.body).backgroundColor) ||
    parseColor(window.getComputedStyle(document.documentElement).backgroundColor);
  if (bodyBg && bodyBg.a > 0) {
    result = composite(result, { ...bodyBg, a: 1 });
  }
  if (result.a < 0.99) {
    // Final canvas fallback: assume white in light mode, near-black in dark.
    const isDark = !document.documentElement.classList.contains('light');
    const canvas: RGBA = isDark
      ? { r: 10, g: 10, b: 12, a: 1 }
      : { r: 255, g: 255, b: 255, a: 1 };
    result = composite(result, canvas);
  }
  return { ...result, a: 1 };
}

/** Pick whichever readable shade (near-white or near-black) wins contrast. */
export function pickReadable(bg: RGBA): string {
  const light: RGBA = { r: 245, g: 245, b: 247, a: 1 };
  const dark: RGBA = { r: 14, g: 14, b: 18, a: 1 };
  const cLight = contrastRatio(light, bg);
  const cDark = contrastRatio(dark, bg);
  return cLight >= cDark
    ? 'rgb(245, 245, 247)'
    : 'rgb(14, 14, 18)';
}
