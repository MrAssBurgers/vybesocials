import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
const projectId = process.env.GCLOUD_PROJECT;
assert.match(projectId || '', /^demo-[a-z0-9-]+$/);
assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):\d+$/);
const require = createRequire(path.resolve(process.env.FIREBASE_TEST_TOOLS_ROOT || '.', 'package.json'));
const { initializeTestEnvironment, assertFails } = require('@firebase/rules-unit-testing');
const { doc, setDoc, updateDoc, getDoc, getDocs, collection, deleteDoc } = require('firebase/firestore');
const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
const env = await initializeTestEnvironment({ projectId, firestore: { host, port: Number(port), rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8') } });
let checks = 0;
try {
  await env.clearFirestore();
  for (const namespace of ['_contact_discovery', '_contact_discovery_phones', '_contact_discovery_limits']) {
    const id = namespace === '_contact_discovery_phones' ? 'a'.repeat(64) : 'contacts-owner';
    await env.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), namespace, id), { version: 1, owner_uid: 'contacts-owner', owner_profile_id: 'profile-owner', phone_hash: 'a'.repeat(64), discoverable: true }));
    for (const [name, client] of [['owner', env.authenticatedContext('contacts-owner')], ['other', env.authenticatedContext('contacts-other')], ['staff', env.authenticatedContext('contacts-admin', { admin: true })], ['guest', env.unauthenticatedContext()]]) {
      const db = client.firestore(), ref = doc(db, namespace, id);
      for (const [operation, request] of [['read', () => getDoc(ref)], ['list', () => getDocs(collection(db, namespace))], ['create', () => setDoc(doc(db, namespace, 'forged'), { owner_uid: 'contacts-owner', discoverable: true })], ['update', () => updateDoc(ref, { discoverable: true })], ['delete', () => deleteDoc(ref)]]) {
        await assertFails(request()); checks++; console.log(`PASS ${name} cannot ${operation} ${namespace}`);
      }
    }
  }
  console.log(`Contact discovery rules: ${checks} checks passed.`);
} finally { await env.cleanup(); }
