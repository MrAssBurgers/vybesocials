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

const BOOT_SNAPSHOT_KEY = 'vybe-boot-theme';

function readBootSnapshot(): Record<string, string> | null {
  try {
    const raw = localStorage.getItem(BOOT_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function applyBootSnapshot(snapshot: Record<string, string>): boolean {
  const root = document.documentElement;
  let applied = false;
  for (const [key, value] of Object.entries(snapshot)) {
    if (typeof value === 'string' && value.trim()) {
      root.style.setProperty(key, value.trim());
      applied = true;
    }
  }
  return applied && Boolean(snapshot['--primary']?.trim());
}

function resolvedMode(): 'dark' | 'light' {
  return document.documentElement.classList.contains('light') ? 'light' : 'dark';
}

/** Apply equipped tokens — same path as equipTheme, without side effects. */
export function applyEquippedThemeSync(tokens: ThemeTokens): void {
  applyThemeTokens(adaptThemeToMode(tokens, resolvedMode()));
}

/**
 * Call as early as possible (main.tsx, before createRoot).
 * Equipped tokens always win — full applyThemeTokens path (not snapshot-only).
 * Snapshot is only used when no equipped tokens exist (first paint hint).
 */
export function ensureBootThemeApplied(): boolean {
  if (typeof document === 'undefined') return false;

  const equipped = getEquippedThemeTokens();
  if (equipped?.colorPrimary) {
    applyEquippedThemeSync(equipped);
    markThemeAppliedFromBoot(equipped);
    return true;
  }

  const snapshot = readBootSnapshot();
  if (snapshot && applyBootSnapshot(snapshot)) {
    // Snapshot-only — do not mark fully applied; React will hydrate from DB/cache.
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
  const adapted = adaptThemeToMode(tokens, resolvedMode());
  return {
    primary: `hsl(${adapted.colorPrimary})`,
    secondary: `hsl(${adapted.colorSecondary})`,
    accent: `hsl(${adapted.colorAccent})`,
  };
}
