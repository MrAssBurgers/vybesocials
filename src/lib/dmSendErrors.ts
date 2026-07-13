/**
 * Classify DM send failures so outbox / UI can decide retry vs permanent fail.
 * Pure helpers — unit-tested without Firebase.
 */

export type DmSendFailureKind =
  | 'blocked'
  | 'rate_limited'
  | 'permission'
  | 'validation'
  | 'transient'
  | 'unknown';

const BLOCKED_RE =
  /can.?t message|cannot message|blocked|you.re blocked|not allowed to message/i;
const RATE_RE = /rate.?limit|resource-exhausted|too many requests|quota/i;
const PERMISSION_RE = /permission-denied|permission|not a (member|participant)/i;
const VALIDATION_RE =
  /invalid-argument|content or media|conversationId required|invalid media|unsupported message/i;
const TRANSIENT_RE =
  /network|failed to fetch|timeout|fetch|offline|unavailable|deadline|internal/i;

export function classifyDmSendError(
  error: { message?: string; code?: string } | string | null | undefined,
): DmSendFailureKind {
  if (!error) return 'unknown';
  const code = typeof error === 'string' ? '' : (error.code || '').toLowerCase();
  const message =
    typeof error === 'string' ? error : error.message || '';

  if (code === 'permission-denied' && BLOCKED_RE.test(message)) return 'blocked';
  if (BLOCKED_RE.test(message)) return 'blocked';
  if (code === 'resource-exhausted' || RATE_RE.test(message) || RATE_RE.test(code)) {
    return 'rate_limited';
  }
  if (code === 'invalid-argument' || VALIDATION_RE.test(message)) return 'validation';
  if (code === 'permission-denied' || PERMISSION_RE.test(message)) return 'permission';
  if (
    (typeof navigator !== 'undefined' && navigator.onLine === false) ||
    TRANSIENT_RE.test(message) ||
    TRANSIENT_RE.test(code)
  ) {
    return 'transient';
  }
  return 'unknown';
}

/** Auto-retry on reconnect / outbox flush. */
export function isTransientDmSendFailure(kind: DmSendFailureKind): boolean {
  return kind === 'transient' || kind === 'rate_limited';
}

/** User must unblock / fix input — do not keep retrying forever. */
export function isPermanentDmSendFailure(kind: DmSendFailureKind): boolean {
  return kind === 'blocked' || kind === 'validation' || kind === 'permission';
}

export function dmSendFailureUserMessage(kind: DmSendFailureKind, fallback?: string): string {
  switch (kind) {
    case 'blocked':
      return 'You can’t message this user';
    case 'rate_limited':
      return 'Sending too fast — try again in a moment';
    case 'validation':
      return fallback || 'Message could not be sent';
    case 'permission':
      return fallback || 'You don’t have permission to send here';
    case 'transient':
      return 'Waiting for connection…';
    default:
      return fallback || 'Failed to send message';
  }
}
