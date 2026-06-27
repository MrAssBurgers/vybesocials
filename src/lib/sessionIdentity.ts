/** JWT `session_id` claim — stable per auth session, used to dedupe login alerts. */
export function getJwtSessionId(accessToken?: string | null): string | null {
  try {
    const payload = accessToken?.split('.')[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(normalized))?.session_id ?? null;
  } catch {
    return null;
  }
}

export function rememberCurrentSessionHash(userId: string, sessionHash: string | null): void {
  if (!sessionHash) return;
  try {
    sessionStorage.setItem(`vybe-current-session-hash-${userId}`, sessionHash);
  } catch {
    /* ignore */
  }
}

export function getRememberedSessionHash(userId: string): string | null {
  try {
    return sessionStorage.getItem(`vybe-current-session-hash-${userId}`);
  } catch {
    return null;
  }
}

export function rememberSelfLoginChallenge(userId: string, challengeId: string): void {
  try {
    sessionStorage.setItem(`vybe-self-login-challenge-${userId}`, challengeId);
  } catch {
    /* ignore */
  }
}

export function isSelfLoginChallenge(userId: string, challengeId: string): boolean {
  try {
    return sessionStorage.getItem(`vybe-self-login-challenge-${userId}`) === challengeId;
  } catch {
    return false;
  }
}

/** True when this device initiated the pending login (don't show approve UI here). */
export function isSelfInitiatedLoginApproval(
  userId: string,
  challengeId: string,
  metadata?: Record<string, unknown> | null,
): boolean {
  if (isSelfLoginChallenge(userId, challengeId)) return true;
  const hash = getRememberedSessionHash(userId);
  const requesting =
    (typeof metadata?.requesting_session_hash === 'string' && metadata.requesting_session_hash) ||
    (typeof metadata?.deviceFingerprint === 'string' && metadata.deviceFingerprint) ||
    null;
  return !!(hash && requesting && hash === requesting);
}
