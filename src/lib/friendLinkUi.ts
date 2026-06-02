/** Opens the global Friend Link sheet (AutoFriendDrop). */
export const FRIEND_LINK_OPEN_EVENT = 'vybe:open-friend-link';

export function openFriendLink(tab: 'tap' | 'qr' = 'tap'): void {
  window.dispatchEvent(
    new CustomEvent(FRIEND_LINK_OPEN_EVENT, { detail: { tab } }),
  );
}
