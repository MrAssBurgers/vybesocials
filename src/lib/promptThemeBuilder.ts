import type { GeneratedTheme } from '@/lib/localVibeThemes';
import { buildLocalVibeTheme, detectVibeFromPrompt } from '@/lib/localVibeThemes';
import { buildBrandTheme, detectBrandFromPrompt } from '@/lib/brandThemePalettes';

export interface PromptThemeResult {
  theme: GeneratedTheme;
  confidence: number;
  themeName: string;
}

/** Named colors → HSL (H S% L%) */
const NAMED_COLORS: Record<string, string> = {
  red: '0 84% 50%',
  crimson: '348 83% 47%',
  maroon: '0 100% 25%',
  cherry: '350 85% 48%',
  blood: '0 75% 42%',
  orange: '25 95% 53%',
  coral: '16 100% 66%',
  peach: '28 100% 86%',
  amber: '38 92% 50%',
  gold: '45 100% 51%',
  yellow: '48 96% 53%',
  lime: '84 81% 44%',
  green: '142 71% 45%',
  emerald: '160 84% 39%',
  mint: '152 60% 52%',
  teal: '174 72% 40%',
  cyan: '189 94% 43%',
  aqua: '180 100% 50%',
  sky: '199 89% 48%',
  blue: '217 91% 60%',
  navy: '220 60% 20%',
  indigo: '239 84% 67%',
  purple: '270 70% 58%',
  violet: '258 90% 66%',
  lavender: '270 50% 75%',
  magenta: '300 100% 50%',
  pink: '330 81% 60%',
  hotpink: '330 100% 60%',
  rose: '350 89% 60%',
  brown: '25 50% 30%',
  chocolate: '25 45% 25%',
  beige: '40 30% 88%',
  cream: '43 40% 94%',
  ivory: '40 20% 96%',
  white: '0 0% 98%',
  black: '0 0% 6%',
  gray: '0 0% 45%',
  grey: '0 0% 45%',
  silver: '0 0% 75%',
  charcoal: '0 0% 18%',
  slate: '215 20% 35%',
};

const SCENE_PALETTES: Array<{ pattern: RegExp; primary: string; accent: string; mode: 'dark' | 'light'; name: string; effect?: GeneratedTheme['backgroundEffect'] }> = [
  { pattern: /\b(sunset|sunrise|golden hour|dusk)\b/i, primary: '25 95% 55%', accent: '330 85% 58%', mode: 'dark', name: 'Sunset VYBE', effect: 'aurora' },
  { pattern: /\b(ocean|sea|beach|coastal|wave)\b/i, primary: '199 89% 48%', accent: '174 72% 45%', mode: 'dark', name: 'Ocean VYBE', effect: 'bubbles' },
  { pattern: /\b(forest|jungle|woods|nature|earthy)\b/i, primary: '152 65% 38%', accent: '88 55% 48%', mode: 'dark', name: 'Forest VYBE', effect: 'fireflies' },
  { pattern: /\b(cyberpunk|neon|synth|retro.?wave|vaporwave)\b/i, primary: '320 100% 60%', accent: '185 100% 50%', mode: 'dark', name: 'Neon VYBE', effect: 'geometric' },
  { pattern: /\b(snow|winter|ice|arctic|frost)\b/i, primary: '199 80% 70%', accent: '0 0% 98%', mode: 'light', name: 'Frost VYBE', effect: 'snow' },
  { pattern: /\b(lava|fire|flame|volcano|inferno)\b/i, primary: '0 84% 50%', accent: '25 95% 55%', mode: 'dark', name: 'Inferno VYBE', effect: 'particles' },
  { pattern: /\b(galaxy|space|cosmic|nebula|stars)\b/i, primary: '270 70% 58%', accent: '199 90% 55%', mode: 'dark', name: 'Cosmic VYBE', effect: 'stars' },
  { pattern: /\b(coffee|espresso|cafe|mocha)\b/i, primary: '25 45% 22%', accent: '32 95% 55%', mode: 'dark', name: 'Café VYBE', effect: 'fireflies' },
  { pattern: /\b(cotton candy|bubblegum|candy)\b/i, primary: '330 85% 70%', accent: '199 90% 70%', mode: 'light', name: 'Candy VYBE', effect: 'bubbles' },
  { pattern: /\b(midnight|noir|gothic|dark mode)\b/i, primary: '270 50% 45%', accent: '0 0% 85%', mode: 'dark', name: 'Midnight VYBE', effect: 'stars' },
  { pattern: /\b(y2k|2000s|millennium|chrome)\b/i, primary: '330 85% 65%', accent: '185 100% 55%', mode: 'dark', name: 'Y2K VYBE', effect: 'geometric' },
  { pattern: /\b(pastel|soft|dreamy|kawaii)\b/i, primary: '330 60% 82%', accent: '199 70% 78%', mode: 'light', name: 'Pastel VYBE', effect: 'bubbles' },
  { pattern: /\b(luxury|premium|elegant|gold.?black)\b/i, primary: '45 100% 51%', accent: '0 0% 8%', mode: 'dark', name: 'Luxury VYBE', effect: 'aurora' },
  { pattern: /\b(minimal|clean|simple|monochrome)\b/i, primary: '0 0% 20%', accent: '0 0% 55%', mode: 'light', name: 'Minimal VYBE', effect: 'none' },
  { pattern: /\b(summer|tropical|paradise|palm)\b/i, primary: '48 96% 53%', accent: '152 65% 45%', mode: 'light', name: 'Summer VYBE', effect: 'bubbles' },
  { pattern: /\b(rain|storm|thunder|moody)\b/i, primary: '215 25% 25%', accent: '199 80% 55%', mode: 'dark', name: 'Storm VYBE', effect: 'rain' },
];

