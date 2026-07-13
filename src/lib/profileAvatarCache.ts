import { getCachedCurrentProfile, getCachedProfile } from '@/lib/profileCache';

const AVATAR_CACHE_KEY = 'vybe_profile_avatar_v1';

/** In-memory map — avoid JSON.parse(localStorage) on every inbox row. */
let memoryMap: Record<string, string> | null = null;

function ensureMemoryMap(): Record<string, string> {
  if (memoryMap) return memoryMap;
  try {
    const raw = localStorage.getItem(AVATAR_CACHE_KEY);
    memoryMap = raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    memoryMap = {};
  }
  return memoryMap;
}

function persistMemoryMap(): void {
  if (!memoryMap) return;
  try {
    localStorage.setItem(AVATAR_CACHE_KEY, JSON.stringify(memoryMap));
  } catch {
    /* ignore */
  }
}

/** Single source for avatar URL — live prop, avatar cache, profile cache; never bleed current user into other profiles. */
export function resolveProfileAvatarUrl(
  profileId: string | null | undefined,
  avatarUrl: string | null | undefined,
): string | null | undefined {
  if (avatarUrl) return avatarUrl;

  if (!profileId) return avatarUrl ?? null;

  const fromAvatarCache = getCachedProfileAvatar(profileId);
  if (fromAvatarCache) return fromAvatarCache;

  const fromProfileCache = getCachedProfile(profileId)?.avatar_url;
  if (fromProfileCache) return fromProfileCache;

  const current = getCachedCurrentProfile();
  if (current?.id === profileId && current.avatar_url) {
    return current.avatar_url;
  }

  return avatarUrl ?? null;
}

export function cacheProfileAvatar(profileId: string, avatarUrl: string | null | undefined): void {
  if (!profileId || !avatarUrl) return;
  const map = ensureMemoryMap();
  if (map[profileId] === avatarUrl) return;
  map[profileId] = avatarUrl;
  persistMemoryMap();
}

export function getCachedProfileAvatar(profileId: string | null | undefined): string | null {
  if (!profileId) return null;
  return ensureMemoryMap()[profileId] ?? null;
}

/** Test / logout helper — drop in-memory avatar map so disk can rehydrate. */
export function clearProfileAvatarMemoryCache(): void {
  memoryMap = null;
}

/** Merge cached avatar onto a profile row when live URL is missing. */
export function enrichProfileAvatar<T extends { id?: string; avatar_url?: string | null }>(
  profile: T | null | undefined,
): T | null | undefined {
  if (!profile?.id) return profile;
  const resolved = resolveProfileAvatarUrl(profile.id, profile.avatar_url);
  if (!resolved || resolved === profile.avatar_url) return profile;
  return { ...profile, avatar_url: resolved };
}
