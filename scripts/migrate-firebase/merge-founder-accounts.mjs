#!/usr/bin/env node
/**
 * Merge duplicate founder Firebase accounts into mrassburgers (live data).
 *
 * mrassburgers profile: e78010f2-d5f1-428b-b5df-8fc6b768772d
 * mrassburgers auth:    703760a8-1245-4fc1-b242-32619ecc0ef3
 *
 * Removes empty bakrix / user_oxzzxoce duplicates; attaches barron.bakic@gmail.com
 * to the mrassburgers auth user. User must Forgot password once after merge.
 */
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

if (!getApps().length) initializeApp();
const db = getFirestore();
const auth = getAuth();

const MRASS_PROFILE_ID = 'e78010f2-d5f1-428b-b5df-8fc6b768772d';
const MRASS_AUTH_UID = '703760a8-1245-4fc1-b242-32619ecc0ef3';
const BAKRIX_AUTH_UID = '53e0076d-5163-46f5-b711-a58a03393744';
const OXZZ_AUTH_UID = 'oXZZXoceCdOaCKekqNrDhCfJ90M2';
const FOUNDER_EMAIL = 'barron.bakic@gmail.com';

async function main() {
  const mrassProf = await db.collection('profiles').doc(MRASS_PROFILE_ID).get();
  if (!mrassProf.exists) throw new Error('mrassburgers profile missing');

  const bakrixProf = await db.collection('profiles').doc(BAKRIX_AUTH_UID).get();
  const mergeFields = {};
  if (bakrixProf.exists) {
    const b = bakrixProf.data();
    if (!mrassProf.data()?.email && b.email) mergeFields.email = b.email;
    if (!mrassProf.data()?.onboarding_completed && b.onboarding_completed) {
      mergeFields.onboarding_completed = true;
    }
    if (!mrassProf.data()?.tutorial_completed && b.tutorial_completed) {
      mergeFields.tutorial_completed = true;
    }
  }

  // Free email on duplicate auth users, then delete them.
  for (const uid of [BAKRIX_AUTH_UID, OXZZ_AUTH_UID]) {
    try {
      await auth.getUser(uid);
      await auth.updateUser(uid, { email: `deleted+${uid.slice(0, 8)}@vybehub.app` });
      await auth.deleteUser(uid);
      console.log(`[auth] deleted duplicate ${uid}`);
    } catch (e) {
      if (e.code !== 'auth/user-not-found') throw e;
      console.log(`[auth] already gone ${uid}`);
    }
  }

  await auth.updateUser(MRASS_AUTH_UID, {
    email: FOUNDER_EMAIL,
    emailVerified: true,
    displayName: 'MrAssBurgers',
  });
  console.log('[auth] mrassburgers auth linked to', FOUNDER_EMAIL);

  await db.collection('profiles').doc(MRASS_PROFILE_ID).set(
    {
      ...mergeFields,
      email: FOUNDER_EMAIL,
      username: 'mrassburgers',
      display_name: mrassProf.data()?.display_name?.trim() || 'MrAssBurgers',
      user_id: MRASS_AUTH_UID,
      updated_at: new Date().toISOString(),
    },
    { merge: true },
  );
  console.log('[profile] mrassburgers updated');

  for (const pid of [BAKRIX_AUTH_UID, OXZZ_AUTH_UID]) {
    const ref = db.collection('profiles').doc(pid);
    if ((await ref.get()).exists) {
      await ref.delete();
      console.log('[profile] deleted empty duplicate', pid);
    }
  }

  await db.collection('user_auth_index').doc(MRASS_AUTH_UID).set({
    profile_id: MRASS_PROFILE_ID,
    username: 'mrassburgers',
    email: FOUNDER_EMAIL,
    updated_at: new Date().toISOString(),
  });

  for (const stale of [BAKRIX_AUTH_UID, OXZZ_AUTH_UID]) {
    const ref = db.collection('user_auth_index').doc(stale);
    if ((await ref.get()).exists) await ref.delete();
  }

  // Owner roles on mrassburgers profile id
  const now = new Date().toISOString();
  for (const table of ['user_roles', 'user_roles_auth']) {
    await db.collection(table).doc(`${MRASS_PROFILE_ID}_owner`).set({
      id: `${MRASS_PROFILE_ID}_owner`,
      user_id: MRASS_PROFILE_ID,
      role: 'owner',
      created_at: now,
    }, { merge: true });
  }

  const mem = await db.collection('conversation_members').where('user_id', '==', MRASS_PROFILE_ID).get();
  const posts = await db.collection('posts').where('author_id', '==', MRASS_PROFILE_ID).count().get();
  console.log('[done] mrassburgers:', { dms: mem.size, posts: posts.data().count });
  console.log('Sign in with', FOUNDER_EMAIL, '→ use Forgot password to set a new password.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
