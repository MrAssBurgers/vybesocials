import { getDocument, getDocuments, where, firestoreLimit } from './firestoreDb';
import type { UserProfile } from './types';

/** Migrated rows use profiles.id as doc id; user_id holds Firebase Auth uid. */
export async function getProfileByAuthUid(authUid: string): Promise<UserProfile | null> {
  if (!authUid) return null;

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
      if (profile?.id) map.set(profile.id, profile);
    }),
  );

  return map;
}
