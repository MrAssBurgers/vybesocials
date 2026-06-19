const AVATAR_CACHE_KEY = 'vybe_profile_avatar_v1';

export function cacheProfileAvatar(profileId: string, avatarUrl: string | null | undefined): void {
  if (!profileId || !avatarUrl) return;
  try {
    const raw = localStorage.getItem(AVATAR_CACHE_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    map[profileId] = avatarUrl;
    localStorage.setItem(AVATAR_CACHE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function getCachedProfileAvatar(profileId: string | null | undefined): string | null {
  if (!profileId) return null;
  try {
    const raw = localStorage.getItem(AVATAR_CACHE_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, string>;
    return map[profileId] ?? null;
  } catch {
    return null;
  }
}
