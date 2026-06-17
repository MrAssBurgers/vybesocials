import {
  getDocument,
  getDocuments,
  setDocument,
  updateDocument,
  where,
  orderBy,
  firestoreLimit,
} from './firestoreDb';
import { firebaseAuth } from './authService';
import { getProfileByAuthUid, getProfilesByIds } from './profileResolve';
import { syncProfileUsername } from './syncProfileUsername';
import type { UserProfile } from './types';

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  if (!userId) return null;

  const byId = await getDocument<UserProfile>('profiles', userId);
  if (byId) return byId;

  const byUserId = await getDocuments<UserProfile>('profiles', [
    where('user_id', '==', userId),
    firestoreLimit(1),
  ]);
  return byUserId[0] ?? null;
}

export { getProfileByAuthUid, getProfilesByIds, resolveProfileIdFromAuthUid } from './profileResolve';

export async function getUserProfileByUsername(username: string): Promise<UserProfile | null> {
  const rows = await getDocuments<UserProfile>('profiles', [
    where('username', '==', username),
    firestoreLimit(1),
  ]);
  return rows[0] ?? null;
}

export async function ensureUserProfile(
  authUserId: string,
  defaults?: Partial<UserProfile>,
): Promise<UserProfile> {
  const existing = await getProfileByAuthUid(authUserId);
  if (existing) return existing;

  const profile: UserProfile = {
    id: authUserId,
    user_id: authUserId,
    username: defaults?.username || `user_${authUserId.slice(0, 8)}`,
    display_name: defaults?.display_name ?? defaults?.username ?? null,
    avatar_url: defaults?.avatar_url ?? null,
    bio: defaults?.bio ?? '',
    onboarding_completed: defaults?.onboarding_completed ?? false,
    created_at: new Date().toISOString(),
  };

  await setDocument('profiles', authUserId, profile);
  return profile;
}

export async function updateUserProfile(
  userId: string,
  updates: Partial<UserProfile>,
): Promise<void> {
  const profile = await getProfileByAuthUid(userId);
  if (!profile?.id) throw new Error('Profile not found');

  const authUid = profile.user_id || userId;
  const { username, ...rest } = updates;

  if (username !== undefined) {
    await syncProfileUsername(authUid, String(username));
  }

  if (Object.keys(rest).length > 0) {
    await updateDocument('profiles', profile.id, rest);
  }
}

export async function isUsernameAvailable(username: string, excludeUserId?: string): Promise<boolean> {
  const rows = await getDocuments<UserProfile>('profiles', [where('username', '==', username)]);
  if (!rows.length) return true;
  if (excludeUserId && rows.every((r) => r.id === excludeUserId || r.user_id === excludeUserId)) return true;
  return false;
}

export async function getCurrentUserProfile(): Promise<UserProfile | null> {
  const { data: { user } } = await firebaseAuth.getUser();
  if (!user) return null;
  return ensureUserProfile(user.id);
}

export async function listUsers(limit = 50): Promise<UserProfile[]> {
  return getDocuments<UserProfile>('profiles', [
    orderBy('created_at', 'desc'),
    firestoreLimit(limit),
  ]);
}
