/**
 * Referral System - Persistent storage and utilities
 * 
 * Uses localStorage for persistence across signup flow.
 * Keys:
 * - pending_referral: Full referral data (inviter ID, username, timestamp)
 * - referral_consumed: Flag to prevent reward duplication
 */

const PENDING_REFERRAL_KEY = 'pending_referral';
const REFERRAL_CONSUMED_KEY = 'referral_consumed';
const POPUP_DISMISSED_KEY = 'referral_popup_dismissed';

export interface PendingReferral {
  inviterId: string;
  inviterUsername: string;
  inviterDisplayName?: string | null;
  inviterAvatarUrl?: string | null;
  timestamp: number;
}

/**
 * Store the inviter's profile data for post-signup processing
 */
export function setPendingReferral(referral: PendingReferral): void {
  try {
    localStorage.setItem(PENDING_REFERRAL_KEY, JSON.stringify(referral));
    // Clear consumed/dismissed flags for fresh referral
    localStorage.removeItem(REFERRAL_CONSUMED_KEY);
    localStorage.removeItem(POPUP_DISMISSED_KEY);
    console.log('[Referral] Stored pending referral:', referral.inviterUsername);
  } catch (e) {
    console.error('[Referral] Failed to store referral:', e);
  }
}

/**
 * Get the pending referral data
 */
export function getPendingReferral(): PendingReferral | null {
  try {
    const stored = localStorage.getItem(PENDING_REFERRAL_KEY);
    if (!stored) return null;
    
    const referral = JSON.parse(stored) as PendingReferral;
    
    // Check if referral is too old (24 hours)
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
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
 * Clear the pending referral
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
 * Check if popup has been dismissed for this referral
 */
export function wasPopupDismissed(): boolean {
  try {
    return localStorage.getItem(POPUP_DISMISSED_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Mark popup as dismissed
 */
export function markPopupDismissed(): void {
  try {
    localStorage.setItem(POPUP_DISMISSED_KEY, 'true');
  } catch (e) {
    console.error('[Referral] Failed to mark popup dismissed:', e);
  }
}

/**
 * Check if referral reward has been consumed
 */
export function wasReferralConsumed(): boolean {
  try {
    return localStorage.getItem(REFERRAL_CONSUMED_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Mark referral reward as consumed
 */
export function markReferralConsumed(): void {
  try {
    localStorage.setItem(REFERRAL_CONSUMED_KEY, 'true');
    console.log('[Referral] Marked as consumed');
  } catch (e) {
    console.error('[Referral] Failed to mark consumed:', e);
  }
}

/**
 * Clean up all referral storage after flow completes
 */
export function cleanupReferralStorage(): void {
  try {
    localStorage.removeItem(PENDING_REFERRAL_KEY);
    localStorage.removeItem(REFERRAL_CONSUMED_KEY);
    localStorage.removeItem(POPUP_DISMISSED_KEY);
    // Also clean up legacy keys
    localStorage.removeItem('pending_referral_inviter');
    localStorage.removeItem('referral_popup_shown');
    sessionStorage.removeItem('pending_inviter_id');
    sessionStorage.removeItem('invite_popup_shown');
    console.log('[Referral] Storage cleaned up');
  } catch (e) {
    console.error('[Referral] Failed to cleanup storage:', e);
  }
}

/**
 * Check if we should show the referral popup
 * Requirements:
 * - Has pending referral
 * - Popup not dismissed
 * - Referral not yet consumed (no duplicate rewards)
 */
export function shouldShowReferralPopup(): boolean {
  const referral = getPendingReferral();
  if (!referral) return false;
  if (wasPopupDismissed()) return false;
  return true;
}
