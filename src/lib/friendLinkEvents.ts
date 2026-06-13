/** Cross-surface Friend Link events (AutoFriendDrop sheet + deep link page). */

export const FRIEND_DROP_ANIMATION_START = 'vybe:friend-drop-animation-start';
export const FRIEND_DROP_COMPLETED = 'vybe:friend-drop-completed';
export const FRIEND_DROP_CLOSE_SHEET = 'vybe:friend-drop-close-sheet';

export type FriendDropRole = 'owner' | 'scanner';

export interface FriendDropAnimationStartDetail {
  dropId: string;
  /** Unix ms — both phones schedule animation from this anchor (+ small buffer). */
  syncStartAt: number;
  role: FriendDropRole;
}

export interface FriendDropCompletedDetail {
  dropId: string;
  friendProfileId: string;
  conversationId?: string;
}

const SYNC_BUFFER_MS = 450;

export function scheduleFriendDropSyncStart(): number {
  return Date.now() + SYNC_BUFFER_MS;
}

export function dispatchFriendDropAnimationStart(detail: FriendDropAnimationStartDetail): void {
  window.dispatchEvent(new CustomEvent(FRIEND_DROP_ANIMATION_START, { detail }));
}

export function dispatchFriendDropCompleted(detail: FriendDropCompletedDetail): void {
  window.dispatchEvent(new CustomEvent(FRIEND_DROP_COMPLETED, { detail }));
}

export function dispatchFriendDropCloseSheet(): void {
  window.dispatchEvent(new CustomEvent(FRIEND_DROP_CLOSE_SHEET));
}
