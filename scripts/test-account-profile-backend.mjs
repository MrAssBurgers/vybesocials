import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const projectId = process.env.GCLOUD_PROJECT;
assert.match(projectId || '', /^demo-[a-z0-9-]+$/); assert.notEqual(projectId, 'demo-vybe-preview');
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8387'); assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9297');
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId });
const require = createRequire(path.resolve(process.env.FIREBASE_TEST_TOOLS_ROOT || '.', 'package.json'));
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { getDoc, getDocs, setDoc, updateDoc, deleteDoc, doc, collection, query, where, setLogLevel } = require('firebase/firestore'); setLogLevel('silent');
const { db, auth, requireAdmin } = await import('../functions/lib/_shared/admin.js');
const { ensureAccountProfileForUid, prepareAccountProfileRecovery } = await import('../functions/lib/_shared/accountProfileAuthority.js');
const { ensureAccountProfile, claimProfileByEmail } = await import('../functions/lib/auth.js');
const env = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8387, rules: await readFile('firestore.rules', 'utf8') } });
let groups = 0, rules = 0;
const check = async (name, run) => { await run(); groups++; console.log(`PASS ${name}`); };
const create = async (uid, extra = {}) => auth.createUser({ uid, ...extra });
const input = (user, extra = {}) => ({ action: 'ensure', expectedOwnerUid: user.uid, expectedAccountCreatedAt: Date.parse(user.metadata.creationTime), requestId: randomUUID(), ...extra });
const run = (user, body = {}, authority = auth) => ensureAccountProfileForUid(db, authority, user.uid, input(user, body));
const failRecovery = (promise, code) => assert.rejects(promise, error => error.code === 'failed-precondition' && error.details?.reason === 'profile-recovery-required' && (!code || error.details.recoveryCode === code));
const profile = async (profileId, owner, fields = {}) => db.doc(`profiles/${profileId}`).set({ id: profileId, user_id: owner, username: profileId.replaceAll('-', '_'), bio: 'Keep this real-looking fixture unchanged', ...fields });
const approve = async (user, profileId) => {
  const plan = await prepareAccountProfileRecovery(db, auth, user.uid, profileId, 'synthetic-independent-source-proof');
  assert.equal(plan.status, 'review-required'); assert.equal((await db.doc(`_account_profile_recovery/${user.uid}`).get()).exists, false);
  await db.doc(`_account_profile_recovery/${user.uid}`).set({ ...plan, status: 'approved', reviewed_by: 'isolated-test-operator' });
};
const allow = async p => { await assertSucceeds(p); rules++; }, deny = async p => { await assertFails(p); rules++; };
try {
  await env.clearFirestore();
  const alice = await create('bootstrap-alice', { email: 'alice@example.test', emailVerified: false });
  await check('fresh unverified signup creates one canonical profile without public email or roles', async () => {
    const result = await run(alice, { defaults: { username: 'qa_alice', displayName: 'Alice', bio: 'Draft bio', avatarUrl: null, onboardingCompleted: false } });
    assert.equal(result.created, true); assert.equal(result.profile.id, alice.uid); assert.equal(result.profile.user_id, alice.uid); assert.equal(result.profile.username, 'qa_alice');
    assert.equal(result.profile.email, undefined); assert.equal((await db.doc(`user_auth_index/${alice.uid}`).get()).data().owner_uid, alice.uid);
    assert.equal((await db.collection('user_roles').get()).size, 0); assert.equal((await db.collection('user_roles_auth').get()).size, 0);
  });
  await check('strict actor/incarnation/default validation and strict old wrapper', async () => {
    await assert.rejects(ensureAccountProfile.run({ data: {} }), { code: 'unauthenticated' });
    await assert.rejects(claimProfileByEmail.run({ auth: { uid: alice.uid }, data: {} }), { code: 'failed-precondition' });
    await assert.rejects(run(alice, { expectedOwnerUid: 'other' }), { code: 'failed-precondition' });
    await failRecovery(run(alice, { expectedAccountCreatedAt: Date.parse(alice.metadata.creationTime) + 1000 }), 'account-incarnation-changed');
    for (const defaults of [{ isAdmin: true }, { onboardingCompleted: true }, { username: '../alice' }, { avatarUrl: 'javascript:alert(1)' }]) await assert.rejects(run(alice, { defaults }), { code: 'invalid-argument' });
  });
  const phone = await create('bootstrap-phone', { phoneNumber: '+15555550191' });
  await check('existing no-email migrated account preserves profile, related data and missing index repair', async () => {
    await profile('legacy-phone-profile', phone.uid, { username: 'phone_owner', marker: 'preserve' });
    await db.doc('conversations/legacy-dm').set({ member_ids: ['legacy-phone-profile', alice.uid], created_by: 'legacy-phone-profile' });
    await db.doc('user_roles/legacy-phone-profile_owner').set({ user_id: 'legacy-phone-profile', role: 'owner', enabled: true });
    const before = (await db.doc('profiles/legacy-phone-profile').get()).data();
    const result = await run(phone, { defaults: { username: 'do_not_reset' } });
    assert.equal(result.profileId, 'legacy-phone-profile'); assert.equal(result.created, false); assert.deepEqual((await db.doc('profiles/legacy-phone-profile').get()).data(), before);
    assert.equal((await db.doc(`profiles/${phone.uid}`).get()).exists, false); assert.equal((await db.doc('user_roles/legacy-phone-profile_owner').get()).exists, true);
  });
  await check('index poisoning cannot reassign a live owner and missing targets do not create duplicates', async () => {
    const attacker = await create('bootstrap-poison'); await db.doc(`user_auth_index/${attacker.uid}`).set({ profile_id: alice.uid });
    await failRecovery(run(attacker), 'identity-conflict'); assert.equal((await db.doc(`profiles/${alice.uid}`).get()).data().user_id, alice.uid);
    await db.doc(`user_auth_index/${attacker.uid}`).set({ profile_id: 'missing-historical-profile' });
    await failRecovery(run(attacker), 'identity-conflict'); assert.equal((await db.doc(`profiles/${attacker.uid}`).get()).exists, false);
  });
  await check('duplicate rows and UID/profile alias collisions preserve all data for review', async () => {
    const dup = await create('bootstrap-duplicate'); await profile('duplicate-a', dup.uid); await profile('duplicate-b', dup.uid);
    await failRecovery(run(dup), 'identity-conflict'); assert.equal((await db.collection('profiles').where('user_id', '==', dup.uid).get()).size, 2);
    const collision = await create('bootstrap-collision'), victim = await create('collision-victim'); await profile(collision.uid, victim.uid); await profile('collision-owned', collision.uid);
    await failRecovery(run(collision), 'identity-conflict');
    const alias = await create('bootstrap-alias'); await profile('alias-owned', alias.uid); await profile('alias-foreign', 'alias-owned'); await failRecovery(run(alias), 'identity-conflict');
  });
  await check('public email/founder handles and deleted previous Auth are never recovery evidence', async () => {
    const email = await create('bootstrap-email', { email: 'founder-qa@example.test', emailVerified: true });
    await profile('legacy-email', 'deleted-owner', { email: email.email, username: 'mrassburgers' });
    await failRecovery(run(email), 'legacy-review-required'); await failRecovery(run(email, { action: 'recover' }), 'recovery-not-approved');
    assert.equal((await db.doc('profiles/legacy-email').get()).data().user_id, 'deleted-owner');
    const founder = await create('bootstrap-founder-name', { email: 'another-founder@example.test', emailVerified: true });
    assert.equal((await run(founder, { defaults: { username: 'bakrix' } })).created, true);
    assert.equal((await db.collection('user_roles').where('user_id', '==', founder.uid).get()).size, 0);
  });
  await check('concurrent setup and lost response return the same profile without resetting edits', async () => {
    const concurrent = await create('bootstrap-concurrent'); const body = input(concurrent, { defaults: { username: 'qa_concurrent' } });
    const results = await Promise.all([ensureAccountProfileForUid(db, auth, concurrent.uid, body), ensureAccountProfileForUid(db, auth, concurrent.uid, body)]);
    assert.equal(results[0].bindingRevision, results[1].bindingRevision); assert.equal(results[1].created, true);
    await db.doc(`profiles/${concurrent.uid}`).update({ bio: 'New meaningful edit' });
    assert.equal((await ensureAccountProfileForUid(db, auth, concurrent.uid, body)).profile.bio, 'New meaningful edit');
    await assert.rejects(ensureAccountProfileForUid(db, auth, concurrent.uid, { ...body, defaults: { username: 'changed_input' } }), { code: 'already-exists' });
    await db.doc(`profiles/${concurrent.uid}`).delete(); await failRecovery(ensureAccountProfileForUid(db, auth, concurrent.uid, body), 'identity-conflict');
    assert.equal((await db.doc(`profiles/${concurrent.uid}`).get()).exists, false);
  });
  await check('same-UID recreation and Auth lookup outages never adopt prior bindings', async () => {
    const changed = { getUser: async uid => ({ ...await auth.getUser(uid), metadata: { creationTime: new Date(Date.parse(alice.metadata.creationTime) + 1000).toUTCString() } }) };
    await failRecovery(ensureAccountProfileForUid(db, changed, alice.uid, input(alice)), 'account-incarnation-changed');
    await failRecovery(ensureAccountProfileForUid(db, changed, alice.uid, input(alice, { expectedAccountCreatedAt: Date.parse(alice.metadata.creationTime) + 1000 })), 'account-incarnation-changed');
    await assert.rejects(run(alice, {}, { getUser: async () => { throw { code: 'auth/internal-error' }; } }), { code: 'unavailable' });
    const late = await create('bootstrap-late-account'); let reads = 0;
    const delayedChange = { getUser: async uid => {
      const user = await auth.getUser(uid); reads++;
      return reads === 1 ? user : { ...user, metadata: { creationTime: new Date(Date.parse(user.metadata.creationTime) + 1000).toUTCString() } };
    } };
    await failRecovery(run(late, {}, delayedChange), 'account-incarnation-changed');
    assert.equal((await db.doc(`profiles/${late.uid}`).get()).exists, false);
  });
  const recoveredUser = await create('bootstrap-recovered', { email: 'recover@example.test', emailVerified: true });
  await profile('legacy-recoverable', 'old-auth-uid'); await db.doc('user_auth_index/old-auth-uid').set({ profile_id: 'legacy-recoverable' });
  await check('reviewed recovery binds exact source and preserves references while retiring old aliases', async () => {
    await approve(recoveredUser, 'legacy-recoverable');
    await assert.rejects(run(recoveredUser), error => error.details?.recoveryAvailable === true);
    const body = input(recoveredUser, { action: 'recover' }); const result = await ensureAccountProfileForUid(db, auth, recoveredUser.uid, body);
    assert.equal(result.recovered, true); assert.equal(result.profileId, 'legacy-recoverable'); assert.equal(result.profile.bio, 'Keep this real-looking fixture unchanged');
    assert.equal((await db.doc('user_auth_index/old-auth-uid').get()).exists, false); assert.equal((await db.doc('_account_profile_bindings/old-auth-uid').get()).data().status, 'retired');
    assert.equal((await db.doc('_account_profile_bindings/legacy-recoverable').get()).data().status, 'retired');
    assert.equal((await db.doc(`_account_profile_recovery/${recoveredUser.uid}`).get()).data().status, 'consumed');
    assert.equal((await ensureAccountProfileForUid(db, auth, recoveredUser.uid, body)).recovered, true);
    const recreated = await create('old-auth-uid'); await failRecovery(run(recreated), 'account-incarnation-changed');
  });
  await check('changed source, old-owner lookup outage and recreated old owner each stop approved recovery', async () => {
    for (const scenario of ['changed', 'outage', 'live', 'profile-alias-live']) {
      const user = await create(`recover-${scenario}`, { email: `${scenario}@example.test`, emailVerified: true });
      const old = `old-${scenario}`, target = `legacy-${scenario}`; await profile(target, old); await approve(user, target);
      if (scenario === 'changed') await db.doc(`profiles/${target}`).update({ bio: 'Changed after review' });
      if (scenario === 'live') await create(old);
      if (scenario === 'profile-alias-live') await create(target);
      const authority = scenario === 'outage' ? { getUser: uid => uid === old ? Promise.reject({ code: 'auth/internal-error' }) : auth.getUser(uid) } : auth;
      await assert.rejects(run(user, { action: 'recover' }, authority), error => error.code === (scenario === 'outage' ? 'unavailable' : 'failed-precondition'));
      assert.equal((await db.doc(`profiles/${target}`).get()).data().user_id, old); assert.equal((await db.doc(`profiles/${user.uid}`).get()).exists, false);
    }
  });
  await check('reviewed original UID document recovery preserves its ID without treating itself as a foreign alias', async () => {
    const user = await create('recover-original-uid', { email: 'original-uid@example.test', emailVerified: true });
    await profile('original-old-uid', 'original-old-uid'); await approve(user, 'original-old-uid');
    const result = await run(user, { action: 'recover' }); assert.equal(result.profileId, 'original-old-uid');
    assert.equal((await db.doc('profiles/original-old-uid').get()).data().user_id, user.uid);
    const oldClient = env.authenticatedContext('original-old-uid').firestore();
    await deny(updateDoc(doc(oldClient, 'profiles', 'original-old-uid'), { bio: 'Stale UID cannot edit transferred profile' }));
  });
  await check('an existing user_ placeholder with possible data is never deleted for recovery', async () => {
    const user = await create('bootstrap-placeholder', { email: 'placeholder@example.test', emailVerified: true });
    await profile(user.uid, user.uid, { username: 'user_placeholder', marker: 'real data' }); await profile('legacy-placeholder', 'deleted-placeholder', { email: user.email });
    await run(user); assert.equal((await db.doc(`profiles/${user.uid}`).get()).data().marker, 'real data');
    await assert.rejects(prepareAccountProfileRecovery(db, auth, user.uid, 'legacy-placeholder', 'qa')); assert.equal((await db.doc('profiles/legacy-placeholder').get()).data().user_id, 'deleted-placeholder');
  });
  await check('ownership-preserving index sync reflects current username without trusting client fields', async () => {
    await db.doc(`profiles/${alice.uid}`).update({ username: 'alice_renamed' });
    const result = await run(alice, { action: 'syncIndex', expectedProfileId: alice.uid }); assert.equal(result.profile.username, 'alice_renamed');
    assert.equal((await db.doc(`user_auth_index/${alice.uid}`).get()).data().username, 'alice_renamed');
    await failRecovery(run(alice, { action: 'syncIndex', expectedProfileId: phone.uid }), 'identity-conflict');
  });
  await check('rules preserve owned profile edits, private data, DM and moderator lookup while denying bootstrap bypasses', async () => {
    const client = env.authenticatedContext(alice.uid).firestore(), migrated = env.authenticatedContext(phone.uid).firestore();
    await allow(getDoc(doc(client, 'profiles', alice.uid))); await allow(updateDoc(doc(client, 'profiles', alice.uid), { bio: 'Owner edit' }));
    await allow(setDoc(doc(migrated, 'profile_private', 'legacy-phone-profile'), { profile_id: 'legacy-phone-profile', user_id: phone.uid, date_of_birth: '1990-01-01' }));
    await allow(getDoc(doc(migrated, 'conversations', 'legacy-dm')));
    await db.doc('posts/owned-qa').set({ author_id: alice.uid }); await allow(getDoc(doc(client, 'posts', 'owned-qa')));
    await db.doc('posts/staff-qa').set({ author_id: 'unrelated' }); await allow(getDoc(doc(migrated, 'posts', 'staff-qa')));
    await allow(getDocs(query(collection(migrated, 'user_roles'), where('user_id', '==', 'legacy-phone-profile'))));
    await deny(setDoc(doc(client, 'profiles', 'raw-new'), { id: 'raw-new', user_id: alice.uid }));
    await deny(updateDoc(doc(client, 'profiles', alice.uid), { user_id: phone.uid })); await deny(updateDoc(doc(client, 'profiles', alice.uid), { email: 'forged@example.test' }));
    await deny(setDoc(doc(client, 'user_auth_index', alice.uid), { profile_id: 'legacy-phone-profile' }));
    await deny(setDoc(doc(client, 'user_auth_index', alice.uid), { profile_id: alice.uid }));
    for (const name of ['_account_profile_bindings', '_account_profile_recovery', '_account_profile_receipts']) {
      await deny(getDoc(doc(client, name, alice.uid))); await deny(setDoc(doc(client, name, alice.uid), { status: 'approved' }));
    }
  });
  await check('retired identities cannot use old tokens, direct UID aliases, staff claims or profile-ID collision shortcuts', async () => {
    const retired = env.authenticatedContext('old-auth-uid', { admin: true }).firestore();
    await db.doc('user_preferences/old-auth-uid').set({ user_id: 'old-auth-uid' }); await db.doc('dna_content_preferences/old-auth-uid').set({ user_id: 'old-auth-uid' });
    for (const [name, key] of [['profiles', 'legacy-recoverable'], ['user_preferences', 'old-auth-uid'], ['dna_content_preferences', 'old-auth-uid'], ['posts', 'staff-qa']]) await deny(getDoc(doc(retired, name, key)));
    await deny(setDoc(doc(retired, 'user_preferences', 'old-auth-uid'), { user_id: 'old-auth-uid' }));
    const collision = env.authenticatedContext('bootstrap-collision').firestore(); await deny(updateDoc(doc(collision, 'profiles', 'bootstrap-collision'), { bio: 'Forged' }));
    await deny(updateDoc(doc(collision, 'profiles', 'collision-owned'), { bio: 'Ambiguous alias' }));
    for (const uid of ['old-auth-uid', 'legacy-recoverable']) {
      await db.doc(`user_roles/${uid}_owner`).set({ user_id: uid, role: 'owner', enabled: true });
      for (const admin of [false, true]) await assert.rejects(requireAdmin({ auth: { uid, token: { admin } } }), { code: 'permission-denied' });
    }
    assert.equal(await requireAdmin({ auth: { uid: alice.uid, token: { admin: true } } }), alice.uid);
  });
  await check('missing canonical identity cannot match empty historical profile fields or members', async () => {
    const empty = env.authenticatedContext('fresh-without-profile').firestore();
    await db.doc('login_streaks/foreign-legacy').set({ user_id: alice.uid });
    await deny(getDoc(doc(empty, 'login_streaks', 'foreign-legacy')));
    await deny(updateDoc(doc(empty, 'login_streaks', 'foreign-legacy'), { count: 999 }));
    await db.doc('conversations/empty-alias').set({ member_ids: [''], created_by: 'other' });
    await deny(getDoc(doc(empty, 'conversations', 'empty-alias')));
    await db.doc('user_roles/_owner').set({ user_id: '', role: 'owner', enabled: true });
    await deny(getDoc(doc(empty, 'posts', 'staff-qa')));
    await db.doc('user_roles/_owner').delete();
  });
  await check('staff grants cannot borrow a foreign direct profile, and a forged index cannot override a protected binding', async () => {
    const uid = 'staff-collision-alias', actualOwner = 'staff-actual-owner';
    await profile(uid, actualOwner);
    await db.doc(`user_roles/${uid}_owner`).set({ user_id: uid, role: 'owner', enabled: true });
    const attacker = env.authenticatedContext(uid, { admin: false }).firestore();
    await deny(getDoc(doc(attacker, 'bug_reports', 'any-staff-report')));
    await assert.rejects(requireAdmin({ auth: { uid, token: { admin: false } } }), { code: 'permission-denied' });
    await db.doc(`_account_profile_bindings/${uid}`).set({ version: 1, owner_uid: uid, profile_id: 'separate-owned-staff', status: 'active' });
    await profile('separate-owned-staff', uid);
    await deny(getDoc(doc(attacker, 'bug_reports', 'any-staff-report')));
    const forged = 'staff-forged-index'; await profile('canonical-nonstaff', forged); await profile('foreign-admin-profile', 'different-owner');
    await db.doc(`_account_profile_bindings/${forged}`).set({ version: 1, owner_uid: forged, profile_id: 'canonical-nonstaff', status: 'active' });
    await db.doc(`user_auth_index/${forged}`).set({ profile_id: 'foreign-admin-profile' });
    await db.doc('user_roles/foreign-admin-profile_owner').set({ user_id: 'foreign-admin-profile', role: 'owner', enabled: true });
    await deny(getDoc(doc(env.authenticatedContext(forged).firestore(), 'bug_reports', 'any-staff-report')));
    await db.doc(`_account_profile_bindings/${forged}`).delete();
    await deny(getDoc(doc(env.authenticatedContext(forged).firestore(), 'bug_reports', 'any-staff-report')));
  });
  await check('two fresh accounts cannot concurrently claim one requested username', async () => {
    const a = await create('bootstrap-name-a'), b = await create('bootstrap-name-b');
    const outcomes = await Promise.allSettled([run(a, { defaults: { username: 'single_reserved_name' } }), run(b, { defaults: { username: 'single_reserved_name' } })]);
    assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(outcomes.find(result => result.status === 'rejected').reason.code, 'already-exists');
    assert.equal((await db.collection('profiles').where('username', '==', 'single_reserved_name').get()).size, 1);
  });
  console.log(`Account profile: ${groups} grouped checks and ${rules} rules checks passed.`);
} finally { await env.cleanup(); await db.terminate(); }
