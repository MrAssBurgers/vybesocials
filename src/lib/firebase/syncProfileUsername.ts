import { updateProfile as updateFirebaseAuthProfile } from 'firebase/auth';
import { normalizeUsername } from '@/lib/username';
import { firebaseAuth } from './authService';
import { getProfileByAuthUid } from './profileResolve';
import { setDocument, updateDocument } from './firestoreDb';

/**
 * Persist a username change everywhere it must stay consistent:
 * profiles (Firestore), user_auth_index, and Firebase Auth displayName.
 */
export async function syncProfileUsername(
  authUserId: string,
  username: string,
): Promise<{ profileId: string; username: string }> {
  const normalized = normalizeUsername(username);
  if (!normalized) {
    throw new Error('Username cannot be empty');
  }

  const profile = await getProfileByAuthUid(authUserId);
  if (!profile?.id) {
    throw new Error('Profile not found');
  }

  const now = new Date().toISOString();
  const patch = { username: normalized, updated_at: now };

  await updateDocument('profiles', profile.id, patch);

  await setDocument(
    'user_auth_index',
    authUserId,
    {
      profile_id: profile.id,
      username: normalized,
      updated_at: now,
    },
    true,
  );

  const auth = firebaseAuth.auth;
  if (auth?.currentUser) {
    try {
      await updateFirebaseAuthProfile(auth.currentUser, { displayName: normalized });
    } catch {
      // Non-fatal — Firestore is source of truth for @handles.
    }
  }

  return { profileId: profile.id, username: normalized };
}
