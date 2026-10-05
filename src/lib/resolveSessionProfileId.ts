import { getCachedCurrentProfile, getCachedProfile, setCachedCurrentProfile, type CachedProfile } from '@/lib/profileCache';
import { getProfileByAuthUid } from '@/lib/firebase/users';
import { reportAccountSnapshot, type ReportAccountSession } from '@/lib/reportModerationService';
import { withTimeout } from '@/lib/withTimeout';

let generation = 0;
let memo: { uid: string; epoch: number; profileId: string } | undefined;
let inflight: { uid: string; epoch: number; generation: number; promise: Promise<string | undefined> } | undefined;
const RESOLVE_TIMEOUT_MS = 2500;

/** Cached identity is usable only when its owner matches the live Firebase account. */
export function syncSessionProfileId(liveProfileId?: string | null): string | undefined {
  const { uid } = reportAccountSnapshot();
  if (!uid) return undefined;
  const current = getCachedCurrentProfile();
  const cached = liveProfileId ? getCachedProfile(liveProfileId) ?? (current?.id === liveProfileId ? current : null) : current;
  return cached?.user_id === uid ? cached.id : undefined;
}

function sameSession(expected: ReportAccountSession): boolean {
  const current = reportAccountSnapshot();
  return current.uid === expected.uid && current.epoch === expected.epoch;
}

/** Bounded account-scoped lookup. A timeout or retired account never guesses a profile ID. */
export async function resolveSessionProfileId(liveProfileId?: string | null): Promise<string | undefined> {
  const session = reportAccountSnapshot();
  const uid = session.uid;
  if (!uid) return undefined;
  const cached = syncSessionProfileId(liveProfileId);
  if (cached) return cached;
  if (memo?.uid === uid && memo.epoch === session.epoch) return memo.profileId;
  if (inflight?.uid === uid && inflight.epoch === session.epoch && inflight.generation === generation) return inflight.promise;

  const startedGeneration = generation;
  let active = true;
  const guard = () => {
    if (!active || generation !== startedGeneration || !sameSession(session)) throw new Error('Profile lookup expired.');
  };
  const readOwnedProfile = async () => {
    guard();
    const profile = await getProfileByAuthUid(uid);
    guard();
    if (profile && (!profile.id || profile.user_id !== uid)) throw new Error('Profile ownership could not be verified.');
    return profile;
  };
  const attempt = { uid, epoch: session.epoch, generation: startedGeneration, promise: undefined as unknown as Promise<string | undefined> };
  attempt.promise = (async () => {
    try {
      // Provisioning belongs to explicit authentication bootstrap. A shared read
      // must not launch account mutations that can outlive this lookup's guard.
      const profile = await withTimeout(readOwnedProfile(), RESOLVE_TIMEOUT_MS, 'Profile lookup timed out.');
      guard();
      if (!profile) return undefined;
      const payload: CachedProfile = {
        id: profile.id, user_id: uid, username: profile.username || '',
        display_name: profile.display_name ?? null, avatar_url: profile.avatar_url ?? null,
      };
      memo = { uid, epoch: session.epoch, profileId: profile.id };
      setCachedCurrentProfile(payload);
      return profile.id;
    } catch {
      return undefined;
    } finally {
      active = false;
      // An older attempt must not erase a newer account's pending lookup.
      if (inflight === attempt) inflight = undefined;
    }
  })();
  inflight = attempt;
  return attempt.promise;
}

/** Invalidates both memoized results and already-dispatched asynchronous work. */
export function resetSessionProfileMemo(): void {
  generation += 1;
  memo = undefined;
  inflight = undefined;
}

export async function resolveStoryAuthorProfileId(liveProfileId?: string | null): Promise<string> {
  const id = await resolveSessionProfileId(liveProfileId);
  if (!id) throw new Error('Could not load your profile. Please retry before sharing.');
  return id;
}
