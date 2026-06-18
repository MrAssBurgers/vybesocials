import { auth, db } from './admin.js';
import type { DocumentData } from 'firebase-admin/firestore';

const FOUNDER_EMAIL = 'barron.bakic@gmail.com';
const FOUNDER_USERNAMES = new Set(['mrassburgers', 'bakrix']);

function isPlaceholderUsername(username: unknown): boolean {
  if (typeof username !== 'string') return true;
  const u = username.trim().toLowerCase();
  return !u || u.startsWith('user_');
}

/**
 * Links the signed-in Firebase Auth user to an existing Firestore profile by email
 * (Google/Apple OAuth creates a new uid — migrated DMs/posts live on profiles.id).
 */
export async function claimProfileByEmailForUid(authUid: string): Promise<{
  profileId: string | null;
  claimed: boolean;
}> {
  const userRecord = await auth.getUser(authUid);
  const email = userRecord.email?.trim().toLowerCase() || '';
  if (!email) return { profileId: null, claimed: false };

  const indexSnap = await db.collection('user_auth_index').doc(authUid).get();
  if (indexSnap.exists) {
    const profileId = String(indexSnap.data()?.profile_id || '');
    return { profileId: profileId || null, claimed: false };
  }

  const byUserId = await db.collection('profiles').where('user_id', '==', authUid).limit(1).get();
  if (!byUserId.empty) {
    const profileId = byUserId.docs[0]!.id;
    await writeAuthIndex(authUid, profileId, byUserId.docs[0]!.data(), email);
    return { profileId, claimed: false };
  }

  let profileDoc = (await db.collection('profiles').where('email', '==', email).limit(5).get()).docs[0];

  if (!profileDoc && email === FOUNDER_EMAIL) {
    for (const username of FOUNDER_USERNAMES) {
      const snap = await db.collection('profiles').where('username', '==', username).limit(1).get();
      if (!snap.empty) {
        profileDoc = snap.docs[0];
        break;
      }
    }
  }

  if (!profileDoc) return { profileId: null, claimed: false };

  const profileId = profileDoc.id;
  const profileData = profileDoc.data();
  const existingAuthUid = profileData.user_id as string | undefined;

  if (existingAuthUid && existingAuthUid !== authUid && existingAuthUid !== profileId) {
    try {
      await auth.getUser(existingAuthUid);
      return { profileId: null, claimed: false };
    } catch {
      /* stale / deleted auth user — safe to reclaim */
    }
  }

  await db.collection('profiles').doc(profileId).set(
    {
      user_id: authUid,
      email,
      updated_at: new Date().toISOString(),
    },
    { merge: true },
  );

  await writeAuthIndex(authUid, profileId, profileData, email);

  const orphan = await db.collection('profiles').doc(authUid).get();
  if (orphan.exists && orphan.id !== profileId && isPlaceholderUsername(orphan.data()?.username)) {
    await db.collection('profiles').doc(authUid).delete();
  }

  return { profileId, claimed: true };
}

async function writeAuthIndex(
  authUid: string,
  profileId: string,
  profileData: DocumentData,
  email: string,
): Promise<void> {
  await db.collection('user_auth_index').doc(authUid).set({
    profile_id: profileId,
    username: (profileData.username as string) || null,
    email,
    updated_at: new Date().toISOString(),
  });
}
