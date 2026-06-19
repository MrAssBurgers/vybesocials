import { db } from '@/lib/firebase';
import {
  getEffectiveProfileId,
  setCachedCurrentProfile,
  type CachedProfile,
} from '@/lib/profileCache';
import { getProfileByAuthUid } from '@/lib/firebase/users';

let memoAuthUserId: string | null = null;
let memoProfileId: string | null = null;
let inflight: Promise<string | undefined> | null = null;

/** Sync profile id — live auth state or disk cache (instant). */
export function syncSessionProfileId(liveProfileId?: string | null): string | undefined {
  return getEffectiveProfileId(liveProfileId);
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
      await db.rpc('claim_profile_by_email');

      let profile = await getProfileByAuthUid(authUserId);
      if (!profile?.id) {
        await db.rpc('ensure_profile');
        profile = await getProfileByAuthUid(authUserId);
      }
      if (!profile?.id) return undefined;

      memoAuthUserId = authUserId;
      memoProfileId = profile.id;

      const payload: CachedProfile = {
        id: profile.id,
        user_id: profile.user_id,
        username: profile.username,
        display_name: profile.display_name,
        avatar_url: profile.avatar_url,
      };
      setCachedCurrentProfile(payload);
      return profile.id;
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
