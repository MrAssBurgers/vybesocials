import type { ThemeTokens } from '@/hooks/useCustomTheme';

export const LAST_GENERATED_THEME_KEY = 'vybe-last-generated-theme';

function scopedKey(userId: string): string {
  return `${LAST_GENERATED_THEME_KEY}:${userId}`;
}

/** Latest AI-generated theme — powers the Custom quick preset. */
export function readLastGeneratedTheme(userId?: string | null): ThemeTokens | null {
  try {
    const keys: string[] = [];
    if (userId) keys.push(scopedKey(userId));
    keys.push(LAST_GENERATED_THEME_KEY);

    for (const key of keys) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as ThemeTokens;
      if (parsed?.colorPrimary) return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function persistLastGeneratedTheme(tokens: ThemeTokens, userId?: string | null): void {
  try {
    const json = JSON.stringify(tokens);
    localStorage.setItem(LAST_GENERATED_THEME_KEY, json);
    if (userId) localStorage.setItem(scopedKey(userId), json);
  } catch {
    /* ignore */
  }
}

export function getCustomThemePreset(fallback: ThemeTokens): ThemeTokens {
  return readLastGeneratedTheme() ?? fallback;
}
