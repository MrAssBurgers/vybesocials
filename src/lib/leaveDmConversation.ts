import type { NavigateFunction } from 'react-router-dom';

/**
 * Leave an open DM thread and show the inbox.
 * Always `replace` so Android/hardware back and swipe-back don't immediately
 * reopen the same conversation (pushing `/messages` onto `/messages/:id`).
 */
export function leaveDmConversation(navigate: NavigateFunction): void {
  navigate('/messages', { replace: true });
}

/** True when the path is a conversation thread (not inbox / search / new). */
export function isDmConversationPath(pathname: string): boolean {
  if (!pathname.startsWith('/messages/')) return false;
  const rest = pathname.slice('/messages/'.length).split(/[/?#]/)[0] ?? '';
  if (!rest) return false;
  return !['search', 'requests', 'new', 'ai-autisy'].includes(rest);
}
