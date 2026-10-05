import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

// A ready game capture grants no raw browser publication authority.
const projectId = process.env.GCLOUD_PROJECT;
assert.match(projectId || '', /^demo-/); assert.notEqual(projectId, 'demo-vybe-preview');
assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):\d+$/);
const require = createRequire(path.resolve(process.env.FIREBASE_TEST_TOOLS_ROOT || '.', 'package.json'));
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc, deleteDoc, setLogLevel } = require('firebase/firestore'); setLogLevel('silent');
const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
const env = await initializeTestEnvironment({ projectId, firestore: { host, port: Number(port), rules: await readFile('firestore.rules', 'utf8') } });
let checks = 0;
async function denied(label, fn) { await assertFails(fn()); checks++; console.log(`PASS ${label}`); }
const captureId = 'a'.repeat(48), postId = `game_${captureId}`;
try {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context => {
    const admin = context.firestore();
    await setDoc(doc(admin, 'profiles', 'capture-profile'), { user_id: 'capture-alice' });
    await setDoc(doc(admin, 'user_auth_index', 'capture-alice'), { profile_id: 'capture-profile' });
    await setDoc(doc(admin, 'game_captures', captureId), { owner_uid: 'capture-alice', status: 'ready', expires_at_ms: Date.now() + 60000 });
    await setDoc(doc(admin, 'posts', postId), { id: postId, author_id: 'capture-profile', game_capture_id: captureId, caption: 'Synthetic existing game post' });
  });
  const owner = env.authenticatedContext('capture-alice').firestore();
  await assertSucceeds(getDoc(doc(owner, 'posts', postId))); checks++;
  for (const [name, client] of [['owner', owner], ['other', env.authenticatedContext('capture-bob').firestore()], ['guest', env.unauthenticatedContext().firestore()]]) {
    await denied(`${name} cannot create a raw game post despite a ready capture`, () => setDoc(doc(client, 'posts', `game_${'b'.repeat(48)}`), { author_id: 'capture-profile', game_capture_id: captureId }));
    await denied(`${name} cannot change a published capture`, () => updateDoc(doc(client, 'posts', postId), { caption: 'Changed' }));
    await denied(`${name} cannot directly delete a publication`, () => deleteDoc(doc(client, 'posts', postId)));
    await denied(`${name} cannot fabricate a publication proof`, () => setDoc(doc(client, '_post_publications', postId), { status: 'published', owner_uid: 'capture-alice' }));
  }
  console.log(`Game capture publication rules: ${checks} checks passed; managed publication is covered by test-post-publication-backend.mjs.`);
} finally { await env.cleanup(); }
