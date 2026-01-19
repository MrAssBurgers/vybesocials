/**
 * Professional Background Referral System
 * 
 * This system handles referrals completely in the background:
 * 1. When user visits invite link → data stored silently, intro reset
 * 2. User gets FULL normal first-time experience (intro → signup → onboarding → tutorial)
 * 3. AFTER tutorial completion → confirmation modal appears
 * 4. User clicks "Thank You" → friend added, reward granted, inviter notified
 * 
 * Storage keys:
 * - pending_referral: Full referral data
 * - referral_confirmed: Flag to prevent showing modal again
 */

const PENDING_REFERRAL_KEY = 'pending_referral';
const REFERRAL_CONFIRMED_KEY = 'referral_confirmed';
const INTRO_SHOWN_KEY = 'vybe_intro_completed';

export interface PendingReferral {
  inviterId: string;        // Profile ID
  inviterUserId: string;    // Auth user ID (for invites table lookup)
  inviterUsername: string;
  inviterDisplayName?: string | null;
  inviterAvatarUrl?: string | null;
  timestamp: number;
}

/**
 * Store referral data for post-tutorial processing
 * Also resets intro so invited users get the full first-time experience
 */
export function setPendingReferral(referral: PendingReferral): void {
  try {
    localStorage.setItem(PENDING_REFERRAL_KEY, JSON.stringify(referral));
    // Clear confirmed flag for fresh referral
    localStorage.removeItem(REFERRAL_CONFIRMED_KEY);
    // Reset intro so invited user sees full first-time experience
    localStorage.removeItem(INTRO_SHOWN_KEY);
    console.log('[Referral] Stored pending referral:', referral.inviterUsername);
    console.log('[Referral] Reset intro for first-time experience');
  } catch (e) {
    console.error('[Referral] Failed to store referral:', e);
  }
}

/**
 * Get pending referral if exists and not expired
 */
export function getPendingReferral(): PendingReferral | null {
  try {
    const stored = localStorage.getItem(PENDING_REFERRAL_KEY);
    if (!stored) return null;
    
    const referral = JSON.parse(stored) as PendingReferral;
    
    // Check if referral is too old (7 days - generous window)
    const maxAge = 7 * 24 * 60 * 60 * 1000;
    if (Date.now() - referral.timestamp > maxAge) {
      console.log('[Referral] Referral expired, clearing');
      clearPendingReferral();
      return null;
    }
    
    return referral;
  } catch (e) {
    console.error('[Referral] Failed to get referral:', e);
    return null;
  }
}

/**
 * Check if there's a pending referral (without expiry check - for blocking redirects)
 */
export function hasPendingReferral(): boolean {
  try {
    return localStorage.getItem(PENDING_REFERRAL_KEY) !== null;
  } catch {
    return false;
  }
}

/**
 * Clear pending referral
 */
export function clearPendingReferral(): void {
  try {
    localStorage.removeItem(PENDING_REFERRAL_KEY);
    console.log('[Referral] Cleared pending referral');
  } catch (e) {
    console.error('[Referral] Failed to clear referral:', e);
  }
}

/**
 * Check if referral has already been confirmed
 */
export function wasReferralConfirmed(): boolean {
  try {
    return localStorage.getItem(REFERRAL_CONFIRMED_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Mark referral as confirmed (modal shown, reward granted)
 */
export function markReferralConfirmed(): void {
  try {
    localStorage.setItem(REFERRAL_CONFIRMED_KEY, 'true');
    console.log('[Referral] Marked as confirmed');
  } catch (e) {
    console.error('[Referral] Failed to mark confirmed:', e);
  }
}

/**
 * Full cleanup after referral flow completes
 */
export function cleanupReferralStorage(): void {
  try {
    localStorage.removeItem(PENDING_REFERRAL_KEY);
    localStorage.removeItem(REFERRAL_CONFIRMED_KEY);
    // Clean up any legacy keys
    localStorage.removeItem('pending_referral_inviter');
    localStorage.removeItem('referral_popup_shown');
    localStorage.removeItem('referral_popup_dismissed');
    localStorage.removeItem('referral_consumed');
    sessionStorage.removeItem('pending_inviter_id');
    sessionStorage.removeItem('invite_popup_shown');
    console.log('[Referral] Storage cleaned up');
  } catch (e) {
    console.error('[Referral] Failed to cleanup storage:', e);
  }
}

/**
 * Check if we should show referral confirmation modal
 * Only shows AFTER tutorial completion (or skip)
 */
export function shouldShowReferralModal(): boolean {
  const referral = getPendingReferral();
  if (!referral) return false;
  if (wasReferralConfirmed()) return false;
  return true;
}

/**
 * Check if we have an active referral that hasn't been processed yet
 * Used to prevent interrupting referral flow with redirects
 */
export function hasActiveReferral(): boolean {
  if (wasReferralConfirmed()) return false;
  return hasPendingReferral();
}

// Legacy exports for backwards compatibility
export const wasPopupDismissed = wasReferralConfirmed;
export const markPopupDismissed = markReferralConfirmed;
export const wasReferralConsumed = wasReferralConfirmed;
export const markReferralConsumed = markReferralConfirmed;
