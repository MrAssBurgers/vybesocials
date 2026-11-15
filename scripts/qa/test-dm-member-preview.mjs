import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

for (const [name, value] of Object.entries({ GCLOUD_PROJECT: 'demo-vybe-preview', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9199', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8280', FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9399', FUNCTIONS_EMULATOR_HOST: '127.0.0.1:5101' })) assert.equal(process.env[name], value);
const { initializeApp, deleteApp } = await import('firebase/app');
const { getAuth, connectAuthEmulator, signInWithEmailAndPassword, createUserWithEmailAndPassword } = await import('firebase/auth');
const { getFirestore, connectFirestoreEmulator, collection, query, where, getDocs, getDoc, doc } = await import('firebase/firestore');
const { getFunctions, connectFunctionsEmulator, httpsCallable } = await import('firebase/functions');
const { initializeApp: initAdmin, deleteApp: deleteAdmin } = await import('firebase-admin/app');
const { getFirestore: adminFirestore } = await import('firebase-admin/firestore');
const admin = initAdmin({ projectId: 'demo-vybe-preview' }, `member-query-fixtures-${randomUUID()}`);
const fixtures = adminFirestore(admin), seededRefs = [];
const binding = fixtures.doc('_account_profile_bindings/preview-alice');
let bindingBefore, bindingChanged = false;
const apps = [], checks = [];
async function player(name) {
  const app = initializeApp({ apiKey: 'demo-local-only', projectId: 'demo-vybe-preview' }, `member-qa-${name}-${randomUUID()}`);
  apps.push(app);
  const auth = getAuth(app); connectAuthEmulator(auth, 'http://127.0.0.1:9199', { disableWarnings: true });
  const db = getFirestore(app); connectFirestoreEmulator(db, '127.0.0.1', 8280);
  const functions = getFunctions(app); connectFunctionsEmulator(functions, '127.0.0.1', 5101);
  if (name) {
    const email = `${name}@vybe.test`, password = 'Vybe-local-preview-only-2026!';
    try { await signInWithEmailAndPassword(auth, email, password); }
    catch (error) {
      if (name !== 'member-query-outsider') throw error;
      await createUserWithEmailAndPassword(auth, email, password);
    }
  }
  return { auth, db, functions };
}
const denied = action => assert.rejects(action, error => error.code === 'permission-denied');
try {
  const alice = await player('alice'), bob = await player('bob'), outsider = await player('member-query-outsider'), guest = await player('');
  assert.equal(alice.auth.currentUser.uid, 'preview-alice'); assert.equal(bob.auth.currentUser.uid, 'preview-bob');
  const cid = 'preview-profile-alice_preview-profile-bob';
  await httpsCallable(bob.functions, 'sendDmMessage')({ conversationId: cid, content: 'Synthetic membership query regression.', messageType: 'text', viewMode: 'permanent', otherProfileId: 'preview-profile-alice', clientMessageId: 'preview-member-query-v1', expectedSenderUid: 'preview-bob' });
  const own = await getDocs(query(collection(alice.db, 'conversation_members'), where('user_id', '==', 'preview-profile-alice')));
  assert.ok(own.size > 0); checks.push('own membership query succeeds');
  for (const actor of [alice, bob]) {
    for (const operator of ['==', 'in']) {
      const result = await getDocs(query(collection(actor.db, 'conversation_members'), where('conversation_id', operator, operator === 'in' ? [cid] : cid)));
      assert.ok(result.docs.some(row => row.data().user_id === 'preview-profile-alice'));
      assert.ok(result.docs.some(row => row.data().user_id === 'preview-profile-bob'));
      checks.push(`participant ${actor === alice ? 'alice' : 'bob'} reads member list using ${operator}`);
    }
  }
  assert.equal((await getDoc(doc(alice.db, 'conversation_members', `${cid}_preview-profile-bob`))).data()?.user_id, 'preview-profile-bob');
  checks.push('participant exact peer-member read succeeds');
  for (const actor of [outsider, guest]) {
    await denied(() => getDoc(doc(actor.db, 'conversation_members', `${cid}_preview-profile-bob`)));
    await denied(() => getDocs(query(collection(actor.db, 'conversation_members'), where('conversation_id', 'in', [cid]))));
    checks.push(`${actor === guest ? 'guest' : 'unrelated account'} cannot read peer membership or list`);
  }
  bindingBefore = await binding.get();
  await binding.set({ version: 1, owner_uid: 'preview-alice', profile_id: 'preview-profile-alice', status: 'retired' });
  bindingChanged = true;
  await denied(() => getDoc(doc(alice.db, 'conversation_members', `${cid}_preview-profile-bob`)));
  await denied(() => getDocs(query(collection(alice.db, 'conversation_members'), where('conversation_id', 'in', [cid]))));
  checks.push('retired account binding denies the previously admitted token');
  if (bindingBefore.exists) await binding.set(bindingBefore.data()); else await binding.delete();
  bindingChanged = false;
  const ids = Array.from({ length: 10 }, (_, index) => `preview-member-batch-${randomUUID()}-${index}`);
  for (const id of ids) {
    const parent = fixtures.doc(`conversations/${id}`);
    seededRefs.push(parent);
    await parent.set({ member_ids: ['preview-profile-alice', 'preview-profile-bob'], created_by: 'preview-profile-alice' });
    for (const user of ['alice', 'bob']) {
      const member = fixtures.doc(`conversation_members/${id}_preview-profile-${user}`);
      seededRefs.push(member);
      await member.set({ conversation_id: id, user_id: `preview-profile-${user}`, role: 'member' });
    }
  }
  for (const count of [2, 5, 10]) {
    const rows = await getDocs(query(collection(alice.db, 'conversation_members'), where('conversation_id', 'in', ids.slice(0, count))));
    assert.equal(rows.size, count * 2);
    checks.push(`participant member batch with ${count} conversations succeeds`);
  }
  console.log(JSON.stringify({ project: 'demo-vybe-preview', passed: checks.length, checks }, null, 2));
} finally {
  if (bindingChanged) { if (bindingBefore.exists) await binding.set(bindingBefore.data()); else await binding.delete(); }
  await Promise.all(seededRefs.map(ref => ref.delete()));
  await Promise.all(apps.map(app => deleteApp(app))); await deleteAdmin(admin);
}
