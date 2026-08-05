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
export const LOGIN_APPROVAL_PENDING_EVENT = 'vybe:login-approval-pending';
export const LOGIN_APPROVAL_CLEARED_EVENT = 'vybe:login-approval-cleared';

function readStored(): PendingLoginApproval | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingLoginApproval;
    if (!parsed?.challengeId) return null;
    if (parsed.expiresAt && Date.parse(parsed.expiresAt) <= Date.now()) {
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
    return sessionStorage.getItem(CHECKING_KEY) === '1';
  } catch {
    return false;
  }
}

export function beginLoginApprovalCheck(): void {
  try {
    sessionStorage.setItem(CHECKING_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function endLoginApprovalCheck(): void {
  try {
    sessionStorage.removeItem(CHECKING_KEY);
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
