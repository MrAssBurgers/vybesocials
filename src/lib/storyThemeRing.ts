import { THEME_GRADIENTS, THEME_PREVIEW } from '@/lib/cosmeticConstants';

const DEFAULT_RING =
  'linear-gradient(135deg, hsl(48 96% 53%), hsl(var(--accent)), hsl(48 96% 53%))';

/** Per-user story ring gradient from their equipped VYBE theme (not the viewer's). */
export function storyRingGradient(themeName: string | null | undefined): string {
  if (!themeName) return DEFAULT_RING;
  if (THEME_GRADIENTS[themeName]) return THEME_GRADIENTS[themeName];
  const preview = THEME_PREVIEW[themeName];
  if (preview) {
    return `linear-gradient(135deg, ${preview.from} 0%, ${preview.to} 50%, ${preview.from} 100%)`;
  }
  return DEFAULT_RING;
}
