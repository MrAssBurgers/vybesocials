import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
const projectId = process.env.GCLOUD_PROJECT;
assert.equal(projectId, 'demo-vybe-space-rules');
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8387');
const require = createRequire(path.resolve('../qa-tools/package.json'));
const { initializeTestEnvironment, assertFails } = require('@firebase/rules-unit-testing');
const { doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc, setLogLevel } = require('firebase/firestore');
setLogLevel('silent');
const rules = await readFile('releases/people-discovery-20261006/firestore.rules', 'utf8');
assert.equal(createHash('sha256').update(rules).digest('hex'), 'f7be92e5abb8fa5fb8c8a9fc263440a3478a0e9829b92c84d0085402df999f78');
const env = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8387, rules } });
const prefix = randomUUID(); let checks = 0;
try {
  const uid = `${prefix}-owner`, profileId = `${prefix}-profile`;
  const clients = [env.authenticatedContext(uid).firestore(), env.authenticatedContext(`${prefix}-other`).firestore(), env.authenticatedContext(`${prefix}-staff`, { admin: true }).firestore(), env.unauthenticatedContext().firestore()];
  const collections = ['spaces', 'space_participants', '_space_authority', '_space_members', '_space_receipts', '_space_audio_effects'];
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'profiles', profileId), { user_id: uid });
    await setDoc(doc(db, 'user_auth_index', uid), { profile_id: profileId });
    await setDoc(doc(db, '_account_profile_bindings', uid), { version: 1, status: 'active', owner_uid: uid, profile_id: profileId, auth_created_at_ms: 1, revision: 'a'.repeat(48) });
    for (const col of collections) await setDoc(doc(db, col, prefix), { id: prefix, owner_uid: uid, user_id: uid, host_id: uid, profile_id: profileId, status: 'live', role: 'host' });
  });
  for (const col of collections) for (const client of clients) {
    await assertFails(getDoc(doc(client, col, prefix))); checks++;
    await assertFails(getDocs(collection(client, col))); checks++;
    await assertFails(setDoc(doc(client, col, `${prefix}-new`), { owner_uid: uid, user_id: uid, host_id: uid, role: 'host' })); checks++;
    await assertFails(updateDoc(doc(client, col, prefix), { role: 'speaker', status: 'ended' })); checks++;
    await assertFails(deleteDoc(doc(client, col, prefix))); checks++;
  }
  console.log(JSON.stringify({ checks, projectId, productionWrites: false, baseline: 'Exact released Firestore snapshot; all six room/proof/job collections deny raw access for owner, other, guest and admin-claim clients.' }));
} finally { await env.cleanup(); }
