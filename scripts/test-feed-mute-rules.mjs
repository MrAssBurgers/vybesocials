import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const projectId = process.env.GCLOUD_PROJECT;
assert.ok(['demo-vybe-creators', 'demo-vybe-creator-qa'].includes(projectId), 'Use the isolated creator QA project');
const endpoint = process.env.FIRESTORE_EMULATOR_HOST;
assert.match(endpoint || '', /^(127\.0\.0\.1|localhost):\d+$/, 'Loopback Firestore emulator required');
const [host, rawPort] = endpoint.split(':'); const port = Number(rawPort);
assert.ok(port > 0 && port < 65536 && port !== 8280, 'Do not use the live preview emulator');
const require = createRequire(path.resolve(process.env.FIREBASE_TEST_TOOLS_ROOT || '.', 'package.json'));
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, collection, collectionGroup, setDoc, getDoc, getDocs, updateDoc, deleteDoc, runTransaction, serverTimestamp, Timestamp, setLogLevel } = require('firebase/firestore');
setLogLevel('silent');
const env = await initializeTestEnvironment({ projectId, firestore: { host, port, rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8') } });
const alice = env.authenticatedContext('mute-alice').firestore();
const bob = env.authenticatedContext('mute-bob').firestore();
const admin = env.authenticatedContext('mute-admin', { admin: true }).firestore();
const guest = env.unauthenticatedContext().firestore();
const own = (client, target = 'mute-bob-profile') => doc(client, 'feed_mutes', 'mute-alice', 'authors', target);
const row = () => ({ schema_version: 1, owner_uid: 'mute-alice', target_profile_id: 'mute-bob-profile', target_uid: 'mute-bob', created_at: serverTimestamp() });
let checks = 0;
const allowed = async (label, run) => { await assertSucceeds(run()); checks++; console.log(`PASS ${label}`); };
const denied = async (label, run) => { await assertFails(run()); checks++; console.log(`PASS ${label}`); };
const seed = (address, value) => env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), address), value));
try {
  await env.clearFirestore();
  await seed('profiles/mute-alice-profile', { user_id: 'mute-alice' });
  await seed('profiles/mute-bob-profile', { user_id: 'mute-bob' });
  await seed('profiles/mute-canonical', { user_id: 'mute-canonical' });
  await seed('profiles/mute-other-alice-profile', { user_id: 'mute-alice' });
  await allowed('owner reads missing preference to retry safely', () => getDoc(own(alice)));
  await allowed('owner creates migrated-profile mute with server timestamp', () => setDoc(own(alice), row()));
  await allowed('owner reads mute', () => getDoc(own(alice)));
  await allowed('owner lists own mute preferences', () => getDocs(collection(alice, 'feed_mutes', 'mute-alice', 'authors')));
  const timestamp = (await getDoc(own(alice))).data().created_at.toMillis();
  await allowed('lost-ack retry reads original mute without overwriting it', () => runTransaction(alice, async tx => {
    const ref = own(alice); const existing = await tx.get(ref); if (!existing.exists()) tx.set(ref, row());
  }));
  assert.equal((await getDoc(own(alice))).data().created_at.toMillis(), timestamp);
  await denied('even owner cannot overwrite an existing mute timestamp', () => setDoc(own(alice), row()));
  await denied('even owner cannot mutate target binding', () => updateDoc(own(alice), { target_uid: 'mute-canonical' }));
  for (const [label, client] of [['other user', bob], ['admin browser', admin], ['guest', guest]]) {
    await denied(`${label} cannot read owner mute`, () => getDoc(own(client)));
    await denied(`${label} cannot probe missing owner preference`, () => getDoc(own(client, 'missing')));
    await denied(`${label} cannot list owner mutes`, () => getDocs(collection(client, 'feed_mutes', 'mute-alice', 'authors')));
    await denied(`${label} cannot create owner mutes`, () => setDoc(own(client, 'mute-canonical'), { ...row(), target_profile_id: 'mute-canonical', target_uid: 'mute-canonical' }));
    await denied(`${label} cannot overwrite owner mutes`, () => updateDoc(own(client), { owner_uid: 'mute-bob' }));
    await denied(`${label} cannot delete owner mutes`, () => deleteDoc(own(client)));
  }
  for (const client of [alice, bob, admin, guest]) {
    await denied('cross-owner collection group reads remain closed', () => getDocs(collectionGroup(client, 'authors')));
    await denied('top-level owner index is private', () => getDocs(collection(client, 'feed_mutes')));
    await denied('browser cannot create parent preference metadata', () => setDoc(doc(client, 'feed_mutes', 'mute-alice'), { owner_uid: 'mute-alice' }));
  }
  await allowed('owner unmutes', () => deleteDoc(own(alice)));
  await allowed('retry unmute of absent preference is idempotent', () => deleteDoc(own(alice)));
  const invalid = [
    ['schema', { schema_version: 2 }], ['owner', { owner_uid: 'mute-bob' }],
    ['target path', { target_profile_id: 'mute-canonical' }], ['target owner', { target_uid: 'mute-canonical' }],
    ['self alias', { target_uid: 'mute-alice' }], ['empty UID', { target_uid: '' }],
    ['missing UID', { target_uid: null }], ['forged timestamp', { created_at: Timestamp.fromMillis(1) }],
    ['string timestamp', { created_at: new Date().toISOString() }], ['extra state', { status: 'blocked' }],
  ];
  for (const [label, changes] of invalid) await denied(`rejects ${label}`, () => setDoc(own(alice), { ...row(), ...changes }));
  for (const field of Object.keys(row())) {
    const invalidRow = row(); delete invalidRow[field];
    await denied(`requires ${field}`, () => setDoc(own(alice), invalidRow));
  }
  await denied('cannot mute missing target profile', () => setDoc(own(alice, 'absent'), { ...row(), target_profile_id: 'absent' }));
  await denied('cannot mute own canonical profile', () => setDoc(own(alice, 'mute-alice-profile'), { ...row(), target_profile_id: 'mute-alice-profile', target_uid: 'mute-alice' }));
  await denied('cannot mute own migrated alias', () => setDoc(own(alice, 'mute-other-alice-profile'), { ...row(), target_profile_id: 'mute-other-alice-profile', target_uid: 'mute-alice' }));
  await allowed('supports auth-ID target profiles', () => setDoc(own(alice, 'mute-canonical'), { ...row(), target_profile_id: 'mute-canonical', target_uid: 'mute-canonical' }));
  await denied('nested mute descendants cannot store arbitrary private state', () => setDoc(doc(alice, 'feed_mutes/mute-alice/authors/mute-canonical/extra/doc'), { note: 'invalid' }));
  await seed('feed_mutes/mute-alice/authors/old-malformed', { legacy: true });
  await allowed('owner can remove malformed old preferences', () => deleteDoc(own(alice, 'old-malformed')));
  console.log(`Feed mute rules: ${checks} checks passed`);
} finally { await env.cleanup(); }
