/**
 * Client-side gate for Instagram-style login confirmation.
 * Set while the attempting device waits for approval from a trusted session.
 * Survives soft sign-out so the waiting modal can poll without an active user.
 */

import { isOAuthRedirectInFlight } from '@/lib/firebase/oauthRedirect';

export interface PendingLoginApproval {
  challengeId: string;
  expiresAt?: string;
  email?: string;
  deviceLabel?: string;
  location?: {
    city?: string | null;
    country?: string | null;
    region?: string | null;
    ip?: string | null;
  };
  userId?: string;
  method?: string;
}

const STORAGE_KEY = 'vybe-pending-login-approval';
const CHECKING_KEY = 'vybe-login-gate-checking';
const CHECKING_AT_KEY = 'vybe-login-gate-checking-at';
/** Max time interactive sign-in may leave the checking flag set (Fold/Android soft-sign-out stalls). */
const CHECKING_TTL_MS = 60_000;
export const LOGIN_APPROVAL_PENDING_EVENT = 'vybe:login-approval-pending';
export const LOGIN_APPROVAL_CLEARED_EVENT = 'vybe:login-approval-cleared';
// Persistence restores the dialog across reloads; it is never required to hold
// an active in-page gate (private browsing/storage quota may reject every write).
let memoryPending: PendingLoginApproval | null | undefined;
let memoryCheckingAt: number | null | undefined;

function readStored(): PendingLoginApproval | null {
  try {
    const parsed = memoryPending !== undefined ? memoryPending : JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null') as PendingLoginApproval | null;
    if (!parsed?.challengeId) return null;
    if (parsed.expiresAt && Date.parse(parsed.expiresAt) <= Date.now()) {
      memoryPending = null;
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function getPendingLoginApproval(): PendingLoginApproval | null {
  return readStored();
}

export function isLoginApprovalPending(): boolean {
  return !!readStored();
}

/** True while interactive sign-in is checking whether approval is required. */
export function isLoginApprovalCheckInProgress(): boolean {
  try {
    if (memoryCheckingAt === null || (memoryCheckingAt === undefined && sessionStorage.getItem(CHECKING_KEY) !== '1')) return false;
    const startedAt = memoryCheckingAt ?? Number(sessionStorage.getItem(CHECKING_AT_KEY) || '0');
    if (startedAt > 0 && Date.now() - startedAt > CHECKING_TTL_MS) {
      endLoginApprovalCheck();
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function beginLoginApprovalCheck(): void {
  memoryCheckingAt = Date.now();
  try {
    sessionStorage.setItem(CHECKING_KEY, '1');
    sessionStorage.setItem(CHECKING_AT_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

export function endLoginApprovalCheck(): void {
  memoryCheckingAt = null;
  try {
    sessionStorage.removeItem(CHECKING_KEY);
    sessionStorage.removeItem(CHECKING_AT_KEY);
  } catch {
    /* ignore */
  }
}

/** App must not treat the user as fully signed-in while gated or still checking. */
export function shouldBlockPostLoginNavigation(): boolean {
  if (isLoginApprovalPending() || isLoginApprovalCheckInProgress()) return true;
  // Google/Apple redirect returns with a live Firebase session before
  // applyOAuthSession finishes the login-approval check. Block so Landing
  // does not navigate into the app and then soft-sign-out ("reload back").
  return isOAuthRedirectInFlight();
}

export function setPendingLoginApproval(pending: PendingLoginApproval): void {
  memoryPending = { ...pending };
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(pending));
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(
      new CustomEvent(LOGIN_APPROVAL_PENDING_EVENT, { detail: pending }),
    );
  } catch {
    /* ignore */
  }
}

export function clearPendingLoginApproval(): void {
  memoryPending = null;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  endLoginApprovalCheck();
  try {
    window.dispatchEvent(new CustomEvent(LOGIN_APPROVAL_CLEARED_EVENT));
  } catch {
    /* ignore */
  }
}
