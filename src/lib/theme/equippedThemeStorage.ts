/**
 * Read equipped Vybe tokens from localStorage before React mounts.
 */
import { getStoredAuthUserId } from '@/lib/legacyAuthStorage';

export const BOOT_SNAPSHOT_KEY = 'vybe-boot-theme';
export const BOOT_SNAPSHOT_UPDATED_AT_KEY = 'vybe-boot-theme-updated-at';

export const EQUIPPED_THEME_KEY = 'vybe-equipped-theme';
export const LEGACY_EQUIPPED_KEY = 'vybe-custom-theme';
export const THEME_USER_ID_KEY = 'vybe-theme-user-id';

export type EquippedThemeTokens = {
  colorPrimary?: string;
  colorSecondary?: string;
  colorAccent?: string;
  bgMain?: string;
  bgCard?: string;
  bgGradientFrom?: string;
  bgGradientMid?: string;
  bgGradientTo?: string;
  glassBg?: string;
  glassBorder?: string;
  sidebarBg?: string;
  textPrimary?: string;
  textSecondary?: string;
  borderColor?: string;
  inputBg?: string;
  inputText?: string;
  buttonText?: string;
  neonPink?: string;
  neonPurple?: string;
  neonCyan?: string;
  borderRadius?: string;
  mode?: 'light' | 'dark';
  themeName?: string;
};

function scopedEquippedKey(userId: string): string {
  return `${EQUIPPED_THEME_KEY}:${userId}`;
}

function readScopedEquippedKeys(): string[] {
  try {
    return Object.keys(localStorage).filter((key) => key.startsWith(`${EQUIPPED_THEME_KEY}:`));
  } catch {
    return [];
  }
}

function readFirebaseAuthUid(): string | null {
  try {
    for (const storageKey of Object.keys(localStorage)) {
      if (!storageKey.startsWith('firebase:authUser:')) continue;
      try {
        const authUser = JSON.parse(localStorage.getItem(storageKey) || 'null') as { uid?: string } | null;
        if (authUser?.uid) return authUser.uid;
      } catch {
        /* ignore */
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function resolveThemeUserId(explicitUserId?: string | null): string | null {
  if (explicitUserId) return explicitUserId;
  try {
    const remembered = localStorage.getItem(THEME_USER_ID_KEY);
    if (remembered) return remembered;

    const storedAuthUid = getStoredAuthUserId();
    if (storedAuthUid) return storedAuthUid;

    return readFirebaseAuthUid();
  } catch {
    return null;
  }
}

export function readBootSnapshot(): Record<string, string> | null {
  try {
    const raw = localStorage.getItem(BOOT_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/** Scoped key first when uid is known; scan vybe-equipped-theme:* as fallback. */
export function readEquippedThemeTokens(userId?: string | null): EquippedThemeTokens | null {
  try {
    const uid = resolveThemeUserId(userId);
    const keys: string[] = [];
    if (uid) keys.push(scopedEquippedKey(uid));
    keys.push(EQUIPPED_THEME_KEY, LEGACY_EQUIPPED_KEY);

    for (const key of keys) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as EquippedThemeTokens;
      if (parsed?.colorPrimary) return parsed;
    }

    for (const scopedKey of readScopedEquippedKeys()) {
      if (keys.includes(scopedKey)) continue;
      const raw = localStorage.getItem(scopedKey);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as EquippedThemeTokens;
      if (parsed?.colorPrimary) return parsed;
    }

    return null;
  } catch {
    return null;
  }
}
