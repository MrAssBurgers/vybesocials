import {
  getDocument,
  getDocuments,
  setDocument,
  updateDocument,
  query,
  where,
  orderBy,
  firestoreLimit,
} from './firestoreDb';
import { firebaseAuth } from './authService';
import type { UserProfile } from './types';

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  return getDocument<UserProfile>('profiles', userId);
}

export async function getUserProfileByUsername(username: string): Promise<UserProfile | null> {
  const rows = await getDocuments<UserProfile>('profiles', [
    where('username', '==', username),
    firestoreLimit(1),
  ]);
  return rows[0] ?? null;
}

export async function ensureUserProfile(
  userId: string,
  defaults?: Partial<UserProfile>,
): Promise<UserProfile> {
  const existing = await getUserProfile(userId);
  if (existing) return existing;

  const profile: UserProfile = {
    id: userId,
    user_id: userId,
    username: defaults?.username || `user_${userId.slice(0, 8)}`,
    display_name: defaults?.display_name ?? defaults?.username ?? null,
    avatar_url: defaults?.avatar_url ?? null,
    bio: defaults?.bio ?? '',
    onboarding_completed: defaults?.onboarding_completed ?? false,
    created_at: new Date().toISOString(),
  };

  await setDocument('profiles', userId, profile);
  return profile;
}

export async function updateUserProfile(
  userId: string,
  updates: Partial<UserProfile>,
): Promise<void> {
  await updateDocument('profiles', userId, updates);
}

export async function isUsernameAvailable(username: string, excludeUserId?: string): Promise<boolean> {
  const rows = await getDocuments<UserProfile>('profiles', [where('username', '==', username)]);
  if (!rows.length) return true;
  if (excludeUserId && rows.every((r) => r.id === excludeUserId)) return true;
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
