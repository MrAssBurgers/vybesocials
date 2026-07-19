/** Opens the global Friend Link sheet (AutoFriendDrop) — QR-only. */
export const FRIEND_LINK_OPEN_EVENT = 'vybe:open-friend-link';

export function openFriendLink(_tab: 'tap' | 'qr' = 'qr'): void {
  window.dispatchEvent(
    new CustomEvent(FRIEND_LINK_OPEN_EVENT, { detail: { tab: 'qr' } }),
  );
}
