/**
 * Centralized nav visibility state management.
 * Used to hide bottom nav when inside community chat, story viewer, or when input is focused.
 */

type NavVisibilityListener = (visible: boolean) => void;
type HeaderVisibilityListener = (visible: boolean) => void;

// Global state
let navVisible = true;
let headerVisible = true;
const listeners = new Set<NavVisibilityListener>();
const headerListeners = new Set<HeaderVisibilityListener>();
let communityInputFocused = false;
let inCommunityChat = false;
let inStoryViewer = false;
let inDesigner = false;
let inEditMode = false;

function updateVisibility() {
  const shouldBeVisible = !communityInputFocused && !inCommunityChat && !inStoryViewer && !inDesigner;
  if (navVisible !== shouldBeVisible) {
    navVisible = shouldBeVisible;
    listeners.forEach(fn => fn(navVisible));
  }
  const headerShouldBeVisible = !inEditMode;
  if (headerVisible !== headerShouldBeVisible) {
    headerVisible = headerShouldBeVisible;
    headerListeners.forEach(fn => fn(headerVisible));
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
   * Set whether we're viewing stories (hides nav)
   */
  setInStoryViewer(inViewer: boolean) {
    inStoryViewer = inViewer;
    updateVisibility();
  },

  /**
   * Set whether we're in the designer (hides nav)
   */
  setInDesigner(inDes: boolean) {
    inDesigner = inDes;
    updateVisibility();
  },

  /**
   * Force show nav (useful when exiting community or stories)
   */
  forceShow() {
    inCommunityChat = false;
    communityInputFocused = false;
    inStoryViewer = false;
    inDesigner = false;
    updateVisibility();
  },
};
