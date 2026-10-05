import { getDocument, getDocuments, getDocumentFromServer, getDocumentsFromServer, where, firestoreLimit } from './firestoreDb';
import { reportAccountSnapshot } from '@/lib/reportModerationService';
import { profileAccountGuard } from '@/lib/profileAccountGuard';
import type { UserProfile } from './types';

type AuthIndexRow = { profile_id?: string; user_id?: string; owner_uid?: string };
const conflict = () => Object.assign(new Error('Your profile needs an account ownership review.'), { code: 'failed-precondition', details: { reason: 'profile-recovery-required', recoveryAvailable: false } });

/** Read-only resolution: a legacy document ID is never evidence of Auth ownership. */
export async function getProfileByAuthUid(authUid: string, extraGuard?: () => void): Promise<UserProfile | null> {
  if (!authUid || authUid.includes('/')) return null;
  const actor = reportAccountSnapshot();
  const guard = actor.uid ? profileAccountGuard(actor.uid, extraGuard) : () => { extraGuard?.(); if (reportAccountSnapshot().epoch !== actor.epoch) throw new Error('Your account changed.'); };
  const own = actor.uid === authUid;
  const index = own ? await getDocumentFromServer<AuthIndexRow>('user_auth_index', authUid) : null;
  guard();
  const rows = await getDocumentsFromServer<UserProfile>('profiles', [where('user_id', '==', authUid), firestoreLimit(2)]);
  guard();
  const direct = await getDocumentFromServer<UserProfile>('profiles', authUid);
  guard();
  if (rows.length > 1 || rows.some(row => row.user_id !== authUid) || (direct && (direct.user_id !== authUid || direct.id !== authUid))) throw conflict();
  const profile = rows[0] ?? null;
  if (direct && (!profile || profile.id !== direct.id)) throw conflict();
  if (index && (!profile || index.profile_id !== profile.id || (index.user_id !== undefined && index.user_id !== authUid) || (index.owner_uid !== undefined && index.owner_uid !== authUid))) throw conflict();
  return profile;
}

export async function resolveProfileIdFromAuthUid(authUid: string): Promise<string | null> {
  return (await getProfileByAuthUid(authUid))?.id ?? null;
}

/** Only the checked server authority may repair an existing owned index. */
export async function syncUserAuthIndex(authUid: string, profileId: string, extraGuard?: () => void): Promise<void> {
  const guard = profileAccountGuard(authUid, extraGuard);
  const { provisionAccountProfile } = await import('@/lib/accountProfileService');
  guard();
  await provisionAccountProfile(authUid, { action: 'syncIndex', expectedProfileId: profileId }, guard);
  guard();
}

export async function getProfilesByIds(ids: string[]): Promise<Map<string, UserProfile>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const map = new Map<string, UserProfile>();
  if (!unique.length) return map;

  await Promise.all(
    unique.map(async (id) => {
      const profile = await getDocument<UserProfile>('profiles', id);
      if (profile?.id) {
        map.set(profile.id, profile);
        if (profile.user_id) map.set(profile.user_id, profile);
        map.set(id, profile);
      }
    }),
  );

  const missing = unique.filter((id) => !map.has(id));
  if (missing.length) {
    for (let i = 0; i < missing.length; i += 10) {
      const chunk = missing.slice(i, i + 10);
      const rows = await getDocuments<UserProfile>('profiles', [
        where('user_id', 'in', chunk),
      ]);
      for (const profile of rows) {
        if (profile?.id) {
          map.set(profile.id, profile);
          if (profile.user_id) map.set(profile.user_id, profile);
        }
      }
    }
  }

  return map;
}
