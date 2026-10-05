import { setDocument } from '@/lib/firebase/firestoreDb';
import { profileAccountGuard } from './profileAccountGuard';

export async function savePrivateProfileDateOfBirth(opts: {
  profileId: string;
  authUid: string;
  dateOfBirth: string;
}, extraGuard?: () => void): Promise<void> {
  const { profileId, authUid, dateOfBirth } = opts;
  const guard = profileAccountGuard(authUid, extraGuard);
  if (!profileId || profileId.includes('/') || !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
    throw new Error('Check your birthday and try again.');
  }

  guard();
  await setDocument('profile_private', profileId, {
    id: profileId,
    profile_id: profileId,
    user_id: authUid,
    date_of_birth: dateOfBirth,
  });
  guard();
}
