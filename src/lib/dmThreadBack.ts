import type { NavigateFunction } from 'react-router-dom';
import { leaveDmConversation, isDmConversationPath } from '@/lib/leaveDmConversation';
import { navigationRef } from '@/lib/navigationRef';

/**
 * Optional overlay interceptor registered by ChatView while a thread is mounted.
 * Return true if the back gesture was consumed (overlay closed); false to leave.
 */
type DmThreadBackHandler = () => boolean;

let dmThreadBackHandler: DmThreadBackHandler | null = null;

export function setDmThreadBackHandler(handler: DmThreadBackHandler | null): void {
  dmThreadBackHandler = handler;
}

/** Close open thread overlays if any; returns true when back was consumed. */
export function tryCloseDmThreadOverlay(): boolean {
  return dmThreadBackHandler?.() ?? false;
}

/**
 * Priority back: close viewer/sheet/camera first, otherwise leave to /messages.
 * Used by header, swipe-back, and Capacitor hardware back.
 */
export function requestDmThreadBack(navigate?: NavigateFunction | null): void {
  if (tryCloseDmThreadOverlay()) return;
  const nav = navigate ?? navigationRef.current;
  if (nav) {
    leaveDmConversation(nav);
    return;
  }
  // Last resort without React navigate (should be rare).
  if (typeof document !== 'undefined') {
    document.documentElement.removeAttribute('data-dm-active');
  }
  if (typeof window !== 'undefined' && isDmConversationPath(window.location.pathname)) {
    window.history.replaceState(window.history.state, '', '/messages');
    window.dispatchEvent(new PopStateEvent('popstate'));
  }
}

/** Capacitor / system back entry — only acts on DM threads. Returns true if handled. */
export function handleSystemBackForDm(): boolean {
  if (typeof window === 'undefined') return false;
  if (!isDmConversationPath(window.location.pathname)) return false;
  requestDmThreadBack();
  return true;
}
