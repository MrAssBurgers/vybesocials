import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// Fail before loading Admin SDK or touching any record. No live credentials are needed.
assert.equal(process.env.GCLOUD_PROJECT, 'demo-vybe-preview');
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8280');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9199');
assert.equal(process.env.FIREBASE_STORAGE_EMULATOR_HOST, '127.0.0.1:9399');
const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
initializeApp({ projectId: 'demo-vybe-preview', storageBucket: 'demo-vybe-preview.appspot.com' });
const auth = getAuth(); const db = getFirestore();
const now = new Date().toISOString();
// Stable synthetic identities. Reruns preserve existing authored demo content and balances.
for (const name of ['alice', 'bob']) {
  const uid = `preview-${name}`; const profileId = `preview-profile-${name}`;
  const existing = await auth.getUser(uid).catch(error => { if (error.code === 'auth/user-not-found') return null; throw error; });
  if (!existing) await auth.createUser({ uid, email: `${name}@vybe.test`, password: 'Vybe-local-preview-only-2026!', emailVerified: true, displayName: `Preview ${name}` });
  const profile = db.doc(`profiles/${profileId}`);
  if (!(await profile.get()).exists) await profile.create({
    id: profileId, user_id: uid, username: `preview_${name}`, display_name: `Preview ${name}`, bio: 'Synthetic local test account',
    created_at: now, onboarding_completed: true, tutorial_completed: true, intro_completed: true, is_private: false,
    avatar_url: null, equipped_profile_theme: null, equipped_frame: null, status: 'online',
  });
  await db.doc(`user_auth_index/${uid}`).set({ profile_id: profileId });
  const wallet = db.doc(`token_wallets/${uid}`);
  if (!(await wallet.get()).exists) await wallet.create({ schema_version: 1, id: uid, user_id: uid, balance: 1000, lifetime_earned: 1000, lifetime_spent: 0, updated_at: now });
  const settings = db.doc(`user_2fa_settings/${uid}`);
  if (!(await settings.get()).exists) await settings.create({ user_id: uid, email_2fa_enabled: false });
}
const game = db.doc('game_integrations/preview-game');
if (!(await game.get()).exists) await game.create({ enabled: true, display_name: 'Preview Game', max_upload_bytes: 48 * 1024 * 1024 });
console.log('Local demo accounts ready: alice@vybe.test and bob@vybe.test. Password: Vybe-local-preview-only-2026! (emulator only).');
await db.terminate();
