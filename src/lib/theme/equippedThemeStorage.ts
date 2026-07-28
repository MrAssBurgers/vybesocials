/**
 * Read equipped Vybe tokens from localStorage before React mounts.
 */
export const BOOT_SNAPSHOT_KEY = 'vybe-boot-theme';
export const BOOT_SNAPSHOT_UPDATED_AT_KEY = 'vybe-boot-theme-updated-at';

export const EQUIPPED_THEME_KEY = 'vybe-equipped-theme';
export const EQUIPPED_THEME_UPDATED_AT_KEY = 'vybe-equipped-theme-updated-at';
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

export function scopedEquippedKey(userId: string): string {
  return `${EQUIPPED_THEME_KEY}:${userId}`;
}

export function scopedEquippedUpdatedAtKey(userId: string): string {
  return `${EQUIPPED_THEME_UPDATED_AT_KEY}:${userId}`;
}

export function isEquippedThemeStorageKey(key: string | null): boolean {
  return Boolean(
    key === EQUIPPED_THEME_KEY ||
      key === EQUIPPED_THEME_UPDATED_AT_KEY ||
      key === LEGACY_EQUIPPED_KEY ||
      key?.startsWith(`${EQUIPPED_THEME_KEY}:`) ||
      key?.startsWith(`${EQUIPPED_THEME_UPDATED_AT_KEY}:`),
  );
}

function readPersistedFirebaseAuthUid(): string | null {
  try {
    const storageKeys = new Set(Object.keys(localStorage));
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (key) storageKeys.add(key);
    }
    for (const storageKey of storageKeys) {
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

/**
 * Boot-theme code is emitted as a synchronous IIFE, so it must stay independent
 * from the Firebase runtime/config graph. Read only the legacy storage shape
 * needed to scope a theme; the full auth bootstrap validates/migrates it later.
 */
function readPersistedLegacyAuthUid(): string | null {
  try {
    for (const key of Object.keys(localStorage)) {
      if (!/^sb-.+-auth-token(?:-vybe-backup)?$/.test(key)) continue;
      try {
        const parsed = JSON.parse(localStorage.getItem(key) || 'null') as {
          user?: { id?: string };
          currentSession?: { user?: { id?: string } };
        } | null;
        const uid = parsed?.user?.id ?? parsed?.currentSession?.user?.id;
        if (typeof uid === 'string' && uid) return uid;
      } catch {
        /* ignore malformed legacy data */
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
    const persistedFirebaseUid = readPersistedFirebaseAuthUid();
    if (persistedFirebaseUid) return persistedFirebaseUid;

    const storedAuthUid = readPersistedLegacyAuthUid();
    if (storedAuthUid) return storedAuthUid;

    return localStorage.getItem(THEME_USER_ID_KEY);
  } catch {
    return null;
  }
}

export function readBootSnapshot(): Record<string, string> | null {
  try {
    const authUid = readPersistedFirebaseAuthUid() ?? readPersistedLegacyAuthUid();
    if (authUid && localStorage.getItem(THEME_USER_ID_KEY) !== authUid) {
      return null;
    }
    const raw = localStorage.getItem(BOOT_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Authenticated reads are strictly account-scoped. Global keys are only used
 * for the unauthenticated legacy migration path.
 */
export function readEquippedThemeTokens(userId?: string | null): EquippedThemeTokens | null {
  try {
    const uid = resolveThemeUserId(userId);
    const keys = uid
      ? [scopedEquippedKey(uid)]
      : [EQUIPPED_THEME_KEY, LEGACY_EQUIPPED_KEY];

    for (const key of keys) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as EquippedThemeTokens;
      if (parsed?.colorPrimary) return parsed;
    }

    return null;
  } catch {
    return null;
  }
}
