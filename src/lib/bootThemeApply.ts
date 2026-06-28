/**
 * Synchronous theme replay before React paints — prevents default pink/cyan flash.
 */
import {
  adaptThemeToMode,
  applyThemeTokens,
  getEquippedThemeTokens,
  markThemeAppliedFromBoot,
  type ThemeTokens,
} from '@/hooks/useCustomTheme';
import {
  applyBootSnapshot,
  prepaintThemeFromStorage,
  readBootSnapshot,
} from '@/lib/theme/themePrepaint';

/** Apply equipped tokens — same path as equipTheme, without side effects. */
export function applyEquippedThemeSync(tokens: ThemeTokens): void {
  const mode = document.documentElement.classList.contains('light') ? 'light' : 'dark';
  applyThemeTokens(adaptThemeToMode(tokens, mode));
}

/**
 * Call as early as possible (main.tsx, before createRoot).
 * Snapshot paints instantly; equipped tokens reconcile on top (full applyThemeTokens).
 */
export function ensureBootThemeApplied(): boolean {
  if (typeof document === 'undefined') return false;

  // Same path as index.html boot-theme.js (idempotent).
  prepaintThemeFromStorage();

  const equipped = getEquippedThemeTokens();
  if (equipped?.colorPrimary) {
    applyEquippedThemeSync(equipped);
    markThemeAppliedFromBoot(equipped);
    return true;
  }

  const snapshot = readBootSnapshot();
  if (snapshot && applyBootSnapshot(snapshot)) {
    return true;
  }

  return false;
}

/** HSL strings for SVG logo strokes — always from equipped tokens when available. */
export function getVybeMarkColorsFromStorage(): {
  primary: string;
  secondary: string;
  accent: string;
} | null {
  const tokens = getEquippedThemeTokens();
  if (!tokens?.colorPrimary) return null;
  const mode = document.documentElement.classList.contains('light') ? 'light' : 'dark';
  const adapted = adaptThemeToMode(tokens, mode);
  return {
    primary: `hsl(${adapted.colorPrimary})`,
    secondary: `hsl(${adapted.colorSecondary})`,
    accent: `hsl(${adapted.colorAccent})`,
  };
}
