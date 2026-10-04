import assert from 'node:assert/strict';
const projectId = process.env.GCLOUD_PROJECT;
assert.match(projectId || '', /^demo-[a-z0-9-]+$/);
for (const key of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST']) assert.match(process.env[key] || '', /^(127\.0\.0\.1|localhost):\d+$/);
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId });
const { db, auth } = await import('../functions/lib/_shared/admin.js');
const { matchContacts, hashPhoneE164Server } = await import('../functions/lib/contactMatch.js');
const { contactDiscovery } = await import('../functions/lib/_shared/contactDiscoveryAuthority.js');
const alice = 'contacts-qa-alice', bob = 'contacts-qa-bob', carol = 'contacts-qa-carol', legacy = 'contacts-qa-legacy';
const phone = '+15555550123', hash = hashPhoneE164Server(phone); let checks = 0;
const data = (uid, action, extra = {}) => ({ action, expectedOwnerUid: uid, expectedProfileId: `profile-${uid}`, ...extra });
const call = (uid, action, extra) => matchContacts.run({ auth: uid ? { uid, token: {} } : undefined, data: data(uid, action, extra) });
const matches = async (hashes = [hash]) => (await call(alice, 'match', { hashes })).matches;
const enable = uid => call(uid, 'setDiscoverable', { discoverable: true });
const check = async (name, fn) => { await fn(); checks++; console.log(`PASS ${name}`); };
const clearQuota = () => db.doc(`_contact_discovery_limits/${alice}`).delete();
try {
  const reset = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' }); assert.ok(reset.ok);
  const authReset = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/${projectId}/accounts`, { method: 'DELETE' }); assert.ok(authReset.ok);
  for (const uid of [alice, bob, carol, legacy]) {
    await auth.createUser({ uid, ...(uid === bob ? { phoneNumber: phone } : {}) });
    await db.doc(`profiles/profile-${uid}`).set({ user_id: uid, username: uid, display_name: uid, avatar_url: null });
    await db.doc(`user_auth_index/${uid}`).set({ profile_id: `profile-${uid}` });
  }
  await check('authenticated actor and strict UID/profile identity required', async () => {
    await assert.rejects(call(null, 'state'), { code: 'unauthenticated' });
    await assert.rejects(call(alice, 'state', { expectedOwnerUid: bob }), { code: 'failed-precondition' });
    await assert.rejects(call(alice, 'state', { expectedProfileId: `profile-${bob}` }), { code: 'failed-precondition' });
    await db.doc(`profiles/${alice}`).set({ user_id: bob }); await assert.rejects(call(alice, 'state'), { code: 'failed-precondition' }); await db.doc(`profiles/${alice}`).delete();
  });
  await check('legacy flags/hash never prove phone ownership or opt-in', async () => {
    await db.doc(`profiles/profile-${legacy}`).update({ phone_verified: true, phone_number: phone, phone_e164_sha256: hash, contact_discoverable: true });
    assert.equal((await call(legacy, 'state')).eligible, false); assert.equal((await call(legacy, 'state')).legacyPhoneNeedsVerification, true);
    await assert.rejects(enable(legacy), { code: 'failed-precondition' }); assert.deepEqual(await matches(), []);
    assert.equal((await call(bob, 'state')).eligible, true); assert.equal((await call(bob, 'state')).discoverable, false);
  });
  await check('deliberate opt-in creates private proof/index and returns only selected matches', async () => {
    assert.equal((await enable(bob)).discoverable, true); const result = await matches(); assert.equal(result.length, 1); assert.equal(result[0].id, `profile-${bob}`); assert.equal(result[0].phone_hash, hash);
    assert.ok(!Object.hasOwn(result[0], 'phone_number')); assert.ok(!JSON.stringify((await db.doc(`_contact_discovery/${bob}`).get()).data()).includes(phone));
    assert.deepEqual(await call(bob, 'match', { hashes: [hash] }).then(row => row.matches), []);
    assert.deepEqual(await matches([hashPhoneE164Server('+15555550999')]), []);
    assert.equal((await db.collection('contact_hashes').get()).size, 0);
  });
  await check('both UID and legacy profile block directions suppress matches', async () => {
    for (const row of [{ blocker_id: alice, blocked_id: `profile-${bob}` }, { blocker_id: `profile-${bob}`, blocked_id: alice }, { blocker_id: bob, blocked_id: `profile-${alice}` }]) {
      await db.doc('blocked_users/contact-fixture').set(row); assert.deepEqual(await matches(), []); await db.doc('blocked_users/contact-fixture').delete();
    }
    assert.equal((await matches()).length, 1);
  });
  await check('disabled or deleted Auth owners and changed phone ownership cannot match', async () => {
    await auth.updateUser(bob, { disabled: true }); assert.deepEqual(await matches(), []); await assert.rejects(call(bob, 'state'), { code: 'permission-denied' });
    await auth.updateUser(bob, { disabled: false, phoneNumber: '+15555550124' }); assert.deepEqual(await matches(), []); assert.equal((await call(bob, 'state')).discoverable, false);
    await auth.updateUser(bob, { phoneNumber: phone }); assert.equal((await matches()).length, 1);
  });
  await check('opt-out and malformed protected records fail closed', async () => {
    await call(bob, 'setDiscoverable', { discoverable: false }); assert.deepEqual(await matches(), []); assert.equal((await db.doc(`_contact_discovery_phones/${hash}`).get()).exists, false);
    await enable(bob); await db.doc(`_contact_discovery/${bob}`).update({ owner_profile_id: `profile-${alice}` }); assert.deepEqual(await matches(), []); await enable(bob);
    await db.doc(`profiles/profile-${bob}`).update({ deleted_at: '2026-01-01' }); assert.deepEqual(await matches(), []); await db.doc(`profiles/profile-${bob}`).update({ deleted_at: null });
  });
  await check('canonical target aliases cannot borrow another profile or ambiguous identity', async () => {
    await db.doc(`profiles/${bob}`).set({ user_id: legacy }); assert.deepEqual(await matches(), []); await db.doc(`profiles/${bob}`).delete();
    await db.doc('profiles/contact-duplicate').set({ user_id: bob }); assert.deepEqual(await matches(), []); await db.doc('profiles/contact-duplicate').delete();
  });
  await check('an opt-out completed during Auth lookup is rechecked before a match is returned', async () => {
    const delayedAuth = { getUser: uid => auth.getUser(uid), getUsers: async ids => { const result = await auth.getUsers(ids); await call(bob, 'setDiscoverable', { discoverable: false }); return result; } };
    assert.deepEqual((await contactDiscovery(db, delayedAuth, alice, data(alice, 'match', { hashes: [hash] }))).matches, []); await enable(bob);
  });
  await check('recycled number opt-in is not removed by the previous owner opting out', async () => {
    await auth.updateUser(bob, { phoneNumber: '+15555550124' }); await auth.updateUser(carol, { phoneNumber: phone }); await enable(carol);
    await call(bob, 'setDiscoverable', { discoverable: false }); assert.equal((await matches())[0].id, `profile-${carol}`);
    await auth.deleteUser(carol); assert.deepEqual(await matches(), []);
    await auth.updateUser(bob, { disabled: true });
    await auth.updateUser(legacy, { phoneNumber: phone }); await enable(legacy); assert.equal((await matches())[0].id, `profile-${legacy}`);
  });
  await check('malformed, plaintext and oversized requests reject without truncation', async () => {
    for (const hashes of [[phone], [null], Array(201).fill(hash)]) await assert.rejects(call(alice, 'match', { hashes }), { code: 'invalid-argument' });
    await assert.rejects(call(alice, 'match', { hashes: [], phones: [phone] }), { code: 'invalid-argument' });
  });
  await check('daily weighted quota is atomic across concurrent requests and stores counts only', async () => {
    const day = new Date().toISOString().slice(0, 10);
    await db.doc(`_contact_discovery_limits/${alice}`).set({ day, hashes: 1999, matches: 0, requests: 0, window_started_at: Date.now() });
    const results = await Promise.allSettled([matches(), matches()]); assert.equal(results.filter(row => row.status === 'fulfilled').length, 1); assert.equal(results.find(row => row.status === 'rejected').reason.code, 'resource-exhausted');
    const quota = (await db.doc(`_contact_discovery_limits/${alice}`).get()).data(); assert.equal(quota.hashes, 2000); assert.ok(!JSON.stringify(quota).includes(hash));
    await clearQuota();
  });
  await check('settings burst and match request quotas are enforced', async () => {
    const day = new Date().toISOString().slice(0, 10);
    await db.doc(`_contact_discovery_limits/${alice}`).set({ day, hashes: 0, matches: 50, requests: 0, window_started_at: Date.now() }); await assert.rejects(matches(), { code: 'resource-exhausted' });
    await db.doc(`_contact_discovery_limits/${alice}`).set({ day, hashes: 0, matches: 0, requests: 30, window_started_at: Date.now() }); await assert.rejects(call(alice, 'state'), { code: 'resource-exhausted' }); await clearQuota();
  });
  console.log(`Contact discovery backend: ${checks} grouped checks passed (real Auth + Firestore emulators).`);
} finally { await db.terminate(); }
