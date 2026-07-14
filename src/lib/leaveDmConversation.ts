import type { NavigateFunction } from 'react-router-dom';

/**
 * Leave an open DM thread and show the inbox.
 * Always `replace` so Android/hardware back and swipe-back don't immediately
 * reopen the same conversation (pushing `/messages` onto `/messages/:id`).
 */
export function leaveDmConversation(navigate: NavigateFunction): void {
  // Clear active-chat shell styles before route change so a sticky fixed/absolute
  // layer cannot trap the next frame of taps on inbox or app chrome.
  if (typeof document !== 'undefined') {
    document.documentElement.removeAttribute('data-dm-active');
  }
  navigate('/messages', { replace: true });
}

/** True when the path is a conversation thread (not inbox / search / new). */
export function isDmConversationPath(pathname: string): boolean {
  if (!pathname.startsWith('/messages/')) return false;
  const rest = pathname.slice('/messages/'.length).split(/[/?#]/)[0] ?? '';
  if (!rest) return false;
  return !['search', 'requests', 'new', 'ai-autisy'].includes(rest);
}
