/**
 * Owner Bypass Utilities
 * 
 * Provides bypass functionality for the owner account.
 * The owner can bypass AI content safety scanners (when enabled via Owner Settings).
 */

import { db } from '@/lib/firebase';
import {
  isPreviewFounderUser,
  isFounderAuthId,
  FOUNDER_AUTH_IDS,
} from '@/lib/previewSandbox';

// Owner username - must match OwnerBadge.tsx
const OWNER_USERNAME = 'mrassburgers';

// Permanent owner auth ID allowlist — sourced from build-time env (no PII in bundle).
const OWNER_AUTH_ID_ALLOWLIST = new Set<string>(FOUNDER_AUTH_IDS);


// Cache the owner status to avoid repeated checks
let cachedOwnerStatus: { userId: string; isOwner: boolean } | null = null;

// Cache the bypass enabled setting
let cachedBypassEnabled: { value: boolean; fetchedAt: number } | null = null;
const BYPASS_CACHE_TTL = 30_000; // 30 seconds

/**
 * Check if the current authenticated user is the owner
 */
export async function isCurrentUserOwner(): Promise<boolean> {
  try {
    const { data: { user } } = await db.auth.getUser();
    if (!user) return false;

    if (isFounderAuthId(user.id) || isPreviewFounderUser(user)) {
      cachedOwnerStatus = { userId: user.id, isOwner: true };
      return true;
    }

    // Hard-coded safety net: founder is ALWAYS owner.
    if (OWNER_AUTH_ID_ALLOWLIST.has(user.id)) {
      cachedOwnerStatus = { userId: user.id, isOwner: true };
      return true;
    }

    // Check cache
    if (cachedOwnerStatus?.userId === user.id) {
      return cachedOwnerStatus.isOwner;
    }

    // Server-validated role via SECURITY DEFINER RPC (authoritative)
    const { data, error } = await db.rpc('is_owner', { _user_id: user.id });
    if (error) {
      console.error('is_owner RPC failed:', error);
      return false; // Fail closed
    }
    const isOwner = data === true;

    // Cache result
    cachedOwnerStatus = { userId: user.id, isOwner };

    return isOwner;
  } catch (err) {
    console.error('Error checking owner status:', err);
    return false; // Fail closed
  }
}

/**
 * Check if owner AI bypass is enabled in platform settings
 */
export async function isOwnerBypassEnabled(): Promise<boolean> {
  // Check cache
  if (cachedBypassEnabled && Date.now() - cachedBypassEnabled.fetchedAt < BYPASS_CACHE_TTL) {
    return cachedBypassEnabled.value;
  }

  try {
    const { data } = await db
      .from('app_secrets')
      .select('value')
      .eq('key', 'OWNER_AI_BYPASS_ENABLED')
      .maybeSingle();

    const enabled = data?.value === 'true';
    cachedBypassEnabled = { value: enabled, fetchedAt: Date.now() };
    return enabled;
  } catch {
    return false; // Fail closed: keep safety enforcement active on error
  }
}

/**
 * Check if the owner bypass should be active (owner + bypass enabled)
 */
export async function shouldBypassSafety(): Promise<boolean> {
  const isOwner = await isCurrentUserOwner();
  if (!isOwner) return false;
  return isOwnerBypassEnabled();
}

/**
 * Clear the bypass enabled cache (call when setting changes)
 */
export function clearBypassCache(): void {
  cachedBypassEnabled = null;
}

/**
 * Check if a given username is the owner
 */
export function isOwnerUsername(username: string | null | undefined): boolean {
  return username?.trim().toLowerCase() === OWNER_USERNAME.toLowerCase();
}

/**
 * Clear the cached owner status (call on logout)
 */
export function clearOwnerCache(): void {
  cachedOwnerStatus = null;
  cachedBypassEnabled = null;
}
