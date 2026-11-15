import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
assert.equal(process.env.GCLOUD_PROJECT, 'demo-vybe-announcement-qa');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9297');
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8389');
const { initializeApp, deleteApp } = await import('firebase/app');
const { getAuth, connectAuthEmulator, signInWithEmailAndPassword } = await import('firebase/auth');
const { getFirestore, connectFirestoreEmulator, collection, query, where, orderBy, limit, doc, getDocFromServer, getDocsFromServer, setDoc, updateDoc, deleteDoc } = await import('firebase/firestore');
const { initializeApp: initAdmin, deleteApp: deleteAdmin } = await import('firebase-admin/app');
const { getAuth: adminAuth } = await import('firebase-admin/auth');
const { getFirestore: adminFirestore, FieldValue } = await import('firebase-admin/firestore');
const project = 'demo-vybe-announcement-qa', prefix = 'qa-ann-' + randomUUID(), apps = [], users = [], paths = new Set(), checks = [];
const admin = initAdmin({ projectId: project }, prefix), database = adminFirestore(admin), authAdmin = adminAuth(admin);
const track = path => { paths.add(path); return database.doc(path); };
async function seed(path, value) { await track(path).set(value); }
const deny = async (label, action) => { await assert.rejects(action, error => error.code === 'permission-denied'); checks.push(label); };
async function player(name, staff = false) {
  const uid = prefix + '-' + name, profileId = 'profile-' + uid, email = uid + '@example.test';
  const account = await authAdmin.createUser({ uid, email, password: 'Synthetic-local-QA-2026!' }); users.push(uid);
  if (staff) await authAdmin.setCustomUserClaims(uid, { admin: true });
  await seed('profiles/' + profileId, { id: profileId, user_id: uid, username: name, is_deleted: false });
  await seed('_account_profile_bindings/' + uid, { version: 1, status: 'active', owner_uid: uid, profile_id: profileId, auth_created_at_ms: Date.parse(account.metadata.creationTime), revision: randomBytes(24).toString('hex') });
  await seed('user_auth_index/' + uid, { profile_id: profileId });
  const app = initializeApp({ apiKey: 'demo-local-only', projectId: project, appId: 'demo-announcement' }, uid); apps.push(app);
  const auth = getAuth(app); connectAuthEmulator(auth, 'http://127.0.0.1:9297', { disableWarnings: true });
  await signInWithEmailAndPassword(auth, email, 'Synthetic-local-QA-2026!'); assert.equal(auth.currentUser.uid, uid);
  const firestore = getFirestore(app); connectFirestoreEmulator(firestore, '127.0.0.1', 8389);
  return { uid, profileId, firestore };
}
function dismissalQuery(player, announcementId) {
  return query(collection(player.firestore, 'dismissed_announcements'), where('user_id', '==', player.profileId), ...(announcementId ? [where('announcement_id', '==', announcementId)] : []));
}
async function upsert(player, announcementId) {
  const existing = await getDocsFromServer(query(dismissalQuery(player, announcementId), limit(5)));
  const id = existing.size === 1 ? existing.docs[0].id : player.profileId + '_' + announcementId;
  track('dismissed_announcements/' + id);
  const stamp = new Date().toISOString();
  await setDoc(doc(player.firestore, 'dismissed_announcements', id), { id, user_id: player.profileId, announcement_id: announcementId, created_at: stamp, updated_at: stamp }, { merge: true });
  return id;
}
try {
  const alice = await player('alice'), bob = await player('bob'), staff = await player('staff', true);
  const guestApp = initializeApp({ apiKey: 'demo-local-only', projectId: project }, prefix + '-guest'); apps.push(guestApp);
  const guest = getFirestore(guestApp); connectFirestoreEmulator(guest, '127.0.0.1', 8389);
  const news = prefix + '-news', legacyNews = prefix + '-legacy';
  for (const id of [news, legacyNews]) await seed('announcements/' + id, { id, title: 'Synthetic announcement', content: 'Local QA only', is_active: true, author_id: staff.profileId, created_at: new Date().toISOString() });
  const feed = await getDocsFromServer(query(collection(alice.firestore, 'announcements'), where('is_active', '==', true), orderBy('created_at', 'desc')));
  assert.equal(feed.size, 2); checks.push('real Auth token reads the existing active announcement query');
  assert.equal((await getDocsFromServer(dismissalQuery(alice))).size, 0); checks.push('canonical owner can query an empty dismissal list');
  const id = await upsert(alice, news); assert.equal(await upsert(alice, news), id);
  assert.equal((await getDocsFromServer(dismissalQuery(alice, news))).size, 1); checks.push('actual conflict-query/upsert replay retains one owned preference');
  const own = doc(alice.firestore, 'dismissed_announcements', id);
  assert.equal((await getDocFromServer(own)).data().announcement_id, news); checks.push('owner can read the acknowledged physical preference');
  await deny('another member cannot get the preference', () => getDocFromServer(doc(bob.firestore, 'dismissed_announcements', id)));
  await deny('another member cannot query its owner', () => getDocsFromServer(query(collection(bob.firestore, 'dismissed_announcements'), where('user_id', '==', alice.profileId))));
  await deny('staff cannot read another owner preference', () => getDocFromServer(doc(staff.firestore, 'dismissed_announcements', id)));
  await deny('guest cannot read the preference', () => getDocFromServer(doc(guest, 'dismissed_announcements', id)));
  await deny('owner cannot enumerate other accounts', () => getDocsFromServer(collection(alice.firestore, 'dismissed_announcements')));
  await deny('preference owner cannot modify announcements', () => updateDoc(doc(alice.firestore, 'announcements', news), { title: 'Not authorized' }));
  const evilPath = 'dismissed_announcements/' + prefix + '-poison'; track(evilPath);
  await deny('another owner cannot create a preference for Alice', () => setDoc(doc(bob.firestore, evilPath), { user_id: alice.profileId, announcement_id: news }));
  await deny('raw Auth UID cannot replace the canonical profile owner', () => setDoc(doc(alice.firestore, evilPath), { user_id: alice.uid, announcement_id: news }));
  await deny('unknown fields cannot be introduced', () => setDoc(doc(alice.firestore, evilPath), { user_id: alice.profileId, announcement_id: news, admin: true }));
  await deny('missing announcement cannot be fabricated', () => setDoc(doc(alice.firestore, evilPath), { user_id: alice.profileId, announcement_id: prefix + '-missing' }));
  await deny('owner field cannot be retargeted', () => updateDoc(own, { user_id: bob.profileId }));
  await deny('announcement field cannot be retargeted', () => updateDoc(own, { announcement_id: legacyNews }));
  await deny('stored record ID must match its physical document', () => updateDoc(own, { id: 'another-document' }));
  await deny('malformed timestamps cannot be written', () => updateDoc(own, { updated_at: { arbitrary: true } }));
  await deny('new fields cannot be added to an existing preference', () => updateDoc(own, { admin: true }));
  await deny('browser delete cannot erase the preference', () => deleteDoc(own));
  const legacyPath = 'dismissed_announcements/' + prefix + '-legacy-row';
  await seed(legacyPath, { user_id: alice.profileId, announcement_id: legacyNews, created_at: '2026-01-01T00:00:00Z', migration_note: 'Preserved legacy fixture' });
  assert.equal(await upsert(alice, legacyNews), legacyPath.split('/')[1]);
  assert.equal((await database.doc(legacyPath).get()).data().id, legacyPath.split('/')[1]);
  assert.equal((await database.doc(legacyPath).get()).data().migration_note, 'Preserved legacy fixture'); checks.push('historical row ID and extra metadata survive compatible replay');
  await database.doc('_account_profile_bindings/' + alice.uid).update({ status: 'retired' });
  await deny('retired binding cannot read a formerly owned preference', () => getDocFromServer(own));
  await deny('retired binding cannot write a formerly owned preference', () => updateDoc(own, { updated_at: new Date().toISOString() }));
  await database.doc('_account_profile_bindings/' + alice.uid).update({ status: 'active' });
  await seed('profiles/' + alice.uid, { id: alice.uid, user_id: bob.uid });
  await deny('contradictory direct profile alias cannot read preferences', () => getDocFromServer(own));
  await database.doc('profiles/' + alice.uid).delete();
  for (const [field, value] of [['is_deleted', true], ['is_banned', true], ['deletion_requested_at', new Date().toISOString()]]) {
    await database.doc('profiles/' + alice.profileId).update({ [field]: value });
    await deny('inactive profile flag ' + field + ' blocks preferences', () => getDocFromServer(own));
    await database.doc('profiles/' + alice.profileId).update({ [field]: FieldValue.delete() });
  }
  assert.equal((await getDocFromServer(own)).data().announcement_id, news); checks.push('restored canonical owner retains the original history');
  const receipt = { checkedAt: new Date().toISOString(), project, passed: checks.length, checks, scope: 'Actual local Firebase Auth tokens and Firestore SDK against the selected Rules. Administrative setup/cleanup is restricted to generated demo accounts/documents. No cloud, notification, email or production data operation.' };
  const output = new URL('../../work/announcement-qa/', import.meta.url); await mkdir(output, { recursive: true }); await writeFile(new URL('verification-sdk.json', output), JSON.stringify(receipt, null, 2) + '\n'); console.log(JSON.stringify(receipt, null, 2));
} finally {
  const batch = database.batch(); for (const path of paths) batch.delete(database.doc(path)); await batch.commit();
  await Promise.all(users.map(uid => authAdmin.deleteUser(uid)));
  await Promise.all(apps.map(app => deleteApp(app))); await deleteAdmin(admin);
}
