import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
const projectId = process.env.GCLOUD_PROJECT;
assert.match(projectId || '', /^demo-[a-z0-9-]+$/);
assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):\d+$/);
assert.match(process.env.FIREBASE_STORAGE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):\d+$/);
const require = createRequire(path.resolve(process.env.FIREBASE_TEST_TOOLS_ROOT || '.', 'package.json'));
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, collection, setDoc, getDoc, getDocs, updateDoc, deleteDoc } = require('firebase/firestore');
const { ref, uploadBytes, getBytes, getDownloadURL, getMetadata, updateMetadata, deleteObject, listAll } = require('firebase/storage');
const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':'), [storageHost, storagePort] = process.env.FIREBASE_STORAGE_EMULATOR_HOST.split(':');
const env = await initializeTestEnvironment({ projectId, firestore: { host, port: Number(port), rules: await readFile(process.env.FIREBASE_TEST_RULES_PATH || 'firestore.rules', 'utf8') },
  storage: { host: storageHost, port: Number(storagePort), rules: await readFile(process.env.FIREBASE_TEST_STORAGE_RULES_PATH || 'storage.rules', 'utf8') } });
const uid = 'attachment-rule-alice', alice = env.authenticatedContext(uid), bob = env.authenticatedContext('attachment-rule-bob'), admin = env.authenticatedContext('attachment-rule-admin', { admin: true }), guest = env.unauthenticatedContext();
const bytes = new Uint8Array([1, 2, 3]); let checks = 0, next = 1;
const allow = async (label, run) => { await assertSucceeds(run()); checks++; console.log(`PASS ${label}`); };
const deny = async (label, run) => { await assertFails(run()); checks++; console.log(`PASS ${label}`); };
const seed = (id, data) => env.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), '_community_attachments', id), data));
const proof = (id, patch = {}) => ({ version: 1, asset_id: id, owner_uid: uid, object_path: `community-private/${uid}/${id}/original`, status: 'uploading',
  expires_at_ms: Date.now() + 900000, byte_size: 3, content_type: 'image/png', ...patch });
try {
  await env.clearFirestore();
  const id = String(next++).padStart(64, '0'), row = proof(id), object = context => ref(context.storage(), row.object_path);
  await seed(id, row);
  for (const [name, context] of [['owner', alice], ['outsider', bob], ['admin', admin], ['guest', guest]]) {
    for (const root of ['_community_attachments', '_community_attachment_limits']) {
      await deny(`${name} cannot read ${root}`, () => getDoc(doc(context.firestore(), root, id)));
      await deny(`${name} cannot list ${root}`, () => getDocs(collection(context.firestore(), root)));
      await deny(`${name} cannot create ${root}`, () => setDoc(doc(context.firestore(), root, `new-${name}`), row));
      await deny(`${name} cannot update ${root}`, () => updateDoc(doc(context.firestore(), root, id), { status: 'ready' }));
      await deny(`${name} cannot delete ${root}`, () => deleteDoc(doc(context.firestore(), root, id)));
    }
    await deny(`${name} cannot upload into owner reservation`, () => uploadBytes(object(context), bytes, { contentType: 'image/png' }));
  }
  await allow('server can create a token-free sealed candidate', () => env.withSecurityRulesDisabled(context => uploadBytes(ref(context.storage(), `community-private/${uid}/${id}/sealed_${'a'.repeat(32)}`), bytes, { contentType: 'image/png' })));
  await env.withSecurityRulesDisabled(context => uploadBytes(object(context), bytes, { contentType: 'image/png' }));
  for (const [name, context] of [['owner', alice], ['outsider', bob], ['admin', admin], ['guest', guest]]) {
    await deny(`${name} cannot download raw private bytes`, () => getBytes(object(context)));
    await deny(`${name} cannot obtain Firebase download token`, () => getDownloadURL(object(context)));
    await deny(`${name} cannot read object metadata`, () => getMetadata(object(context)));
    await deny(`${name} cannot enumerate private upload paths`, () => listAll(ref(context.storage(), `community-private/${uid}`)));
    await deny(`${name} cannot replace an uploaded object`, () => uploadBytes(object(context), bytes, { contentType: 'image/png' }));
    await deny(`${name} cannot install a fresh bearer token`, () => updateMetadata(object(context), { customMetadata: { firebaseStorageDownloadTokens: 'forged' } }));
    await deny(`${name} cannot delete uploaded object for reuse`, () => deleteObject(object(context)));
  }
  for (const [name, context] of [['owner', alice], ['outsider', bob], ['admin', admin], ['guest', guest]]) {
    const sealed = ref(context.storage(), `community-private/${uid}/${id}/sealed_${'a'.repeat(32)}`);
    await deny(`${name} cannot get sealed candidate bytes`, () => getBytes(sealed));
    await deny(`${name} cannot obtain a sealed candidate bearer URL`, () => getDownloadURL(sealed));
    await deny(`${name} cannot overwrite a sealed candidate`, () => uploadBytes(sealed, bytes, { contentType: 'image/png' }));
    await deny(`${name} cannot delete a sealed candidate`, () => deleteObject(sealed));
  }
  for (const patch of [{ status: 'ready' }, { status: 'expired' }, { owner_uid: 'attachment-rule-bob' }, { version: 2 }, { object_path: 'wrong' },
    { expires_at_ms: Date.now() - 1 }, { byte_size: 4 }, { content_type: 'text/html' }, { content_type: 'image/svg+xml' }, { byte_size: 21 * 1024 * 1024 }]) {
    const id = String(next++).padStart(64, '0'); await seed(id, proof(id, patch));
    await deny(`malformed or unready proof ${JSON.stringify(patch)} cannot upload`, () => uploadBytes(ref(alice.storage(), `community-private/${uid}/${id}/original`), bytes, { contentType: 'image/png' }));
  }
  await deny('missing reservation cannot upload', () => uploadBytes(ref(alice.storage(), `community-private/${uid}/${'f'.repeat(64)}/original`), bytes, { contentType: 'image/png' }));
  const extra = String(next++).padStart(64, '0'); await seed(extra, proof(extra));
  await deny('extra nested path cannot bypass original binding', () => uploadBytes(ref(alice.storage(), `community-private/${uid}/${extra}/other`), bytes, { contentType: 'image/png' }));
  for (const type of ['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'video/webm']) {
    const id = String(next++).padStart(64, '0'); await seed(id, proof(id, { content_type: type }));
    await deny(`supported ${type} still cannot bypass HTTP upload`, () => uploadBytes(ref(alice.storage(), `community-private/${uid}/${id}/original`), bytes, { contentType: type }));
  }
  const boundary = String(next++).padStart(64, '0'); await seed(boundary, proof(boundary, { byte_size: 20 * 1024 * 1024 }));
  await deny('20 MiB boundary still cannot bypass HTTP upload', () => uploadBytes(ref(alice.storage(), `community-private/${uid}/${boundary}/original`), new Uint8Array(20 * 1024 * 1024), { contentType: 'image/png' }));
  console.log(`Community attachment rules: ${checks} checks passed.`);
} finally { await env.cleanup(); }
