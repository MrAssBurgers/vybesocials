const dismissKey = (userId: string) => `vybe-phone-verify-dismissed:${userId}`;

/** True when the user closed the phone verify sheet this browser session. */
export function isPhoneVerifyDismissed(userId: string): boolean {
  try {
    return sessionStorage.getItem(dismissKey(userId)) === '1';
  } catch {
    return false;
  }
}

/** Remember dismiss until the tab/session ends (next login in a fresh session). */
export function dismissPhoneVerifyForSession(userId: string): void {
  try {
    sessionStorage.setItem(dismissKey(userId), '1');
  } catch {
    /* ignore */
  }
}
