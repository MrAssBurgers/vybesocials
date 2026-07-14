/** Messages older than this are treated as history, not live foreground events. */
export const FOREGROUND_DM_NOTIFY_MAX_AGE_MS = 45_000;

/** Returns false for missing/invalid timestamps or rows older than the live window. */
export function isFreshForegroundDmMessage(
  createdAt: unknown,
  nowMs: number = Date.now(),
  maxAgeMs: number = FOREGROUND_DM_NOTIFY_MAX_AGE_MS,
): boolean {
  if (typeof createdAt !== 'string' && typeof createdAt !== 'number') return false;
  const createdMs = new Date(createdAt).getTime();
  if (!Number.isFinite(createdMs) || createdMs <= 0) return false;
  return nowMs - createdMs <= maxAgeMs;
}
