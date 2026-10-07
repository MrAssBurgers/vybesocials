/** Firestore `in` filters accept at most 30 values. Stay under that cap. */
export const PRESENCE_LISTEN_CHUNK = 10;

/** Briefs treat activity inside a 7-day window. A profile write every heartbeat is not required. */
export const PROFILE_LAST_ACTIVE_MIRROR_MS = 30 * 60 * 1000;

export const PRESENCE_ONLINE_WINDOW_MS = 90_000;

/** Own profile only. A collection listen on `profiles` downloads every member. */
export function ownProfileRealtimeFilter(userId: string): string {
  return `user_id=eq.${userId}`;
}

export function chunkIds(ids: readonly string[], size = PRESENCE_LISTEN_CHUNK): string[][] {
  const unique = [...new Set(ids.filter((id) => typeof id === 'string' && id.length > 0))].sort();
  if (size < 1) return unique.length ? [unique] : [];
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += size) chunks.push(unique.slice(i, i + size));
  return chunks;
}

export function presenceIdsKey(ids: readonly string[]): string {
  return chunkIds(ids, Number.MAX_SAFE_INTEGER)[0]?.join(',') ?? '';
}

export function presenceIsOnline(isOnline: unknown, lastSeenAt: unknown, now = Date.now()): boolean {
  if (!isOnline) return false;
  if (typeof lastSeenAt !== 'string' || !lastSeenAt) return true;
  const seen = new Date(lastSeenAt).getTime();
  if (!Number.isFinite(seen)) return true;
  return now - seen <= PRESENCE_ONLINE_WINDOW_MS;
}

export function shouldMirrorLastActive(
  now: number,
  lastWriteAt: number,
  interval = PROFILE_LAST_ACTIVE_MIRROR_MS,
): boolean {
  if (lastWriteAt <= 0) return true;
  return now - lastWriteAt >= interval;
}
