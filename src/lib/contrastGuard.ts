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
 * Average the color stops in a CSS gradient string. Returns null if no
 * parseable color stops are found. Crude but effective for "what's the
 * dominant tint of this gradient" decisions.
 */
function averageGradientColor(bgImage: string): RGBA | null {
  if (!bgImage || bgImage === 'none') return null;
  // Match rgb()/rgba()/hsl()/hsla()/#hex tokens inside the gradient string.
  const tokens = bgImage.match(
    /rgba?\([^)]+\)|hsla?\([^)]+\)|#[0-9a-fA-F]{3,8}/g,
  );
  if (!tokens || !tokens.length) return null;
  let r = 0, g = 0, b = 0, a = 0, n = 0;
  for (const t of tokens) {
    const c = parseColor(t);
    if (!c || c.a < 0.05) continue;
    r += c.r; g += c.g; b += c.b; a += c.a; n++;
  }
  if (!n) return null;
  return {
    r: Math.round(r / n),
    g: Math.round(g / n),
    b: Math.round(b / n),
    a: Math.min(1, a / n),
  };
}

/**
 * Read a pseudo-element's background color/gradient if it appears to paint
 * a full-bleed surface behind the host element (common pattern for themed
 * body backgrounds via ::before / ::after).
 */
function getPseudoBg(node: Element, pseudo: '::before' | '::after'): RGBA | null {
  let cs: CSSStyleDeclaration;
  try {
    cs = window.getComputedStyle(node, pseudo);
  } catch {
    return null;
  }
  if (!cs || cs.content === 'none' || cs.content === 'normal') {
    // No content set → pseudo not rendered at all
    return null;
  }
  const pos = cs.position;
  if (pos !== 'absolute' && pos !== 'fixed') return null;
  const bgColor = parseColor(cs.backgroundColor);
  const gradient = averageGradientColor(cs.backgroundImage || '');
  // Pseudo-elements are TINTS, not surfaces. Use their actual alpha capped low
  // so they can't masquerade as the dominant background of the host.
  if (bgColor && bgColor.a > 0.05) {
    return { ...bgColor, a: Math.min(bgColor.a, 0.6) };
  }
  if (gradient && gradient.a > 0.05) {
    return { ...gradient, a: Math.min(gradient.a, 0.5) };
  }
  return null;
}

/**
 * Find the topmost full-bleed fixed background layer in the document
 * (e.g. a themed wallpaper element with `position:fixed; inset:0`).
 * Returns the dominant color or null.
 */
function getFullBleedFixedBg(): RGBA | null {
  // Cheap check: only inspect direct children of <body> — themed wallpapers
  // are almost always mounted there to avoid affecting layout.
  const candidates = Array.from(document.body.children) as Element[];
  for (const el of candidates) {
    const cs = window.getComputedStyle(el);
    if (cs.position !== 'fixed') continue;
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    const rect = (el as HTMLElement).getBoundingClientRect?.();
    if (!rect) continue;
    // Must roughly cover the viewport
    if (rect.width < window.innerWidth * 0.9) continue;
    if (rect.height < window.innerHeight * 0.9) continue;
    const solid = parseColor(cs.backgroundColor);
    if (solid && solid.a > 0.5) return { ...solid, a: 1 };
    const gradient = averageGradientColor(cs.backgroundImage || '');
    if (gradient) return { ...gradient, a: 1 };
  }
  return null;
}



/**
 * Walk up ancestors compositing semi-transparent backgrounds (including
 * gradient images and pseudo-element backdrops) until a fully opaque color
 * is found. Falls back to the dominant fixed wallpaper, then body, then a
 * theme-aware canvas color.
 */
export function getEffectiveBg(el: Element | null): RGBA {
  let result: RGBA = TRANSPARENT;
  let node: Element | null = el;
  // Hard limit to keep this cheap on deep DOMs
  let safety = 25;
  while (node && safety-- > 0) {
    const cs = window.getComputedStyle(node);

    // 1. Solid background-color on this node.
    const bgColor = parseColor(cs.backgroundColor);
    if (bgColor && bgColor.a > 0) {
      // If this layer is essentially opaque, it's a real surface — STOP HERE.
      // Anything underneath (wallpaper, body gradient, blurred siblings) is
      // visually irrelevant. This prevents the pink page wallpaper from
      // leaking through an opaque dark sidebar / card.
      if (bgColor.a >= 0.85) {
        result = composite(result, { ...bgColor, a: 1 });
        return { ...result, a: 1 };
      }
      result = composite(result, bgColor);
      if (result.a >= 0.99) return { ...result, a: 1 };
    }

    // 2. Background-image gradient on this node — treated as a TINT.
    // Use natural alpha capped at 0.5; gradients are decoration, not surface.
    const bgImage = cs.backgroundImage || '';
    if (bgImage && bgImage !== 'none') {
      const grad = averageGradientColor(bgImage);
      if (grad && grad.a > 0.05) {
        result = composite(result, { ...grad, a: Math.min(grad.a, 0.5) });
        if (result.a >= 0.99) return { ...result, a: 1 };
      }
    }

    // 3. Pseudo-element backdrops (also tints, downweighted in getPseudoBg).
    const pBefore = getPseudoBg(node, '::before');
    if (pBefore) {
      result = composite(result, pBefore);
      if (result.a >= 0.99) return { ...result, a: 1 };
    }
    const pAfter = getPseudoBg(node, '::after');
    if (pAfter) {
      result = composite(result, pAfter);
      if (result.a >= 0.99) return { ...result, a: 1 };
    }

    node = node.parentElement;
  }

  // Fallback: only consult the wallpaper if the entire ancestor chain was
  // essentially transparent. Otherwise the surface we found IS the surface.
  if (result.a < 0.2) {
    const wallpaper = getFullBleedFixedBg();
    if (wallpaper) {
      result = composite(result, wallpaper);
    }
  }
  // Body / html fallback — solid color only, NOT the themed gradient image.
  // The gradient is wallpaper, not a contrast surface.
  if (result.a < 0.99) {
    const bodyCs = window.getComputedStyle(document.body);
    const htmlCs = window.getComputedStyle(document.documentElement);
    const bodyBg = parseColor(bodyCs.backgroundColor);
    const htmlBg = parseColor(htmlCs.backgroundColor);
    const pick =
      (bodyBg && bodyBg.a > 0.5 && bodyBg) ||
      (htmlBg && htmlBg.a > 0.5 && htmlBg);
    if (pick) {
      result = composite(result, { ...pick, a: 1 });
    }
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
