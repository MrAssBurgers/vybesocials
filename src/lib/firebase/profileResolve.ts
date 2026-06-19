import { getDocument, getDocuments, where, firestoreLimit } from './firestoreDb';
import type { UserProfile } from './types';

type AuthIndexRow = { profile_id?: string };

/** Migrated rows use profiles.id as doc id; user_auth_index maps auth uid → profile id. */
export async function getProfileByAuthUid(authUid: string): Promise<UserProfile | null> {
  if (!authUid) return null;

  const index = await getDocument<AuthIndexRow>('user_auth_index', authUid);
  if (index?.profile_id) {
    const byIndex = await getDocument<UserProfile>('profiles', index.profile_id);
    if (byIndex) return byIndex;
  }

  const byUserId = await getDocuments<UserProfile>('profiles', [
    where('user_id', '==', authUid),
    firestoreLimit(1),
  ]);
  if (byUserId[0]) return byUserId[0];

  return getDocument<UserProfile>('profiles', authUid);
}

export async function resolveProfileIdFromAuthUid(authUid: string): Promise<string | null> {
  const profile = await getProfileByAuthUid(authUid);
  return profile?.id ?? null;
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
