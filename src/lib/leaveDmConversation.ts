import type { NavigateFunction } from 'react-router-dom';

export const DM_LEAVE_SUPPRESS_KEY = 'vybe-dm-leave-suppress';
export const DM_LEAVE_SUPPRESS_MS = 400;

/** Module fallback when sessionStorage is unavailable. */
let leaveSuppressUntil = 0;

/**
 * Leave an open DM thread and show the inbox.
 * Always `replace` so Android/hardware back and swipe-back don't immediately
 * reopen the same conversation (pushing `/messages` onto `/messages/:id`).
 *
 * Also sets a short suppress window so the leave tap cannot ghost-reopen a
 * conversation row that remounts under the same pointer coordinates.
 */
export function leaveDmConversation(navigate: NavigateFunction): void {
  // Clear active-chat shell styles before route change so a sticky fixed/absolute
  // layer cannot trap the next frame of taps on inbox or app chrome.
  if (typeof document !== 'undefined') {
    document.documentElement.removeAttribute('data-dm-active');
  }
  const until = Date.now() + DM_LEAVE_SUPPRESS_MS;
  leaveSuppressUntil = until;
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(DM_LEAVE_SUPPRESS_KEY, String(until));
    }
  } catch {
    /* ignore */
  }
  navigate('/messages', { replace: true });
}

/** True while a fresh leave suppress window is active (ghost-reopen guard). */
export function isDmLeaveSuppressActive(now = Date.now()): boolean {
  let until = leaveSuppressUntil;
  try {
    if (typeof sessionStorage !== 'undefined') {
      const raw = sessionStorage.getItem(DM_LEAVE_SUPPRESS_KEY);
      if (raw) {
        const parsed = Number(raw);
        if (Number.isFinite(parsed)) until = Math.max(until, parsed);
      }
    }
  } catch {
    /* ignore */
  }
  return until > now;
}

/** Test helper — clear suppress state. */
export function clearDmLeaveSuppress(): void {
  leaveSuppressUntil = 0;
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(DM_LEAVE_SUPPRESS_KEY);
    }
  } catch {
    /* ignore */
  }
}

/** True when the path is a conversation thread (not inbox / search / new). */
export function isDmConversationPath(pathname: string): boolean {
  if (!pathname.startsWith('/messages/')) return false;
  const rest = pathname.slice('/messages/'.length).split(/[/?#]/)[0] ?? '';
  if (!rest) return false;
  return !['search', 'requests', 'new', 'ai-autisy'].includes(rest);
}
