import {
  getDocument,
  getDocuments,
  updateDocument,
  where,
  orderBy,
  firestoreLimit,
} from './firestoreDb';
import { profileAccountGuard } from '@/lib/profileAccountGuard';
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
  const trimmed = username.trim();
  if (!trimmed) return null;

  const exact = await getDocuments<UserProfile>('profiles', [
    where('username', '==', trimmed),
    firestoreLimit(1),
  ]);
  if (exact[0]) return exact[0];

  const lower = trimmed.toLowerCase();
  if (lower !== trimmed) {
    const ci = await getDocuments<UserProfile>('profiles', [
      where('username', '==', lower),
      firestoreLimit(1),
    ]);
    if (ci[0]) return ci[0];
  }

  return null;
}

export async function ensureUserProfile(
  authUserId: string,
  defaults?: Partial<UserProfile>,
  extraGuard?: () => void,
): Promise<UserProfile> {
  const guard = profileAccountGuard(authUserId, extraGuard);
  const { provisionAccountProfile } = await import('@/lib/accountProfileService');
  guard();
  const result = await provisionAccountProfile(authUserId, { defaults: defaults ? {
    ...(defaults.username !== undefined ? { username: defaults.username } : {}),
    ...(defaults.display_name != null ? { displayName: defaults.display_name } : {}),
    ...(defaults.avatar_url !== undefined ? { avatarUrl: defaults.avatar_url } : {}),
    ...(defaults.bio !== undefined ? { bio: defaults.bio } : {}),
    ...(defaults.onboarding_completed === false ? { onboardingCompleted: false as const } : {}),
  } : undefined }, guard);
  guard();
  return result.profile;
}

export async function updateUserProfile(userId: string, updates: Partial<UserProfile> & { first_name?: string; last_name?: string; link_url?: string; location?: string }, extraGuard?: () => void): Promise<void> {
  const guard = profileAccountGuard(userId, extraGuard);
  if (['id', 'user_id', 'created_at'].some(key => key in updates)) throw new Error('Profile ownership cannot be changed here.');
  const profile = await getProfileByAuthUid(userId, guard);
  guard();
  if (!profile?.id || profile.user_id !== userId) throw new Error('Profile not found');
  const { username, ...rest } = updates;
  if (username !== undefined) {
    await syncProfileUsername(userId, String(username), guard);
    guard();
  }
  if (Object.keys(rest).length > 0) {
    guard();
    await updateDocument('profiles', profile.id, rest);
    guard();
  }
}

export async function isUsernameAvailable(username: string, excludeUserId?: string): Promise<boolean> {
  const rows = await getDocuments<UserProfile>('profiles', [where('username', '==', username)]);
  if (!rows.length) return true;
  if (excludeUserId && rows.every((r) => r.id === excludeUserId || r.user_id === excludeUserId)) return true;
  return false;
}

export async function getCurrentUserProfile(): Promise<UserProfile | null> {
  const uid = firebaseAuth.auth?.currentUser?.uid;
  if (!uid) return null;
  const guard = profileAccountGuard(uid);
  return getProfileByAuthUid(uid, guard);
}

export async function listUsers(limit = 50): Promise<UserProfile[]> {
  return getDocuments<UserProfile>('profiles', [
    orderBy('created_at', 'desc'),
    firestoreLimit(limit),
  ]);
}
