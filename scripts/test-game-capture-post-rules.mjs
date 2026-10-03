import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

// Never fall through to production credentials or endpoints.
const projectId = process.env.GCLOUD_PROJECT || 'demo-vybe-game-posts';
assert.ok(projectId.startsWith('demo-'), 'Use a demo- project for emulator-only tests');
assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Run under firebase emulators:exec --only firestore');
const require = createRequire(path.resolve(process.env.FIREBASE_TEST_TOOLS_ROOT || '.', 'package.json'));
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc, deleteDoc, runTransaction } = require('firebase/firestore');
const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
const env = await initializeTestEnvironment({ projectId, firestore: { host, port: Number(port), rules: await readFile('firestore.rules', 'utf8') } });
let checks = 0;
async function allowed(label, fn) { await assertSucceeds(fn()); checks++; console.log(`PASS ${label}`); }
async function denied(label, fn) { await assertFails(fn()); checks++; console.log(`PASS ${label}`); }
const aliceDb = env.authenticatedContext('capture-alice').firestore();
const bobDb = env.authenticatedContext('capture-bob').firestore();
const guestDb = env.unauthenticatedContext().firestore();
const aliceLegacyDb = env.authenticatedContext('capture-legacy').firestore();
const id = 'a'.repeat(48);
const postId = `game_${id}`;
const payload = (author = 'capture-alice', captureId = id) => ({ id: `game_${captureId}`, author_id: author, game_capture_id: captureId, type: 'post', caption: 'A game capture', media_url: 'gs://demo-vybe-game-posts/media/test.png', created_at: new Date().toISOString() });
async function seedCapture(captureId = id, changes = {}) {
  await env.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), 'game_captures', captureId), { owner_uid: 'capture-alice', status: 'ready', expires_at_ms: Date.now() + 60000, ...changes }));
}

try {
  await env.clearFirestore();
  await seedCapture();
  await allowed('signed-in first import can read a missing post', () => getDoc(doc(aliceDb, 'posts', postId)));
  await denied('signed-out clients cannot probe a post', () => getDoc(doc(guestDb, 'posts', postId)));
  await denied('another account cannot squat a reserved game post ID', () => setDoc(doc(bobDb, 'posts', postId), payload('capture-bob')));
  await denied('stale author from a switched account cannot publish', () => setDoc(doc(bobDb, 'posts', postId), payload('capture-alice')));
  await denied('owner cannot omit the server capture reference', () => setDoc(doc(aliceDb, 'posts', postId), { id: postId, author_id: 'capture-alice' }));
  await denied('owner cannot create a capture alias under a random post ID', () => setDoc(doc(aliceDb, 'posts', 'ordinary-alias'), payload()));
  await denied('reserved IDs cannot be preallocated without a server session', () => setDoc(doc(bobDb, 'posts', `game_${'b'.repeat(48)}`), payload('capture-bob', 'b'.repeat(48))));
  await denied('malformed reserved IDs cannot bypass the session check', () => setDoc(doc(aliceDb, 'posts', 'game_custom'), { id: 'game_custom', author_id: 'capture-alice', game_capture_id: 'custom' }));
  await seedCapture(id, { status: 'uploading' });
  await denied('upload must finish before import', () => setDoc(doc(aliceDb, 'posts', postId), payload()));
  await seedCapture(id, { expires_at_ms: 0 });
  await denied('expired capture cannot create a post', () => setDoc(doc(aliceDb, 'posts', postId), payload()));
  await seedCapture(id, { status: 'cancelled' });
  await denied('discarded capture cannot create a post', () => setDoc(doc(aliceDb, 'posts', postId), payload()));
  await seedCapture();
  const publishOnce = caption => runTransaction(aliceDb, async tx => {
    const reference = doc(aliceDb, 'posts', postId);
    const existing = await tx.get(reference);
    if (existing.exists()) return { id: existing.id, caption: existing.data().caption };
    tx.set(reference, { ...payload(), caption });
    return { id: postId, caption };
  });
  await allowed('owner publishes exactly once across concurrent transactions', async () => {
    const [first, second] = await Promise.all([publishOnce('First tab'), publishOnce('Second tab')]);
    assert.equal(first.id, second.id); assert.equal(first.caption, second.caption);
  });
  await denied('another account cannot overwrite an imported post', () => updateDoc(doc(bobDb, 'posts', postId), { caption: 'Hijack' }));
  await denied('owner cannot transfer the post to another account', () => updateDoc(doc(aliceDb, 'posts', postId), { author_id: 'capture-bob' }));
  await denied('owner cannot swap a published capture reference', () => updateDoc(doc(aliceDb, 'posts', postId), { game_capture_id: 'b'.repeat(48) }));
  await denied('owner cannot change the stored post identity', () => updateDoc(doc(aliceDb, 'posts', postId), { id: 'different-post' }));
  await allowed('owner can still edit the caption', () => updateDoc(doc(aliceDb, 'posts', postId), { caption: 'Edited caption' }));
  await allowed('ordinary non-game posting remains available', () => setDoc(doc(aliceDb, 'posts', 'ordinary-post'), { id: 'ordinary-post', author_id: 'capture-alice', caption: 'Ordinary' }));
  await denied('ordinary posts cannot gain a forged game reference', () => updateDoc(doc(aliceDb, 'posts', 'ordinary-post'), { game_capture_id: id }));
  await env.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), 'profiles', 'legacy-profile'), { user_id: 'capture-legacy' }));
  const legacyId = 'c'.repeat(48);
  await seedCapture(legacyId, { owner_uid: 'capture-legacy' });
  await allowed('migrated profile owners can import their own capture', () => setDoc(doc(aliceLegacyDb, 'posts', `game_${legacyId}`), payload('legacy-profile', legacyId)));
  await allowed('owner can delete an imported social post', () => deleteDoc(doc(aliceDb, 'posts', postId)));
  await seedCapture(id, { status: 'imported' });
  await denied('completed captures cannot be silently recreated after deletion', () => setDoc(doc(aliceDb, 'posts', postId), payload()));
  console.log(`Game capture post rules: ${checks} checks passed`);
} finally { await env.cleanup(); }
