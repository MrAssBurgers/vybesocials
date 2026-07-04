import { getCachedCurrentProfile, getCachedProfile } from '@/lib/profileCache';

const AVATAR_CACHE_KEY = 'vybe_profile_avatar_v1';

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

/** Merge cached avatar onto a profile row when live URL is missing. */
export function enrichProfileAvatar<T extends { id?: string; avatar_url?: string | null }>(
  profile: T | null | undefined,
): T | null | undefined {
  if (!profile?.id) return profile;
  const resolved = resolveProfileAvatarUrl(profile.id, profile.avatar_url);
  if (!resolved || resolved === profile.avatar_url) return profile;
  return { ...profile, avatar_url: resolved };
}
