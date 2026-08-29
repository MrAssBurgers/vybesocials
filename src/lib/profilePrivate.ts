import { db } from '@/lib/firebase';

export async function savePrivateProfileDateOfBirth(opts: {
  profileId: string;
  authUid: string;
  dateOfBirth: string;
}): Promise<void> {
  const { profileId, authUid, dateOfBirth } = opts;
  if (!profileId || !authUid || !dateOfBirth) return;

  const { error } = await db.from('profile_private').upsert({
    id: profileId,
    profile_id: profileId,
    user_id: authUid,
    date_of_birth: dateOfBirth,
  });
  if (error) {
    throw new Error(error.message || 'Could not save private profile details');
  }
}
