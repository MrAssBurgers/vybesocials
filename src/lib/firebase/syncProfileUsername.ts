import { updateProfile as updateFirebaseAuthProfile } from 'firebase/auth';
import { normalizeUsername } from '@/lib/username';
import { firebaseAuth } from './authService';
import { profileAccountGuard } from '@/lib/profileAccountGuard';
import { getProfileByAuthUid, syncUserAuthIndex } from './profileResolve';
import { updateDocument } from './firestoreDb';

/**
 * Persist a username change everywhere it must stay consistent:
 * profiles (Firestore), user_auth_index, and Firebase Auth displayName.
 */
export async function syncProfileUsername(
  authUserId: string,
  username: string,
  extraGuard?: () => void,
): Promise<{ profileId: string; username: string }> {
  const guard = profileAccountGuard(authUserId, extraGuard);
  const authUser = firebaseAuth.auth?.currentUser;
  if (authUser?.uid !== authUserId) throw new Error('Your account changed.');
  const normalized = normalizeUsername(username);
  if (!normalized) {
    throw new Error('Username cannot be empty');
  }

  const profile = await getProfileByAuthUid(authUserId, guard);
  guard();
  if (!profile?.id || profile.user_id !== authUserId) {
    throw new Error('Profile not found');
  }

  const now = new Date().toISOString();
  const patch = { username: normalized, updated_at: now };

  await updateDocument('profiles', profile.id, patch);

  guard();
  await syncUserAuthIndex(authUserId, profile.id, guard);
  guard();
  if (firebaseAuth.auth?.currentUser !== authUser) throw new Error('Your account changed.');
  try {
    await updateFirebaseAuthProfile(authUser, { displayName: normalized });
  } catch {
    // The checked Firestore profile remains authoritative for handles.
  }
  guard();

  return { profileId: profile.id, username: normalized };
}
