/**
 * Centralized nav visibility state management.
 * Used to hide bottom nav when inside community chat or when input is focused.
 */

type NavVisibilityListener = (visible: boolean) => void;

// Global state
let navVisible = true;
const listeners = new Set<NavVisibilityListener>();
let communityInputFocused = false;
let inCommunityChat = false;

function updateVisibility() {
  const shouldBeVisible = !communityInputFocused && !inCommunityChat;
  if (navVisible !== shouldBeVisible) {
    navVisible = shouldBeVisible;
    listeners.forEach(fn => fn(navVisible));
  }
}

export const navVisibility = {
  /**
   * Subscribe to visibility changes
   */
  subscribe(callback: NavVisibilityListener): () => void {
    listeners.add(callback);
    callback(navVisible);
    return () => listeners.delete(callback);
  },

  /**
   * Get current visibility state
   */
  isVisible(): boolean {
    return navVisible;
  },

  /**
   * Set whether we're inside a community chat (hides nav)
   */
  setInCommunityChat(inChat: boolean) {
    inCommunityChat = inChat;
    updateVisibility();
  },

  /**
   * Set whether community input is focused (hides nav)
   */
  setCommunityInputFocused(focused: boolean) {
    communityInputFocused = focused;
    updateVisibility();
  },

  /**
   * Force show nav (useful when exiting community)
   */
  forceShow() {
    inCommunityChat = false;
    communityInputFocused = false;
    updateVisibility();
  },
};
