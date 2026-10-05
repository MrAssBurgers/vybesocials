import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const projectId = process.env.GCLOUD_PROJECT;
assert.match(projectId || '', /^demo-[a-z0-9-]+$/); assert.notEqual(projectId, 'demo-vybe-preview');
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8387');
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId });
const require = createRequire(path.resolve(process.env.FIREBASE_TEST_TOOLS_ROOT || '.', 'package.json'));
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { getDoc, getDocs, setDoc, updateDoc, deleteDoc, doc, collection, setLogLevel } = require('firebase/firestore'); setLogLevel('silent');
const { db } = await import('../functions/lib/_shared/admin.js');
const { runLocationSharing, locationGrantId } = await import('../functions/lib/_shared/locationSharingAuthority.js');
const { manageLocationSharing, createLocationRequest, syncLocationShareSnapshots } = await import('../functions/lib/locationSharing.js');
const { emergencyGhostMode, aggregateVybeHeatmap } = await import('../functions/lib/vybemap.js');
const env = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8387, rules: await readFile('firestore.rules', 'utf8') } });
const alice = { uid: 'location-alice', profileId: 'location-alice-profile' }, bob = { uid: 'location-bob', profileId: 'location-bob-profile' }, carol = { uid: 'location-carol', profileId: 'location-carol-profile' };
const time = Date.now();
const binding = actor => ({ expectedOwnerUid: actor.uid, expectedProfileId: actor.profileId });
const run = (actor, input, now = time) => runLocationSharing(db, actor.uid, { ...binding(actor), ...(input.action === 'read' ? {} : { requestId: randomUUID() }), ...input }, now);
const read = (actor, target, now = time) => run(actor, { action: 'read', ...(target ? { targetId: target.profileId } : {}) }, now);
const requestBody = target => ({ action: 'request', targetId: target.profileId, duration: '1h', precision: 'approximate', message: 'Synthetic local location request' });
const set = (actor, expectedRevision, enabled, now = time) => run(actor, { action: 'setSharing', expectedRevision, enabled }, now);
const sample = (state, patch = {}) => ({ action: 'publishPosition', sharingRevision: state.revision, sampledAt: time, latitude: 30.123456, longitude: -97.654321,
  accuracy: 8, speed: 2, heading: 30, batteryPercent: 60, activityType: 'walking', ...patch });
