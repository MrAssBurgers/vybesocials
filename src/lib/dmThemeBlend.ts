export type DmThemeMode = 'default' | 'mine' | 'theirs' | 'blend' | 'custom';

export interface ThemeColorTokens {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
}

export interface DmChatTheme {
  mode: DmThemeMode;
  bubbleMine: string;
  bubbleTheirs: string;
  textOnMine: string;
  textOnTheirs: string;
  wallpaper?: string;
}

function parseHslTriplet(hsl: string): { h: number; s: number; l: number } | null {
  const m = hsl.trim().match(/^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%$/);
  if (!m) return null;
  return { h: Number(m[1]), s: Number(m[2]), l: Number(m[3]) };
}

function blendHsl(a: string, b: string, weight = 0.5): string {
  const pa = parseHslTriplet(a);
  const pb = parseHslTriplet(b);
  if (!pa || !pb) return a || b;
  const w = Math.max(0, Math.min(1, weight));
  const h = pa.h * (1 - w) + pb.h * w;
  const s = pa.s * (1 - w) + pb.s * w;
  const l = pa.l * (1 - w) + pb.l * w;
  return `${h.toFixed(1)} ${s.toFixed(1)}% ${l.toFixed(1)}%`;
}

/** Relative luminance check for readable text on bubbles (WCAG-ish). */
export function contrastRatioFgOnBg(fgHsl: string, bgHsl: string): number {
  const parse = (hsl: string) => {
    const p = parseHslTriplet(hsl);
    if (!p) return 0.5;
    return p.l / 100;
  };
  const l1 = parse(fgHsl) + 0.05;
  const l2 = parse(bgHsl) + 0.05;
  return l1 > l2 ? l1 / l2 : l2 / l1;
}

export function ensureReadableText(bgHsl: string, preferred: string): string {
  const white = '0 0% 100%';
  const dark = '0 0% 12%';
  const pref = contrastRatioFgOnBg(preferred, bgHsl);
  if (pref >= 4.5) return preferred;
  return contrastRatioFgOnBg(white, bgHsl) >= contrastRatioFgOnBg(dark, bgHsl) ? white : dark;
}

export function blendDmThemes(
  mine: ThemeColorTokens,
  theirs: ThemeColorTokens,
  mode: DmThemeMode,
): DmChatTheme {
  if (mode === 'default') {
    return {
      mode,
      bubbleMine: 'hsl(var(--primary))',
      bubbleTheirs: 'hsl(var(--muted))',
      textOnMine: 'hsl(var(--primary-foreground))',
      textOnTheirs: 'hsl(var(--foreground))',
    };
  }
  if (mode === 'mine') {
    const bg = `hsl(${mine.primary})`;
    return {
      mode,
      bubbleMine: bg,
      bubbleTheirs: `hsl(${mine.secondary})`,
      textOnMine: ensureReadableText(mine.primary, '0 0% 100%'),
      textOnTheirs: ensureReadableText(mine.secondary, '0 0% 12%'),
      wallpaper: `linear-gradient(135deg, hsl(${mine.primary} / 0.15), hsl(${mine.accent} / 0.1))`,
    };
  }
  if (mode === 'theirs') {
    return {
      mode,
      bubbleMine: `hsl(${theirs.accent})`,
      bubbleTheirs: `hsl(${theirs.primary})`,
      textOnMine: ensureReadableText(theirs.accent, '0 0% 100%'),
      textOnTheirs: ensureReadableText(theirs.primary, '0 0% 100%'),
      wallpaper: `linear-gradient(135deg, hsl(${theirs.primary} / 0.15), hsl(${theirs.secondary} / 0.1))`,
    };
  }
  const blendedPrimary = blendHsl(mine.primary, theirs.primary, 0.5);
  const blendedAccent = blendHsl(mine.accent, theirs.accent, 0.5);
  return {
    mode: mode === 'custom' ? 'custom' : 'blend',
    bubbleMine: `hsl(${blendedPrimary})`,
    bubbleTheirs: `hsl(${blendHsl(mine.secondary, theirs.secondary, 0.5)})`,
    textOnMine: ensureReadableText(blendedPrimary, '0 0% 100%'),
    textOnTheirs: ensureReadableText(blendHsl(mine.secondary, theirs.secondary, 0.5), '0 0% 12%'),
    wallpaper: `linear-gradient(135deg, hsl(${blendedPrimary} / 0.18), hsl(${blendedAccent} / 0.12))`,
  };
}
