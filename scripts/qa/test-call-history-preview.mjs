import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

for (const [name, value] of Object.entries({ GCLOUD_PROJECT: 'demo-vybe-preview', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9199', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8280' })) assert.equal(process.env[name], value);
const { initializeApp, deleteApp } = await import('firebase/app');
const { getAuth, connectAuthEmulator, signInWithEmailAndPassword } = await import('firebase/auth');
const { getFirestore, connectFirestoreEmulator, collection, query, where, orderBy, limit, getDocs, getDoc, doc } = await import('firebase/firestore');
const { initializeApp: initAdmin, deleteApp: deleteAdmin } = await import('firebase-admin/app');
const { getFirestore: adminFirestore } = await import('firebase-admin/firestore');
const admin = initAdmin({ projectId: 'demo-vybe-preview' }, `call-history-fixtures-${randomUUID()}`);
const fixtures = adminFirestore(admin), refs = [], apps = [], checks = [];
const binding = fixtures.doc('_account_profile_bindings/preview-alice');
const directProfile = fixtures.doc('profiles/preview-alice');
let priorBinding, bindingChanged = false, priorDirect, directChanged = false;
async function player(name) {
  const app = initializeApp({ apiKey: 'demo-local-only', projectId: 'demo-vybe-preview' }, `call-history-${name}-${randomUUID()}`);
  apps.push(app);
  const auth = getAuth(app); connectAuthEmulator(auth, 'http://127.0.0.1:9199', { disableWarnings: true });
  const db = getFirestore(app); connectFirestoreEmulator(db, '127.0.0.1', 8280);
  if (name) await signInWithEmailAndPassword(auth, `${name}@vybe.test`, 'Vybe-local-preview-only-2026!');
  return { auth, db };
}
const denied = action => assert.rejects(action, error => error.code === 'permission-denied');
try {
  const alice = await player('alice'), outsider = await player('member-query-outsider'), guest = await player('');
  const now = new Date().toISOString(), weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  for (const [index, sides] of [
    { caller_id: 'preview-profile-alice', receiver_id: 'preview-profile-bob' },
    { caller_id: 'preview-profile-bob', receiver_id: 'preview-profile-alice' },
    { caller_id: 'preview-alice', receiver_id: 'preview-bob' },
    { caller_id: 'preview-bob', receiver_id: 'preview-alice' },
  ].entries()) {
    const ref = fixtures.doc(`calls/preview-call-${randomUUID()}`); refs.push(ref);
    await ref.set({ ...sides, conversation_id: `preview-call-conversation-${index}`, created_at: now, call_type: 'audio', status: 'completed', participant_ids: Object.values(sides) });
  }
  for (const identity of ['preview-profile-alice', 'preview-alice']) {
    for (const field of ['caller_id', 'receiver_id']) {
      const rows = await getDocs(query(collection(alice.db, 'calls'), where(field, '==', identity), where('created_at', '>=', weekAgo), orderBy('created_at', 'desc'), limit(80)));
      assert.ok(rows.docs.some(row => row.data()[field] === identity));
      checks.push(`own ${field} history for ${identity} succeeds`);
    }
  }
  assert.ok((await getDoc(doc(alice.db, 'calls', refs[1].id))).exists()); checks.push('receiver exact read succeeds');
  const alias = fixtures.doc(`profiles/preview-call-alias-${randomUUID()}`); refs.push(alias);
  await alias.set({ user_id: 'preview-alice', is_deleted: false });
  const legacy = fixtures.doc(`calls/preview-call-legacy-${randomUUID()}`); refs.push(legacy);
  await legacy.set({ caller_id: alias.id, receiver_id: 'preview-profile-bob', created_at: now, participant_ids: [] });
  assert.ok((await getDoc(doc(alice.db, 'calls', legacy.id))).exists()); checks.push('existing owned legacy profile alias remains readable');
  const group = fixtures.doc(`calls/preview-call-group-${randomUUID()}`); refs.push(group);
  await group.set({ caller_id: 'preview-profile-bob', receiver_id: 'preview-profile-outsider', created_at: now, participant_ids: ['preview-profile-alice'] });
  assert.ok((await getDoc(doc(alice.db, 'calls', group.id))).exists());
  assert.ok((await getDocs(query(collection(alice.db, 'calls'), where('participant_ids', 'array-contains', 'preview-profile-alice')))).docs.some(row => row.id === group.id));
  checks.push('existing group participant read and query remain admitted');
  for (const actor of [outsider, guest]) {
    await denied(() => getDoc(doc(actor.db, 'calls', refs[0].id)));
    await denied(() => getDocs(query(collection(actor.db, 'calls'), where('caller_id', '==', 'preview-profile-alice'))));
    checks.push(`${actor === guest ? 'guest' : 'unrelated account'} cannot read another account call history`);
  }
  const guarded = fixtures.doc(`calls/preview-call-alias-guard-${randomUUID()}`); refs.push(guarded);
  await guarded.set({ caller_id: 'preview-profile-alice', receiver_id: 'preview-profile-bob', created_at: now, participant_ids: [] });
  priorDirect = await directProfile.get();
  await directProfile.set({ user_id: 'preview-bob', is_deleted: false }); directChanged = true;
  await denied(() => getDoc(doc(alice.db, 'calls', guarded.id)));
  checks.push('ambiguous direct profile cannot bypass the existing ownership guard');
  if (priorDirect.exists) await directProfile.set(priorDirect.data()); else await directProfile.delete(); directChanged = false;
  priorBinding = await binding.get();
  await binding.set({ version: 1, owner_uid: 'preview-alice', profile_id: 'preview-profile-alice', status: 'retired' }); bindingChanged = true;
  await denied(() => getDoc(doc(alice.db, 'calls', refs[0].id)));
  await denied(() => getDocs(query(collection(alice.db, 'calls'), where('caller_id', '==', 'preview-profile-alice'))));
  checks.push('retired binding denies the previously admitted call-history token');
  console.log(JSON.stringify({ project: 'demo-vybe-preview', passed: checks.length, checks }, null, 2));
} finally {
  if (directChanged) { if (priorDirect.exists) await directProfile.set(priorDirect.data()); else await directProfile.delete(); }
  if (bindingChanged) { if (priorBinding.exists) await binding.set(priorBinding.data()); else await binding.delete(); }
  await Promise.all(refs.map(ref => ref.delete())); await Promise.all(apps.map(deleteApp)); await deleteAdmin(admin);
}
