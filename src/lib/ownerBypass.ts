/**
 * Owner Bypass Utilities
 * 
 * Provides bypass functionality for the owner account.
 * The owner can bypass AI content safety scanners (when enabled via Owner Settings).
 */

import { supabase } from '@/integrations/supabase/client';

// Owner username - must match OwnerBadge.tsx
const OWNER_USERNAME = 'mrassburgers';

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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    // Check cache
    if (cachedOwnerStatus?.userId === user.id) {
      return cachedOwnerStatus.isOwner;
    }

    // Fetch profile to check username
    const { data: profile } = await supabase
      .from('profiles')
      .select('username')
      .eq('user_id', user.id)
      .single();

    const isOwner = profile?.username?.toLowerCase() === OWNER_USERNAME.toLowerCase();
    
    // Cache result
    cachedOwnerStatus = { userId: user.id, isOwner };
    
    return isOwner;
  } catch (err) {
    console.error('Error checking owner status:', err);
    return false;
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
    const { data } = await supabase
      .from('app_secrets')
      .select('value')
      .eq('key', 'OWNER_AI_BYPASS_ENABLED')
      .maybeSingle();

    const enabled = data?.value === 'true';
    cachedBypassEnabled = { value: enabled, fetchedAt: Date.now() };
    return enabled;
  } catch {
    return true; // Default to enabled if check fails
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