function hexToHsl(hex: string): string | null {
  const raw = hex.replace('#', '');
  const full =
    raw.length === 3
      ? raw.split('').map((c) => c + c).join('')
      : raw.length === 6
        ? raw
        : null;
  if (!full) return null;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return `0 0% ${Math.round(l * 100)}%`;
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function parseHexColors(text: string): string[] {
  const matches = text.match(/#(?:[0-9a-fA-F]{3}){1,2}\b/g) ?? [];
  return matches.map((hex) => hexToHsl(hex)).filter((h): h is string => !!h);
}

function parseNamedColors(text: string): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];
  const sorted = Object.keys(NAMED_COLORS).sort((a, b) => b.length - a.length);
  for (const name of sorted) {
    const re = new RegExp(`\\b${name}\\b`, 'i');
    if (re.test(lower)) {
      found.push(NAMED_COLORS[name]);
      lower.replace(name, ' ');
    }
  }
  return [...new Set(found)];
}

function accentFromPrimary(primary: string): string {
  const parts = primary.split(/\s+/);
  const h = parseInt(parts[0], 10);
  if (Number.isNaN(h)) return '185 100% 50%';
  return `${(h + 150) % 360} ${parts[1] || '80%'} ${parts[2] || '55%'}`;
}

function avgLightness(hslList: string[]): number {
  const vals = hslList
    .map((h) => parseFloat(h.split(/\s+/)[2]?.replace('%', '') ?? ''))
    .filter((n) => !Number.isNaN(n));
  if (!vals.length) return 30;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function themeNameFromPrompt(prompt: string): string {
  const cleaned = prompt
    .replace(/[^\w\s'-]/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 4)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
  return cleaned ? `${cleaned} VYBE` : 'Custom VYBE';
}

function buildFromColors(
  colors: string[],
  prompt: string,
  extras?: Partial<GeneratedTheme>,
): GeneratedTheme {
  const primary = colors[0]!;
  const accent = colors[1] || accentFromPrimary(primary);
  const light = avgLightness(colors);
  const mode: 'dark' | 'light' = light > 62 ? 'light' : 'dark';
  const bgMain =
    mode === 'dark'
      ? `${primary.split(' ')[0]} 35% 6%`
      : `${primary.split(' ')[0]} 25% 97%`;
  const bgCard =
    mode === 'dark'
      ? `${primary.split(' ')[0]} 30% 10%`
      : '0 0% 100%';

  return {
    themeName: themeNameFromPrompt(prompt),
    colorPrimary: primary,
    colorSecondary: accent,
    colorAccent: accent,
    bgMain,
    bgCard,
    textPrimary: mode === 'dark' ? '0 0% 98%' : '0 0% 8%',
    textSecondary: mode === 'dark' ? '0 0% 65%' : '0 0% 42%',
    borderColor: mode === 'dark' ? `${primary.split(' ')[0]} 25% 18%` : `${primary.split(' ')[0]} 20% 88%`,
    neonPink: primary,
    neonPurple: accent,
    neonCyan: accentFromPrimary(accent),
    mode,
    borderRadius: 'medium',
    backgroundEffect: extras?.backgroundEffect ?? 'aurora',
    animationSpeed: 'normal',
    animationStyle: 'smooth',
    ...extras,
  };
}

/**
 * Instant theme from user text — brands, hex codes, color names, scenes.
 * No network; typically <1ms.
 */
export function buildThemeFromPrompt(
  prompt: string,
  opts?: { selectedVibe?: string | null; basePreset?: string },
): PromptThemeResult {
  const text = prompt.trim();
  if (!text) {
    const fallback = buildLocalVibeTheme(opts?.selectedVibe || opts?.basePreset || 'classic');
    return { theme: fallback, confidence: 0.2, themeName: fallback.themeName || 'VYBE' };
  }

  const brandId = detectBrandFromPrompt(text);
  if (brandId) {
    const theme = buildBrandTheme(brandId)!;
    return { theme, confidence: 0.95, themeName: theme.themeName || 'Brand VYBE' };
  }

  const hexColors = parseHexColors(text);
  if (hexColors.length) {
    const theme = buildFromColors(hexColors, text);
    return { theme, confidence: 0.92, themeName: theme.themeName || 'Custom VYBE' };
  }

  const named = parseNamedColors(text);
  if (named.length >= 2) {
    const theme = buildFromColors(named, text);
    return { theme, confidence: 0.88, themeName: theme.themeName || 'Custom VYBE' };
  }
  if (named.length === 1) {
    const theme = buildFromColors(named, text);
    return { theme, confidence: 0.8, themeName: theme.themeName || 'Custom VYBE' };
  }

  for (const scene of SCENE_PALETTES) {
    if (scene.pattern.test(text)) {
      const theme = buildFromColors([scene.primary, scene.accent], text, {
        mode: scene.mode,
        themeName: scene.name,
        backgroundEffect: scene.effect,
      });
      return { theme, confidence: 0.78, themeName: scene.name };
    }
  }

  const detectedVibe = detectVibeFromPrompt(text);
  const vibe = opts?.selectedVibe || detectedVibe || null;
  if (vibe) {
    const theme = buildLocalVibeTheme(vibe);
    return {
      theme: { ...theme, themeName: themeNameFromPrompt(text) },
      confidence: named.length ? 0.65 : (opts?.selectedVibe || detectedVibe ? 0.55 : 0.35),
      themeName: themeNameFromPrompt(text),
    };
  }

  // Unmatched prompts: diverse deterministic hues — never force purple.
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash * 33 + text.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  const accentHue = (hue + 40 + (hash % 80)) % 360;
  const theme = buildFromColors(
    [`${hue} 72% 58%`, `${accentHue} 68% 52%`],
    text,
    { mode: 'dark', themeName: themeNameFromPrompt(text), backgroundEffect: 'aurora' },
  );
  return {
    theme,
    confidence: 0.35,
    themeName: theme.themeName,
  };
}

/** Short hint appended for AI when we already parsed colors. */
export function promptThemeAiHint(result: PromptThemeResult): string {
  const t = result.theme;
  return [
    'Match these exact HSL anchors from the user request:',
    `primary=${t.colorPrimary}, accent=${t.colorAccent}, mode=${t.mode}.`,
    'Stay faithful to the user words — do not substitute unrelated palette.',
  ].join(' ');
}
