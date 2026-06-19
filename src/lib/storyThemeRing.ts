import { THEME_GRADIENTS, THEME_PREVIEW } from '@/lib/cosmeticConstants';

/** Fallback lane colors — visible on dark home feed. */
const DEFAULT_COLORS = ['#f472b6', '#22d3ee', '#facc15', '#f472b6'];

function normalizeThemeKey(themeName: string): string {
  const trimmed = themeName.trim();
  if (THEME_GRADIENTS[trimmed]) return trimmed;
  const lower = trimmed.toLowerCase();
  const match = Object.keys(THEME_GRADIENTS).find((k) => k.toLowerCase() === lower);
  if (match) return match;
  const previewMatch = Object.keys(THEME_PREVIEW).find((k) => k.toLowerCase() === lower);
  if (previewMatch) return previewMatch;
  return trimmed;
}

/** Extract 2–3 hex/hsl stops from a theme for conic ring animation. */
function themeRingColors(themeName: string | null | undefined): string[] {
  if (!themeName) return DEFAULT_COLORS;

  const key = normalizeThemeKey(themeName);
  const gradient = THEME_GRADIENTS[key];
  if (gradient) {
    const stops = gradient.match(/#[0-9a-fA-F]{3,8}|hsl\([^)]+\)/g);
    if (stops && stops.length >= 2) {
      return [...stops, stops[0]!];
    }
  }

  const preview = THEME_PREVIEW[key];
  if (preview) {
    return [preview.from, preview.to, preview.from];
  }

  return DEFAULT_COLORS;
}

/**
 * Conic gradient for animated story ring (rotating this is visibly distinct per user theme).
 */
export function storyRingGradient(themeName: string | null | undefined): string {
  const colors = themeRingColors(themeName);
  if (colors.length === 2) {
    return `conic-gradient(from 0deg, ${colors[0]}, ${colors[1]}, ${colors[0]})`;
  }
  return `conic-gradient(from 0deg, ${colors.join(', ')})`;
}
