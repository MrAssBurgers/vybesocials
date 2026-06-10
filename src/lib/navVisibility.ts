/**
 * Centralized nav visibility state management.
 * Used to hide bottom nav when inside community chat, story viewer, or when input is focused.
 */

type NavVisibilityListener = (visible: boolean) => void;
type HeaderVisibilityListener = (visible: boolean) => void;

// Global state
let navVisible = true;
let headerVisible = true;
let effectiveNavVisible = true; // Reported by BottomNav (includes scroll/keyboard signals)
const listeners = new Set<NavVisibilityListener>();
const headerListeners = new Set<HeaderVisibilityListener>();
const effectiveListeners = new Set<NavVisibilityListener>();
let communityInputFocused = false;
let inCommunityChat = false;
let inStoryViewer = false;
let inDesigner = false;
let inEditMode = false;
let inImmersiveView = false;

function updateVisibility() {
  const shouldBeVisible = !communityInputFocused && !inCommunityChat && !inStoryViewer && !inDesigner && !inImmersiveView;
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
  subscribe(callback: NavVisibilityListener): () => void {
    listeners.add(callback);
    callback(navVisible);
    return () => listeners.delete(callback);
  },

  isVisible(): boolean {
    return navVisible;
  },

  setInCommunityChat(inChat: boolean) {
    inCommunityChat = inChat;
    updateVisibility();
  },

  setCommunityInputFocused(focused: boolean) {
    communityInputFocused = focused;
    updateVisibility();
  },

  setInStoryViewer(inViewer: boolean) {
    inStoryViewer = inViewer;
    updateVisibility();
  },

  setInDesigner(inDes: boolean) {
    inDesigner = inDes;
    updateVisibility();
  },

  forceShow() {
    inCommunityChat = false;
    communityInputFocused = false;
    inStoryViewer = false;
    inDesigner = false;
    inEditMode = false;
    inImmersiveView = false;
    updateVisibility();
  },

  setInEditMode(editing: boolean) {
    inEditMode = editing;
    updateVisibility();
  },

  /** Full-screen experiences: map, community server, space room, etc. */
  setImmersiveView(immersive: boolean) {
    inImmersiveView = immersive;
    updateVisibility();
  },

  forceHide() {
    inImmersiveView = true;
    updateVisibility();
  },

  subscribeHeader(callback: HeaderVisibilityListener): () => void {
    headerListeners.add(callback);
    callback(headerVisible);
    return () => headerListeners.delete(callback);
  },

  isHeaderVisible(): boolean {
    return headerVisible;
  },

  /**
   * Effective visibility — set by BottomNav, includes scroll/keyboard/focus signals.
   * AppLayout subscribes to this to collapse reserved bottom padding when nav is hidden.
   */
  setEffectiveVisible(visible: boolean) {
    if (effectiveNavVisible !== visible) {
      effectiveNavVisible = visible;
      effectiveListeners.forEach(fn => fn(visible));
    }
  },

  subscribeEffective(callback: NavVisibilityListener): () => void {
    effectiveListeners.add(callback);
    callback(effectiveNavVisible);
    return () => effectiveListeners.delete(callback);
  },

  isEffectiveVisible(): boolean {
    return effectiveNavVisible;
  },
};
