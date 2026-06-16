import { db } from '@/lib/firebase';
import { getRecentMessageUsers, type RecentMessageUser } from '@/lib/recentMessageUsers';

export type QuickShareTarget = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};

const CACHE_KEY = 'vybe_quick_share_targets_v1';
const CACHE_TTL = 10 * 60 * 1000; // 10 min

interface CacheEntry {
  ts: number;
  ownerId: string;
  targets: QuickShareTarget[];
}

function readCache(ownerId: string): QuickShareTarget[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry;
    if (parsed.ownerId !== ownerId) return null;
    if (Date.now() - parsed.ts > CACHE_TTL) return null;
    return parsed.targets;
  } catch {
    return null;
  }
}

function writeCache(ownerId: string, targets: QuickShareTarget[]) {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ ts: Date.now(), ownerId, targets } satisfies CacheEntry),
    );
  } catch {}
}

/**
 * Returns up to 4 friends to surface in the hold-to-share quick menu.
 * Source priority:
 *  1. Top share-recency user IDs
 *  2. Recently messaged users (already cached locally with full profile)
 *  3. Fallback: any accepted friends from DB
 *
 * Hydrates missing profile fields with a single profiles select.
 */
export async function getQuickShareTargets(
  ownerProfileId: string,
  limit = 4,
): Promise<QuickShareTarget[]> {
  if (!ownerProfileId) return [];

  // Pull top share-recency IDs from local store, fall back to recent DM users.
  const { getShareRankedUserIds } = await import('@/lib/shareRecency');
  const rankedIds = getShareRankedUserIds().filter((id) => id !== ownerProfileId);
  const recent: RecentMessageUser[] = getRecentMessageUsers().filter(
    (u) => u.id !== ownerProfileId,
  );

  // Merge in priority order, dedupe.
  const orderedIds: string[] = [];
  const seen = new Set<string>();
  for (const id of rankedIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    orderedIds.push(id);
    if (orderedIds.length >= limit) break;
  }
  for (const u of recent) {
    if (orderedIds.length >= limit) break;
    if (seen.has(u.id)) continue;
    seen.add(u.id);
    orderedIds.push(u.id);
  }

  // Build initial result from cached recent profiles (no network).
  const recentMap = new Map(recent.map((u) => [u.id, u]));
  let result: QuickShareTarget[] = orderedIds
    .map((id) => recentMap.get(id))
    .filter((u): u is RecentMessageUser => !!u)
    .map((u) => ({
      id: u.id,
      username: u.username,
      display_name: u.display_name,
      avatar_url: u.avatar_url,
    }));

  // Try cache before hitting DB.
  if (result.length < limit) {
    const cached = readCache(ownerProfileId);
    if (cached) {
      for (const t of cached) {
        if (result.length >= limit) break;
        if (!result.find((r) => r.id === t.id)) result.push(t);
      }
    }
  }

  // Hydrate remaining IDs we don't have profiles for.
  const missingIds = orderedIds.filter((id) => !result.find((r) => r.id === id));
  if (missingIds.length > 0) {
    const { data } = await db
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .in('id', missingIds);
    if (data) {
      for (const id of missingIds) {
        const row = data.find((d) => d.id === id);
        if (row && !result.find((r) => r.id === row.id)) {
          result.push(row as QuickShareTarget);
        }
      }
    }
  }

  // Final fallback: pull any accepted friends so first-time users still see something.
  if (result.length < limit) {
    try {
      const [{ data: asSender }, { data: asReceiver }] = await Promise.all([
        db
          .from('friend_requests')
          .select('receiver:profiles!receiver_id(id, username, display_name, avatar_url)')
          .eq('sender_id', ownerProfileId)
          .eq('status', 'accepted')
          .limit(limit),
        db
          .from('friend_requests')
          .select('sender:profiles!sender_id(id, username, display_name, avatar_url)')
          .eq('receiver_id', ownerProfileId)
          .eq('status', 'accepted')
          .limit(limit),
      ]);
      const friends: QuickShareTarget[] = [
        ...((asSender || []).map((r: any) => r.receiver).filter(Boolean)),
        ...((asReceiver || []).map((r: any) => r.sender).filter(Boolean)),
      ];
      for (const f of friends) {
        if (result.length >= limit) break;
        if (!result.find((r) => r.id === f.id)) result.push(f);
      }
    } catch {
      // best-effort
    }
  }

  result = result.slice(0, limit);
  if (result.length > 0) writeCache(ownerProfileId, result);
  return result;
}
