import { db } from '@/lib/firebase';
import {
  getEffectiveProfileId,
  setCachedCurrentProfile,
  type CachedProfile,
} from '@/lib/profileCache';
import { getProfileByAuthUid } from '@/lib/firebase/users';
import { syncUserAuthIndex } from '@/lib/firebase/profileResolve';
import { withTimeout } from '@/lib/withTimeout';

let memoAuthUserId: string | null = null;
let memoProfileId: string | null = null;
let inflight: Promise<string | undefined> | null = null;

const RESOLVE_TIMEOUT_MS = 2500;

/** Sync profile id — live auth state or disk cache (instant). */
export function syncSessionProfileId(liveProfileId?: string | null): string | undefined {
  return getEffectiveProfileId(liveProfileId);
}

function looksPlaceholder(
  profile: { id?: string; username?: string | null } | null | undefined,
  authUserId: string,
): boolean {
  if (!profile?.id) return true;
  return (
    profile.id === authUserId ||
    !profile.username ||
    String(profile.username).startsWith('user_')
  );
}

function cacheResolvedProfile(authUserId: string, profile: {
  id: string;
  user_id?: string;
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
}): string {
  memoAuthUserId = authUserId;
  memoProfileId = profile.id;
  void syncUserAuthIndex(authUserId, profile.id);
  const payload: CachedProfile = {
    id: profile.id,
    user_id: profile.user_id,
    username: profile.username || '',
    display_name: profile.display_name ?? null,
    avatar_url: profile.avatar_url ?? null,
  };
  setCachedCurrentProfile(payload);
  return profile.id;
}

/** One session-scoped profile lookup; deduped across DMs/messages/chat. */
export async function resolveSessionProfileId(
  liveProfileId?: string | null,
): Promise<string | undefined> {
  const cached = getEffectiveProfileId(liveProfileId);
  if (cached) return cached;

  const { data: { session } } = await db.auth.getSession();
  const authUserId = session?.user?.id;
  if (!authUserId) return undefined;

  if (memoAuthUserId === authUserId && memoProfileId) return memoProfileId;

  if (inflight) return inflight;

  inflight = (async () => {
    try {
      // Fast Firestore hit first — return usable non-placeholder without waiting on claim.
      let profile = await getProfileByAuthUid(authUserId);
      if (profile?.id && !looksPlaceholder(profile, authUserId)) {
        return cacheResolvedProfile(authUserId, profile);
      }

      // Claim/ensure raced against timeout so a hung callable cannot poison opens.
      const claimedOrEnsured = await withTimeout(
        (async () => {
          if (!profile?.id || looksPlaceholder(profile, authUserId)) {
            await db.rpc('claim_profile_by_email').catch(() => undefined);
            const claimed = await getProfileByAuthUid(authUserId);
            if (claimed?.id) profile = claimed;
          }
          if (!profile?.id) {
            await db.rpc('ensure_profile').catch(() => undefined);
            profile = await getProfileByAuthUid(authUserId);
          }
          return profile;
        })(),
        RESOLVE_TIMEOUT_MS,
        'resolveSessionProfileId timed out',
      ).catch(() => profile);

      if (!claimedOrEnsured?.id) {
        // Prefer returning a placeholder id over blocking forever.
        if (profile?.id) return cacheResolvedProfile(authUserId, profile);
        return undefined;
      }

      return cacheResolvedProfile(authUserId, claimedOrEnsured);
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/** Clear memo when auth user changes (call from AuthProvider if needed). */
export function resetSessionProfileMemo(): void {
  memoAuthUserId = null;
  memoProfileId = null;
  inflight = null;
}

/** Resolve profile id for story publish — creates profile row if missing. */
export async function resolveStoryAuthorProfileId(
  liveProfileId?: string | null,
): Promise<string> {
  let id = getEffectiveProfileId(liveProfileId) ?? (await resolveSessionProfileId(liveProfileId));
  if (id) return id;

  const { error } = await db.rpc('ensure_profile');
  if (error) {
    await db.rpc('claim_profile_by_email');
  }

  id = await resolveSessionProfileId(liveProfileId);
  if (!id) {
    throw new Error('Could not load your profile. Sign out and back in, then try again.');
  }
  return id;
}
