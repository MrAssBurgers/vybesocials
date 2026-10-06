import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { seedPostPublication } from '../../scripts/helpers/post-publication-fixture.mjs';

const projectId = process.env.GCLOUD_PROJECT;
assert.match(projectId || '', /^demo-[a-z0-9-]+$/);
assert.notEqual(projectId, 'demo-vybe-preview');
assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):\d+$/);
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId });
const require = createRequire(path.resolve(process.env.FIREBASE_TEST_TOOLS_ROOT || '.', 'package.json'));
const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');
const { db } = await import('../lib/_shared/admin.js');
const { readSocialFeedPage } = await import('../lib/_shared/socialFeedAuthority.js');
const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
const env = await initializeTestEnvironment({ projectId, firestore: { host, port: Number(port), rules: 'rules_version = "2"; service cloud.firestore { match /databases/{database}/documents { match /{document=**} { allow read, write: if false; } } }' } });
const viewer = { uid: 'parallel-viewer', profileId: 'parallel-viewer-profile' };
const author = { uid: 'parallel-author', profileId: 'parallel-author-profile' };
try {
  await env.clearFirestore();
  for (const who of [viewer, author]) {
    await db.doc(`profiles/${who.profileId}`).set({ user_id: who.uid, username: who.uid, is_private: false });
    await db.doc(`user_auth_index/${who.uid}`).set({ profile_id: who.profileId });
  }
  for (const id of ['a', 'b', 'c']) await seedPostPublication(db, id, { author_id: author.profileId, type: 'post', caption: id,
    created_at: '2026-10-06T12:00:00.000Z', media_url: '', age_rating: 'safe', visibility: 'public' }, author);
  const started = new Set();
  let authorChecks = 0, release;
  const barrier = new Promise(resolve => { release = resolve; });
  let deadline;
  const expired = new Promise((_, reject) => { deadline = setTimeout(() => reject(new Error('Publication reads still wait for earlier posts.')), 3000); });
  const bind = (target, key) => typeof target[key] === 'function' ? target[key].bind(target) : target[key];
  const measuredDb = new Proxy(db, { get(target, key) {
    if (key !== 'runTransaction') return bind(target, key);
    return callback => target.runTransaction(tx => callback(new Proxy(tx, { get(transaction, method) {
      if (method !== 'get') return bind(transaction, method);
      return async ref => {
        if (ref.path === `profile_visibility/${author.profileId}`) authorChecks++;
        if (ref.path?.startsWith('_post_publications/')) {
          started.add(ref.id);
          if (started.size === 3) release();
          await Promise.race([barrier, expired]);
        }
        return transaction.get(ref);
      };
    } })));
  } });
  let result;
  try { result = await readSocialFeedPage(measuredDb, viewer.uid, { expectedOwnerUid: viewer.uid, expectedProfileId: viewer.profileId }); }
  finally { clearTimeout(deadline); }
  assert.equal(started.size, 3);
  assert.equal(authorChecks, 1, 'Repeated authors share a checked admission.');
  assert.deepEqual(result.posts.map(post => post.id), ['c', 'b', 'a'], 'Parallel completion preserves feed order.');
  console.log('PASS independent post publication reads start together, share author checks, preserve order');

  await db.doc('blocked_users/parallel-block').set({ blocker_id: author.profileId, blocked_id: viewer.profileId });
  const denied = await readSocialFeedPage(db, viewer.uid, { expectedOwnerUid: viewer.uid, expectedProfileId: viewer.profileId });
  assert.deepEqual(denied.posts, []);
  console.log('PASS blocked author posts remain excluded');
} finally { await env.cleanup(); await db.terminate(); }
