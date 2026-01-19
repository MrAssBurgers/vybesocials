/**
 * Referral System - Persistent storage and utilities
 * 
 * Uses localStorage for persistence across signup flow.
 * Keys:
 * - pending_referral_inviter: The profile ID of the inviter
 * - referral_popup_shown: Flag to prevent re-showing the modal
 */

const STORAGE_KEY = 'pending_referral_inviter';
const POPUP_SHOWN_KEY = 'referral_popup_shown';

/**
 * Store the inviter's profile ID for post-signup processing
 */
export function setPendingReferral(inviterProfileId: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, inviterProfileId);
    // Clear the popup shown flag so it shows for this new referral
    localStorage.removeItem(POPUP_SHOWN_KEY);
  } catch (e) {
    console.error('Failed to store referral:', e);
  }
}

/**
 * Get the pending referral inviter ID
 */
export function getPendingReferral(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch (e) {
    console.error('Failed to get referral:', e);
    return null;
  }
}

/**
 * Clear the pending referral (after processing or dismissing)
 */
export function clearPendingReferral(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.error('Failed to clear referral:', e);
  }
}

/**
 * Mark the popup as shown to prevent re-display
 */
export function markPopupShown(): void {
  try {
    localStorage.setItem(POPUP_SHOWN_KEY, 'true');
  } catch (e) {
    console.error('Failed to mark popup shown:', e);
  }
}

/**
 * Check if popup has already been shown
 */
export function wasPopupShown(): boolean {
  try {
    return localStorage.getItem(POPUP_SHOWN_KEY) === 'true';
  } catch (e) {
    return false;
  }
}

/**
 * Clean up all referral storage
 */
export function cleanupReferralStorage(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(POPUP_SHOWN_KEY);
    // Also clean up legacy sessionStorage keys
    sessionStorage.removeItem('pending_inviter_id');
    sessionStorage.removeItem('invite_popup_shown');
  } catch (e) {
    console.error('Failed to cleanup referral storage:', e);
  }
}