async function grant(requester, sharer, patch = {}, now = time) {
  const requested = await run(requester, { ...requestBody(sharer), ...patch }, now);
  return run(sharer, { action: 'respond', locationRequestId: requested.request.id, expectedRevision: requested.request.revision, intent: 'accept' }, now);
}
let groups = 0, ruleChecks = 0;
const check = async (name, fn) => { await fn(); groups++; console.log(`PASS ${name}`); };
try {
  await env.clearFirestore();
  for (const actor of [alice, bob, carol]) {
    await db.doc(`profiles/${actor.profileId}`).set({ user_id: actor.uid, username: actor.uid, display_name: actor.uid, is_private: false });
    await db.doc(`user_auth_index/${actor.uid}`).set({ profile_id: actor.profileId });
  }
  await db.doc('friend_requests/alice-bob').set({ sender_id: alice.uid, receiver_id: bob.profileId, status: 'accepted' });
  await check('strict inputs, authentication and canonical binding precede sharing', async () => {
    await assert.rejects(manageLocationSharing.run({ data: {} }), { code: 'unauthenticated' });
    await assert.rejects(run(alice, { action: 'read', expectedOwnerUid: bob.uid }), { code: 'failed-precondition' });
    await assert.rejects(run(alice, { action: 'read', expectedProfileId: bob.profileId }), { code: 'failed-precondition' });
    for (const patch of [{ targetId: 'bad/path' }, { duration: 'anything' }, { precision: 'unknown' }, { message: 'x'.repeat(201) }, { customMinutes: 15 }, { admin: true }]) await assert.rejects(run(alice, { ...requestBody(bob), ...patch }), { code: 'invalid-argument' });
    await assert.rejects(createLocationRequest.run({ auth: { uid: alice.uid }, data: { target_id: bob.profileId } }), { code: 'failed-precondition' });
    await db.doc(`profiles/${alice.uid}`).set({ user_id: bob.uid }); await assert.rejects(read(alice), { code: 'failed-precondition' }); await db.doc(`profiles/${alice.uid}`).delete();
    await assert.rejects(run(alice, requestBody(carol)), { code: 'permission-denied' });
  });
  await check('legacy shares and exact snapshots never establish fresh consent', async () => {
    await db.doc(`user_live_locations/${bob.profileId}`).set({ user_id: bob.profileId, latitude: 30.123456, longitude: -97.654321, sharing_enabled: true, is_ghost: false });
    await db.doc('location_shares/old').set({ sharer_id: bob.profileId, viewer_id: alice.profileId, active: true, paused: false, last_latitude: 30.123456, last_longitude: -97.654321 });
    assert.deepEqual((await read(alice)).locations, []); const owner = await read(bob); assert.equal(owner.state.enabled, false); assert.equal(owner.legacySharingNeedsReview, true);
    assert.ok(!JSON.stringify(owner).includes('30.123456'));
  });
  let accepted, enabled;
  await check('requests require explicit target acceptance and do not activate GPS', async () => {
    const body = { ...requestBody(bob), requestId: randomUUID() };
    const requested = await run(alice, body); assert.deepEqual(await run(alice, body), requested);
    await assert.rejects(run(alice, { ...body, precision: 'precise' }), { code: 'already-exists' });
    await assert.rejects(run(alice, { ...body, requestId: randomUUID() }), { code: 'already-exists' });
    const pending = await read(bob, alice); assert.equal(pending.requests[0].requester.id, alice.profileId); assert.equal(pending.requests[0].target.id, bob.profileId);
    await assert.rejects(run(carol, { action: 'respond', locationRequestId: requested.request.id, expectedRevision: requested.request.revision, intent: 'accept' }), { code: 'permission-denied' });
    accepted = await run(bob, { action: 'respond', locationRequestId: requested.request.id, expectedRevision: requested.request.revision, intent: 'accept' });
    assert.equal(accepted.share.viewerId, alice.profileId); assert.equal(accepted.share.sharerId, bob.profileId); assert.equal(accepted.share.id, locationGrantId(bob.uid, alice.uid));
    assert.equal((await read(bob)).state.enabled, false); assert.deepEqual((await read(alice)).locations, []);
    await assert.rejects(run(alice, body), { code: 'aborted' });
  });
  await check('explicit live consent binds every position and approximate output is coarsened on server', async () => {
    await assert.rejects(run(bob, sample({ revision: 'a'.repeat(48) })), { code: 'aborted' });
    enabled = await set(bob, null, true);
    const position = await run(bob, sample(enabled.state)); assert.equal(position.sharingRevision, enabled.state.revision);
    const view = await read(alice); assert.equal(view.locations.length, 1); assert.equal(view.leaseUntil, time + 15000);
    const location = view.locations[0]; assert.notEqual(location.latitude, 30.123456); assert.notEqual(location.longitude, -97.654321);
    assert.equal(location.precision, 'approximate'); assert.equal(location.speed, null); assert.equal(location.heading, null); assert.equal(location.approxRadiusM, 2000);
    assert.ok(!JSON.stringify(view).includes('30.123456')); assert.equal((await read(alice, bob)).locations.length, 1);
  });
  await check('precise permission and reciprocal grants remain directional', async () => {
    accepted = await grant(alice, bob, { precision: 'precise' });
    assert.equal((await read(alice)).locations[0].latitude, 30.123456);
    const reverse = await grant(bob, alice); assert.notEqual(reverse.share.id, accepted.share.id);
    const shares = (await read(alice)).shares; assert.equal(shares.length, 2); assert.equal(shares.filter(row => row.viewerId === alice.profileId).length, 1);
    assert.deepEqual((await read(bob)).locations, []);
  });
  await check('pause immediately hides coordinates, resume checks revision and old replay cannot undo ABA', async () => {
    const body = { action: 'pause', shareId: accepted.share.id, expectedRevision: accepted.share.revision, paused: true, requestId: randomUUID() };
    const paused = await run(bob, body); assert.deepEqual(await run(bob, body), paused); assert.deepEqual((await read(alice)).locations, []);
    await assert.rejects(run(alice, { ...body, requestId: randomUUID() }), { code: 'permission-denied' });
    const resumed = await run(bob, { action: 'pause', shareId: paused.share.id, expectedRevision: paused.share.revision, paused: false });
    assert.equal((await read(alice)).locations.length, 1); await assert.rejects(run(bob, body), { code: 'aborted' }); accepted = resumed;
  });
  await check('disable, late GPS and enable-disable-enable ABA never resurrect prior samples', async () => {
    const before = enabled.state.revision, body = { action: 'setSharing', expectedRevision: before, enabled: false, requestId: randomUUID() };
    const disabled = await run(bob, body); assert.deepEqual(await run(bob, body), disabled);
    assert.deepEqual((await read(alice)).locations, []); assert.equal((await db.doc(`user_live_locations/${bob.profileId}`).get()).exists, false);
    enabled = await set(bob, disabled.state.revision, true); await assert.rejects(run(bob, sample({ revision: before })), { code: 'aborted' });
    await assert.rejects(run(bob, body), { code: 'aborted' }); assert.deepEqual((await read(alice)).locations, []);
    await run(bob, sample(enabled.state));
  });
  await check('position lost replies are exact, stale samples cannot reorder and expired samples stay hidden', async () => {
    const body = sample(enabled.state, { sampledAt: time + 1000, requestId: randomUUID() });
    const published = await run(bob, body, time + 1000); assert.equal((await run(bob, body, time + 2000)).expiresAt, published.expiresAt);
    await assert.rejects(run(bob, { ...body, latitude: 20 }, time + 2000), { code: 'aborted' });
    await assert.rejects(run(bob, sample(enabled.state), time + 2000), { code: 'aborted' });
    assert.deepEqual((await read(alice, null, time + 121001)).locations, []);
    await assert.rejects(run(bob, sample(enabled.state, { sampledAt: time - 60001 })), { code: 'failed-precondition' });
    await assert.rejects(run(bob, sample(enabled.state, { latitude: 91 })), { code: 'invalid-argument' });
  });
  await check('each read respects bilateral blocks, current friendship and profile privacy', async () => {
    for (const [blocker, blocked] of [[alice.uid, bob.profileId], [bob.uid, alice.profileId]]) {
      await db.doc('blocked_users/map').set({ blocker_id: blocker, blocked_id: blocked }); assert.deepEqual((await read(alice)).locations, []); await db.doc('blocked_users/map').delete();
    }
    await db.doc('friend_requests/alice-bob').update({ status: 'declined' }); assert.deepEqual((await read(alice)).locations, []); await db.doc('friend_requests/alice-bob').update({ status: 'accepted' });
    await db.doc(`profile_visibility/${bob.profileId}`).set({ fields: { location: 'only_me' } }); assert.deepEqual((await read(alice)).locations, []); await db.doc(`profile_visibility/${bob.profileId}`).delete();
    assert.equal((await read(alice)).locations.length, 1);
  });
  await check('acceptance rechecks expired requests, friendship and blocks transactionally', async () => {
    const request = await run(alice, requestBody(bob)); const response = { action: 'respond', locationRequestId: request.request.id, expectedRevision: request.request.revision, intent: 'accept' };
    await assert.rejects(run(bob, response, time + 86400001), { code: 'aborted' });
    await db.doc('blocked_users/map').set({ blocker_id: alice.uid, blocked_id: bob.uid }); await assert.rejects(run(bob, response), { code: 'permission-denied' }); await db.doc('blocked_users/map').delete();
    await run(bob, { ...response, intent: 'decline' });
  });
  await check('grant expiry is enforced without relying on a scheduled snapshot job', async () => {
    const once = await grant(alice, bob, { duration: 'once' });
    await run(bob, sample(enabled.state, { sampledAt: time + 900001 }), time + 900001);
    assert.deepEqual((await read(alice, null, time + 900001)).locations, []);
    await assert.rejects(run(bob, { action: 'pause', shareId: once.share.id, expectedRevision: once.share.revision, paused: false }, time + 900001), { code: 'aborted' });
    accepted = await grant(alice, bob, {}, time + 900002);
  });
  await check('viewer stop invalidates accepted replay and cannot be resumed with the old revision', async () => {
    const requested = await run(alice, requestBody(bob), time + 900003);
    const response = { action: 'respond', locationRequestId: requested.request.id, expectedRevision: requested.request.revision, intent: 'accept', requestId: randomUUID() };
    const current = await run(bob, response, time + 900003);
    const stopped = await run(alice, { action: 'stop', shareId: current.share.id, expectedRevision: current.share.revision }, time + 900004); assert.equal(stopped.share.active, false);
    await assert.rejects(run(bob, response, time + 900004), { code: 'aborted' });
    await assert.rejects(run(bob, { action: 'pause', shareId: current.share.id, expectedRevision: current.share.revision, paused: false }, time + 900004), { code: 'aborted' });
  });
  await check('a pending request cannot resume a share stopped after the request was made', async () => {
    const current = await grant(alice, bob, {}, time + 900005);
    const requested = await run(alice, requestBody(bob), time + 900006);
    await run(alice, { action: 'stop', shareId: current.share.id, expectedRevision: current.share.revision }, time + 900007);
    await assert.rejects(run(bob, { action: 'respond', locationRequestId: requested.request.id, expectedRevision: requested.request.revision, intent: 'accept' }, time + 900008), { code: 'aborted' });
    await run(bob, { action: 'respond', locationRequestId: requested.request.id, expectedRevision: requested.request.revision, intent: 'decline' }, time + 900008);
    const after = await grant(alice, bob, {}, time + 900009); assert.equal(after.share.active, true);
  });
  await check('concurrent disable and position publication cannot leave an old generation live', async () => {
    const outcomes = await Promise.allSettled([set(bob, enabled.state.revision, false, time + 900010),
      run(bob, sample(enabled.state, { sampledAt: time + 900010 }), time + 900010)]);
    assert.equal(outcomes[0].status, 'fulfilled'); assert.equal((await read(bob, null, time + 900011)).state.enabled, false);
    assert.equal((await db.doc(`user_live_locations/${bob.profileId}`).get()).exists, false);
    enabled = await set(bob, outcomes[0].value.state.revision, true, time + 900012);
  });
  await check('while-using sharing expires its visible sample after thirty seconds without fresh foreground updates', async () => {
    const at = time + 900013;
    const current = await grant(alice, bob, { duration: 'while_using' }, at);
    assert.equal(Date.parse(current.share.expiresAt), at + 14400000);
    const position = await run(bob, sample(enabled.state, { sampledAt: at }), at);
    const location = (await read(alice, null, at)).locations[0];
    assert.equal(Date.parse(position.expiresAt), at + 120000);
    assert.equal(Date.parse(location.expiresAt), at + 30000);
    assert.equal((await read(alice, null, at + 29999)).locations.length, 1);
    assert.deepEqual((await read(alice, null, at + 30000)).locations, []);
  });
  await check('blocking a request stops both directional grants and old grants do not resume after unblock', async () => {
    const at = time + 900014;
    const requested = await run(alice, requestBody(bob), at);
    const result = await run(bob, { action: 'respond', locationRequestId: requested.request.id, expectedRevision: requested.request.revision, intent: 'block' }, at);
    assert.equal(result.request.status, 'blocked'); assert.equal(result.share, null);
    const blocks = await db.collection('blocked_users').where('blocker_id', '==', bob.profileId).where('blocked_id', '==', alice.profileId).get();
    assert.equal(blocks.size, 1);
    for (const id of [locationGrantId(alice.uid, bob.uid), locationGrantId(bob.uid, alice.uid)]) assert.equal((await db.doc(`_location_grants/${id}`).get()).data().active, false);
    assert.deepEqual((await read(alice, null, at)).locations, []);
    for (const doc of blocks.docs) await doc.ref.delete();
    assert.deepEqual((await read(alice, null, at)).locations, []);
    assert.deepEqual((await read(alice, null, at)).shares, []);
    assert.equal((await read(alice, bob, at)).shares.length, 2);
  });
  await check('emergency ghost uses canonical profile and the same ordered sharing revision', async () => {
    const response = await emergencyGhostMode.run({ auth: { uid: bob.uid }, data: { ...binding(bob), requestId: randomUUID(), expectedRevision: enabled.state.revision } });
    assert.equal(response.state.enabled, false); assert.equal((await db.doc(`user_live_locations/${bob.profileId}`).get()).exists, false);
    assert.equal((await db.doc(`user_live_locations/${bob.uid}`).get()).exists, false);
    await assert.rejects(run(bob, sample(enabled.state)), { code: 'aborted' });
  });
  await check('scheduled helpers cannot republish stale coordinates or global precise heatmap cells', async () => {
    await db.doc('heatmap_tiles/old').set({ cell_latitude: 30.123456, cell_longitude: -97.654321 });
    await aggregateVybeHeatmap.run({}); assert.equal((await db.collection('heatmap_tiles').get()).size, 0);
    await db.doc('user_live_locations/expired-qa').set({ expires_at_ms: 1, latitude: 30.123456 });
    await syncLocationShareSnapshots.run({}); assert.equal((await db.doc('location_shares/old').get()).data().last_latitude, 30.123456);
    assert.equal((await db.doc('user_live_locations/expired-qa').get()).exists, false);
    // The legacy snapshot remains private; cleanup never refreshes it.
  });
  await check('raw current, historical and protected location data stay unreadable and unwriteable', async () => {
    const collections = ['user_live_locations', 'user_locations', 'location_shares', 'location_requests', 'heatmap_tiles', '_location_grants', '_location_requests', '_location_state', '_location_receipts'];
    for (const actor of [env.unauthenticatedContext(), env.authenticatedContext(alice.uid), env.authenticatedContext(bob.uid), env.authenticatedContext('staff', { admin: true })]) {
      const client = actor.firestore();
      for (const name of collections) {
        const ref = doc(client, name, name === 'user_live_locations' ? bob.profileId : 'old');
        for (const action of [() => getDoc(ref), () => getDocs(collection(client, name)), () => setDoc(ref, { owner_uid: alice.uid }), () => updateDoc(ref, { active: true }), () => deleteDoc(ref)]) { await assertFails(action()); ruleChecks++; }
      }
    }
  });
  await check('private history remains owner-bound and rejects UID/profile collision access', async () => {
    const client = env.authenticatedContext(bob.uid).firestore(), viewer = env.authenticatedContext(alice.uid).firestore();
    const row = { user_id: bob.profileId, latitude: 30.123456, longitude: -97.654321, recorded_at: new Date().toISOString() };
    await assertSucceeds(setDoc(doc(client, 'location_history', 'history-qa'), row));
    await assertSucceeds(getDoc(doc(client, 'location_history', 'history-qa')));
    await assertFails(getDoc(doc(viewer, 'location_history', 'history-qa')));
    await assertFails(setDoc(doc(viewer, 'location_history', 'forged-qa'), row));
    await assertFails(updateDoc(doc(client, 'location_history', 'history-qa'), { user_id: alice.profileId }));
    await assertFails(setDoc(doc(client, 'location_history', 'invalid-qa'), { ...row, latitude: 91 }));
    await db.doc(`profiles/${bob.uid}`).set({ user_id: alice.uid });
    await assertFails(getDoc(doc(client, 'location_history', 'history-qa')));
    await assertFails(setDoc(doc(client, 'location_history', 'collision-qa'), row));
    await db.doc(`profiles/${bob.uid}`).delete(); await assertSucceeds(deleteDoc(doc(client, 'location_history', 'history-qa')));
    ruleChecks += 9;
  });
  console.log(`Location sharing: ${groups} grouped checks and ${ruleChecks} raw-rule checks passed.`);
} finally { await env.cleanup(); await db.terminate(); }
