/**
 * Single-settlement guard for OAuth attempts — prevents duplicate navigation,
 * duplicate error toasts, and races between Despia oauth:// and Apple JS handlers.
 */
import type { VybeAuthError } from '@/lib/firebase/types';

export type OAuthAttemptProvider = 'google' | 'apple';

type OAuthAttempt = {
  id: string;
  provider: OAuthAttemptProvider;
  settled: boolean;
  hadSession: boolean;
};

let currentAttempt: OAuthAttempt | null = null;

function randomAttemptId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `oauth-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function beginOAuthAttempt(provider: OAuthAttemptProvider): string {
  const id = randomAttemptId();
  currentAttempt = { id, provider, settled: false, hadSession: false };
  return id;
}

export function getCurrentOAuthAttempt(): OAuthAttempt | null {
  return currentAttempt;
}

export function getCurrentOAuthAttemptId(): string | null {
  return currentAttempt?.id ?? null;
}

/** Mark attempt complete after a valid session — later errors/callbacks are ignored. */
export function settleOAuthAttemptWithSession(attemptId?: string | null): boolean {
  if (!currentAttempt) return false;
  if (attemptId && currentAttempt.id !== attemptId) return false;
  currentAttempt.settled = true;
  currentAttempt.hadSession = true;
  return true;
}

export function isOAuthAttemptSettled(attemptId?: string | null): boolean {
  if (!currentAttempt) return false;
  if (attemptId && currentAttempt.id !== attemptId) {
    return currentAttempt.settled;
  }
  return currentAttempt.settled;
}

export function clearOAuthAttempt(attemptId?: string | null): void {
  if (!currentAttempt) return;
  if (attemptId && currentAttempt.id !== attemptId) return;
  currentAttempt = null;
}

function errorCode(error: unknown): string {
  const raw = error as { code?: string; name?: string; message?: string };
  return String(raw?.code || raw?.name || '').toLowerCase();
}

function errorMessage(error: unknown): string {
  const raw = error as { message?: string };
  return String(raw?.message || '').toLowerCase();
}

/** Errors that should be quiet when the attempt already produced a session. */
export function isStaleOAuthCompletionError(error: unknown): boolean {
  const code = errorCode(error);
  const message = errorMessage(error);
  if (!code && !message) return false;
  return (
    code.includes('internal-error') ||
    code.includes('internal_error') ||
    /^unknown$/.test(code) ||
    /^unknown$/.test(message) ||
    /already used|expired or already used|stale callback|expired code/i.test(message) ||
    /popup-closed-by-user|user_cancelled|cancel/i.test(code) ||
    /popup-closed-by-user|user_cancelled|cancel/i.test(message)
  );
}

export function shouldSuppressOAuthError(error: unknown, attemptId?: string | null): boolean {
  if (currentAttempt?.settled && currentAttempt.hadSession) return true;
  if (!isOAuthAttemptSettled(attemptId)) return false;
  return isStaleOAuthCompletionError(error);
}

export function isOAuthUserCancellation(error: unknown): boolean {
  const code = errorCode(error);
  const message = errorMessage(error);
  return (
    code.includes('popup-closed-by-user') ||
    code.includes('user_cancelled') ||
    code.includes('user-canceled') ||
    /cancel/i.test(message)
  );
}

export function toQuietOAuthCancellation(error: VybeAuthError | null): VybeAuthError | null {
  if (!error) return null;
  if (!isOAuthUserCancellation(error)) return error;
  return { ...error, name: 'auth/popup-closed-by-user', message: 'Sign-in cancelled' };
}
