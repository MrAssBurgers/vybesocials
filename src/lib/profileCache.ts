import { supabase } from '@/integrations/supabase/client';

/**
 * Global Profile Cache - Instant identity lookups
 * Prevents "user_xxxx" raw IDs from ever showing
 */

export interface CachedProfile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio?: string;
}

// In-memory cache for instant lookups
const profileCache = new Map<string, CachedProfile>();
const pendingFetches = new Map<string, Promise<CachedProfile | null>>();
const CURRENT_PROFILE_KEY = 'vybe-current-profile-v1';

// Cache TTL - 5 minutes
const CACHE_TTL = 5 * 60 * 1000;
const cacheTimestamps = new Map<string, number>();

/**
 * Get a cached profile by ID - instant if cached
 */
export function getCachedProfile(profileId: string): CachedProfile | null {
  const cached = profileCache.get(profileId);
  const timestamp = cacheTimestamps.get(profileId) || 0;
  
  if (cached && Date.now() - timestamp < CACHE_TTL) {
    return cached;
  }
  
  return null;
}

/**
 * Set a profile in cache
 */
export function setCachedProfile(profile: CachedProfile): void {
  profileCache.set(profile.id, profile);
  cacheTimestamps.set(profile.id, Date.now());
}

/** Persist the signed-in profile so protected areas can render cached data while auth restores/offline. */
export function setCachedCurrentProfile(profile: CachedProfile): void {
  setCachedProfile(profile);
  try {
    localStorage.setItem(CURRENT_PROFILE_KEY, JSON.stringify(profile));
  } catch {
    // ignore storage failures
  }
}

/** Read the last signed-in profile from disk for offline-first boot. */
export function getCachedCurrentProfile(): CachedProfile | null {
  try {
    const raw = localStorage.getItem(CURRENT_PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.id !== 'string' || typeof parsed.username !== 'string') return null;
    const profile = {
      id: parsed.id,
      username: parsed.username,
      display_name: typeof parsed.display_name === 'string' ? parsed.display_name : null,
      avatar_url: typeof parsed.avatar_url === 'string' ? parsed.avatar_url : null,
      bio: typeof parsed.bio === 'string' ? parsed.bio : '',
    };
    setCachedProfile(profile);
    return profile;
  } catch {
    return null;
  }
}

/**
 * Batch cache multiple profiles
 */
export function setCachedProfiles(profiles: CachedProfile[]): void {
  const now = Date.now();
  profiles.forEach(profile => {
    profileCache.set(profile.id, profile);
    cacheTimestamps.set(profile.id, now);
  });
}

/**
 * Fetch profile by ID with deduplication
 */
export async function fetchProfileById(profileId: string): Promise<CachedProfile | null> {
  // Check cache first
  const cached = getCachedProfile(profileId);
  if (cached) return cached;
  
  // Check if already fetching
  const pending = pendingFetches.get(profileId);
  if (pending) return pending;
  
  // Fetch from database
  const fetchPromise = (async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, bio')
        .eq('id', profileId)
        .maybeSingle();
      
      if (error || !data) return null;
      
      setCachedProfile(data);
      return data;
    } catch {
      return null;
    } finally {
      pendingFetches.delete(profileId);
    }
  })();
  
  pendingFetches.set(profileId, fetchPromise);
  return fetchPromise;
}

/**
 * Fetch multiple profiles at once - efficient batch loading
 */
export async function fetchProfilesByIds(profileIds: string[]): Promise<Map<string, CachedProfile>> {
  const result = new Map<string, CachedProfile>();
  const idsToFetch: string[] = [];
  
  // Check cache first
  profileIds.forEach(id => {
    const cached = getCachedProfile(id);
    if (cached) {
      result.set(id, cached);
    } else {
      idsToFetch.push(id);
    }
  });
  
  // Fetch missing profiles
  if (idsToFetch.length > 0) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, bio')
        .in('id', idsToFetch);
      
      if (!error && data) {
        setCachedProfiles(data);
        data.forEach(profile => {
          result.set(profile.id, profile);
        });
      }
    } catch {
      // Ignore errors, return what we have
    }
  }
  
  return result;
}

/**
 * Get display name for a profile - NEVER returns raw ID
 */
export function getDisplayName(profile: CachedProfile | null | undefined): string {
  if (!profile) return 'Unknown User';
  return profile.display_name || profile.username || 'User';
}

/**
 * Get username for a profile - guaranteed to be readable
 */
export function getUsername(profile: CachedProfile | null | undefined): string {
  if (!profile) return 'unknown';
  return profile.username || 'user';
}

/**
 * Format user identity - returns "Display Name (@username)" or just username
 */
export function formatUserIdentity(profile: CachedProfile | null | undefined, includeAt = true): string {
  if (!profile) return 'Unknown User';
  
  const displayName = profile.display_name;
  const username = profile.username;
  
  if (displayName && displayName !== username) {
    return includeAt ? `${displayName} (@${username})` : displayName;
  }
  
  return includeAt ? `@${username}` : username;
}

/**
 * Validate if a string looks like a raw UUID (not a proper username/display name)
 */
export function isRawId(value: string | null | undefined): boolean {
  if (!value) return true;
  // UUIDs are 36 chars with dashes, or 32 chars without
  const uuidRegex = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;
  // Also catch "user_xxxx" patterns
  const userPrefixRegex = /^user_[0-9a-f]+$/i;
  return uuidRegex.test(value) || userPrefixRegex.test(value);
}

/**
 * Clear the profile cache (for logout)
 */
export function clearProfileCache(): void {
  profileCache.clear();
  cacheTimestamps.clear();
  pendingFetches.clear();
}

/** Clear the persisted signed-in profile on explicit sign-out. */
export function clearCachedCurrentProfile(): void {
  clearProfileCache();
  try {
    localStorage.removeItem(CURRENT_PROFILE_KEY);
  } catch {
    // ignore
  }
}
