/**
 * Persist last-known user level so home widgets don't flash Lv.1 on boot.
 */

export interface CachedUserLevel {
  user_id: string;
  current_level: number;
  total_xp: number;
  unclaimed_rewards?: unknown[];
}

const KEY_PREFIX = 'vybe-user-level-v1';

function storageKey(userId: string): string {
  return `${KEY_PREFIX}:${userId}`;
}

export function getCachedUserLevel(userId: string | null | undefined): CachedUserLevel | null {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed.user_id !== 'string' ||
      typeof parsed.current_level !== 'number' ||
      typeof parsed.total_xp !== 'number'
    ) {
      return null;
    }
    return parsed as CachedUserLevel;
  } catch {
    return null;
  }
}

export function setCachedUserLevel(
  userId: string,
  level: Pick<CachedUserLevel, 'current_level' | 'total_xp' | 'unclaimed_rewards'>,
): void {
  try {
    localStorage.setItem(
      storageKey(userId),
      JSON.stringify({
        user_id: userId,
        current_level: level.current_level,
        total_xp: level.total_xp,
        unclaimed_rewards: level.unclaimed_rewards ?? [],
      } satisfies CachedUserLevel),
    );
  } catch {
    // ignore quota / private mode
  }
}

export function clearCachedUserLevel(userId?: string): void {
  try {
    if (userId) {
      localStorage.removeItem(storageKey(userId));
      return;
    }
    const prefix = `${KEY_PREFIX}:`;
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const k = localStorage.key(i);
      if (k?.startsWith(prefix)) localStorage.removeItem(k);
    }
  } catch {
    // ignore
  }
}
