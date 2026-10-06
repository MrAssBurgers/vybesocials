import assert from 'node:assert/strict';
const projectId = process.env.GCLOUD_PROJECT;
assert.equal(projectId, 'demo-vybe-contacts-qa');
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8387');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9297');
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId });
const { db, auth } = await import('../functions/lib/_shared/admin.js');
const { peopleDiscovery, discoveryAge } = await import('../functions/lib/_shared/peopleDiscoveryAuthority.js');
const { getDiscoveryProfiles } = await import('../functions/lib/profilePrivacy.js');
const now = Date.parse('2026-10-06T12:00:00Z');
// Only this confirmed disposable emulator project may be reset.
assert.equal((await fetch(`http://127.0.0.1:8387/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' })).status, 200);
const identities = [];
async function seed(name, dob = '2001-05-03', patch = {}) {
  const uid = `discovery-${name}`, profileId = `discovery-profile-${name}`;
  try { await auth.deleteUser(uid); } catch (error) { if (error.code !== 'auth/user-not-found') throw error; }
  const user = await auth.createUser({ uid });
  const created = Date.parse(user.metadata.creationTime);
  await db.doc(`profiles/${profileId}`).set({ user_id: uid, username: name, display_name: name, avatar_url: 'https://example.test/avatar.png', interests: ['music'], is_private: false, created_at: new Date(now).toISOString(), email: 'not-for-discovery@example.test', ...patch });
  await db.doc(`user_auth_index/${uid}`).set({ profile_id: profileId });
  await db.doc(`_account_profile_bindings/${uid}`).set({ version: 1, status: 'active', owner_uid: uid, profile_id: profileId, auth_created_at_ms: created, revision: 'a'.repeat(48) });
  if (dob !== null) await db.doc(`profile_private/${profileId}`).set({ id: profileId, profile_id: profileId, user_id: uid, date_of_birth: dob });
  const actor = { uid, profileId, created }; identities.push(actor); return actor;
}
const body = (actor, patch = {}) => ({ expectedOwnerUid: actor.uid, expectedProfileId: actor.profileId, expectedAccountCreatedAt: actor.created, ...patch });
const run = (actor, patch = {}, verifier = auth, clock = () => now) => peopleDiscovery(db, verifier, actor.uid, body(actor, patch), clock);
let groups = 0;
const check = async (name, fn) => { await fn(); console.log(`PASS ${name}`); groups++; };
try {
  const alice = await seed('alice'), bob = await seed('bob'), unknown = await seed('unknown', null), minor = await seed('minor', '2010-05-03');
  await check('unbound candidates fail before identity query fan-out without changing admission', async () => {
    const unbound = await seed('unbound');
    await db.doc(`_account_profile_bindings/${unbound.uid}`).delete();
    let queries = 0;
    const measured = new Proxy(db, { get(target, name) {
      if (name === 'runTransaction') return callback => target.runTransaction(tx => callback(new Proxy(tx, { get(transaction, method) {
        if (method === 'get') return (reference, ...args) => { if (!reference.path) queries++; return transaction.get(reference, ...args); };
        const value = Reflect.get(transaction, method); return typeof value === 'function' ? value.bind(transaction) : value;
      } })));
      const value = Reflect.get(target, name); return typeof value === 'function' ? value.bind(target) : value;
    } });
    await peopleDiscovery(measured, auth, alice.uid, body(alice, { candidateIds: [] }));
    const baselineQueries = queries; queries = 0;
    const result = await peopleDiscovery(measured, auth, alice.uid, body(alice, { candidateIds: [unbound.profileId] }));
    assert.deepEqual(result.profiles, []);
    assert.equal(queries - baselineQueries, 2, 'Only the two actor friendship graph queries; no unbound target identity queries');
  });
  await check('callable requires authentication and enforces its exact existing quota', async () => {
    await assert.rejects(getDiscoveryProfiles.run({ data: {} }), { code: 'unauthenticated' });
    const request = { auth: { uid: alice.uid }, data: body(alice, { candidateIds: [] }) };
    const result = await getDiscoveryProfiles.run(request); assert.equal(result.ownerUid, alice.uid); assert.deepEqual(result.profiles, []);
    await db.doc(`_rate_limits/people-discovery:${alice.uid}`).set({ count: 30, reset_at: Date.now() + 60000 });
    await assert.rejects(getDiscoveryProfiles.run(request), { code: 'resource-exhausted' });
    await db.doc(`_rate_limits/people-discovery:${alice.uid}`).delete();
  });
  await check('canonical actor and strict bounded inputs', async () => {
    for (const patch of [{ expectedOwnerUid: bob.uid }, { expectedProfileId: bob.profileId }, { expectedAccountCreatedAt: alice.created + 1 }]) await assert.rejects(run(alice, patch), { code: 'failed-precondition' });
    for (const patch of [{ limit: 121 }, { limit: 0 }, { candidateIds: ['bad/path'] }, { candidateIds: Array(121).fill(bob.profileId) }, { admin: true }]) await assert.rejects(run(alice, patch), { code: 'invalid-argument' });
    assert.deepEqual((await run(alice, { candidateIds: [] })).profiles, []);
  });
  await check('private projection and deterministic selection with fresh short lease', async () => {
    let time = now;
    const result = await run(alice, { candidateIds: [alice.profileId, bob.profileId, bob.profileId] }, auth, () => time++);
    assert.equal(result.profiles.length, 1); assert.equal(result.profiles[0].id, bob.profileId);
    assert.deepEqual(Object.keys(result.profiles[0]).sort(), ['avatar_url', 'display_name', 'id', 'interests', 'mutual_count', 'username']);
    assert.ok(!JSON.stringify(result).includes('2001-05-03')); assert.ok(!JSON.stringify(result).includes('not-for-discovery'));
    assert.equal(result.accountCreatedAt, alice.created); assert.equal(result.serverTime, now + 1); assert.equal(result.leaseUntil, now + 15001);
  });
  await check('strict dates and unknown or under-thirteen viewer require birthday review', async () => {
    for (const date of ['2026-02-30', '2027-01-01', '1900-01-01', '', '2001-5-3', 'not-a-date']) assert.equal(discoveryAge(date, now), null);
    assert.equal(discoveryAge('2001-05-03', now), 25);
    assert.equal((await run(unknown)).ageReviewRequired, true);
    const child = await seed('child', '2015-01-01'); assert.equal((await run(child)).ageReviewRequired, true);
    assert.deepEqual((await run(alice, { candidateIds: [minor.profileId, unknown.profileId] })).profiles, []);
    assert.deepEqual((await run(minor, { candidateIds: [bob.profileId] })).profiles, []);
    const peer = await seed('minor-peer', '2011-01-01'); assert.equal((await run(minor, { candidateIds: [peer.profileId] })).profiles.length, 1);
  });
  await check('private DOB ownership cannot be borrowed; canonical migrated null ownership is retained', async () => {
    await db.doc(`profile_private/${bob.profileId}`).update({ user_id: alice.uid });
    assert.deepEqual((await run(alice, { candidateIds: [bob.profileId] })).profiles, []);
    await db.doc(`profile_private/${bob.profileId}`).update({ user_id: null });
    assert.equal((await run(alice, { candidateIds: [bob.profileId] })).profiles.length, 1);
    await db.doc(`profile_private/${bob.profileId}`).update({ profile_id: alice.profileId });
    assert.deepEqual((await run(alice, { candidateIds: [bob.profileId] })).profiles, []);
    await db.doc(`profile_private/${bob.profileId}`).update({ profile_id: bob.profileId, user_id: bob.uid });
  });
  await check('private, banned, deletion and purge candidates are excluded', async () => {
    for (const patch of [{ is_private: true }, { is_private: null }, { is_banned: true }, { deletion_requested_at: 'pending' }, { scheduled_purge_at: 'pending' }, { is_deleted: true }]) {
      const target = await seed(`excluded-${identities.length}`, '2001-05-03', patch);
      assert.deepEqual((await run(alice, { candidateIds: [target.profileId] })).profiles, []);
    }
    for (const patch of [{ is_banned: true }, { deletion_requested_at: 'pending' }, { scheduled_purge_at: 'pending' }]) {
      const actor = await seed(`unavailable-actor-${identities.length}`, '2001-05-03', patch);
      await assert.rejects(run(actor, { candidateIds: [] }), { code: 'permission-denied' });
    }
  });
  await check('blocks in either direction and either legacy identity alias exclude candidates', async () => {
    for (const blocker of [alice.uid, alice.profileId, bob.uid, bob.profileId]) {
      const blocked = blocker.startsWith('discovery-profile-alice') || blocker === alice.uid ? bob.profileId : alice.uid;
      await db.doc('blocked_users/discovery-test').set({ blocker_id: blocker, blocked_id: blocked });
      assert.deepEqual((await run(alice, { candidateIds: [bob.profileId] })).profiles, []);
    }
    await db.doc('blocked_users/discovery-test').delete();
  });
  await check('disabled or recreated targets and identity collisions cannot enter output', async () => {
    await auth.updateUser(bob.uid, { disabled: true }); assert.deepEqual((await run(alice, { candidateIds: [bob.profileId] })).profiles, []); await auth.updateUser(bob.uid, { disabled: false });
    await db.doc(`_account_profile_bindings/${bob.uid}`).update({ auth_created_at_ms: bob.created + 1 }); assert.deepEqual((await run(alice, { candidateIds: [bob.profileId] })).profiles, []);
    await db.doc(`_account_profile_bindings/${bob.uid}`).update({ auth_created_at_ms: bob.created });
    await db.doc('profiles/discovery-collision').set({ user_id: bob.uid }); assert.deepEqual((await run(alice, { candidateIds: [bob.profileId] })).profiles, []); await db.doc('profiles/discovery-collision').delete();
  });
  await check('actor rechecked before normal and birthday-review responses; failures stay failures', async () => {
    for (const actor of [alice, unknown]) {
      let reads = 0;
      const verifier = { getUser: async uid => { const user = await auth.getUser(uid); if (uid === actor.uid && ++reads === 2) return { ...user, disabled: true }; return user; } };
      await assert.rejects(run(actor, { candidateIds: [] }, verifier), { code: 'failed-precondition' });
    }
    await assert.rejects(run(alice, {}, { getUser: async () => { throw new Error('network unavailable'); } }), { code: 'unavailable' });
  });
  await check('a caller UID used as another canonical profile alias cannot borrow that owner', async () => {
    const caller = await seed('collision-caller'), owner = await seed('collision-owner');
    await db.doc(`profiles/${caller.profileId}`).delete();
    const ownerRow = (await db.doc(`profiles/${owner.profileId}`).get()).data();
    await db.doc(`profiles/${owner.profileId}`).delete();
    await db.doc(`profiles/${caller.uid}`).set(ownerRow);
    await db.doc(`user_auth_index/${owner.uid}`).set({ profile_id: caller.uid });
    await db.doc(`_account_profile_bindings/${owner.uid}`).update({ profile_id: caller.uid });
    await assert.rejects(run({ uid: caller.uid, profileId: caller.uid, created: owner.created }, { candidateIds: [] }), { code: 'failed-precondition' });
  });
  await check('canonical mutual counts respect visibility, aliases and intermediary blocks', async () => {
    const friend = await seed('mutual-friend'), target = await seed('mutual-target');
    const rows = [
      ['discovery-mutual-1', { sender_id: alice.uid, receiver_id: friend.profileId, status: 'accepted' }],
      ['discovery-mutual-2', { sender_id: friend.uid, receiver_id: alice.profileId, status: 'accepted' }],
      ['discovery-mutual-3', { sender_id: friend.profileId, receiver_id: target.uid, status: 'accepted' }],
      ['discovery-mutual-4', { sender_id: target.profileId, receiver_id: friend.uid, status: 'accepted' }],
    ];
    for (const [id, row] of rows) await db.doc(`friend_requests/${id}`).set(row);
    assert.equal((await run(alice, { candidateIds: [target.profileId] })).profiles[0].mutual_count, 0);
    await db.doc(`profile_visibility/${target.profileId}`).set({ fields: { mutual_friends: 'public' } });
    assert.equal((await run(alice, { candidateIds: [target.profileId] })).profiles[0].mutual_count, 1);
    const general = await run(alice);
    assert.equal(general.profiles.filter(p => p.id === target.profileId).length, 1);
    assert.ok(!general.profiles.some(p => p.id === friend.profileId));
    await db.doc('blocked_users/discovery-mutual-block').set({ blocker_id: target.uid, blocked_id: friend.profileId });
    assert.equal((await run(alice, { candidateIds: [target.profileId] })).profiles[0].mutual_count, 0);
    await db.doc('blocked_users/discovery-mutual-block').delete();
    for (const [id] of rows) await db.doc(`friend_requests/${id}`).delete();
  });
  await check('pending outgoing and dismissed aliases are excluded by exact current pairs', async () => {
    await db.doc('friend_requests/discovery-pending').set({ sender_id: alice.uid, receiver_id: bob.uid, status: 'pending' });
    assert.deepEqual((await run(alice, { candidateIds: [bob.profileId] })).profiles, []);
    await db.doc('friend_requests/discovery-pending').delete();
    await db.doc('dismissed_profiles/discovery-dismissed').set({ user_id: alice.profileId, dismissed_user_id: bob.uid });
    assert.deepEqual((await run(alice, { candidateIds: [bob.profileId] })).profiles, []);
    await db.doc('dismissed_profiles/discovery-dismissed').delete();
  });
  await check('read-only 120-selection performance and output cap', async () => {
    const candidates = [];
    for (let i = 0; i < 120; i++) candidates.push((await seed(`bulk-${i}`, '2001-05-03', { is_private: i < 90 })).profileId);
    const snapshot = async () => {
      const collections = (await db.listCollections()).sort((a, b) => a.id.localeCompare(b.id));
      return Promise.all(collections.map(async collection => [collection.id, (await collection.get()).docs
        .map(doc => [doc.id, doc.data()]).sort((a, b) => String(a[0]).localeCompare(String(b[0])))]));
    };
    const before = await snapshot();
    const started = performance.now(); const result = await run(alice, { candidateIds: candidates, limit: 120 }); const elapsedMs = Math.round(performance.now() - started);
    assert.equal(result.profiles.length, 30); assert.equal(new Set(result.profiles.map(row => row.id)).size, 30);
    assert.deepEqual(await snapshot(), before);
    console.log(JSON.stringify({ selected: candidates.length, output: result.profiles.length, elapsedMs }));
  });
  console.log(JSON.stringify({ groups, projectId, productionUntouched: true }));
} finally { await db.terminate(); }
