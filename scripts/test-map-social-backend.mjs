import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
const projectId = process.env.GCLOUD_PROJECT;
assert.match(projectId || '', /^demo-[a-z0-9-]+$/); assert.notEqual(projectId, 'demo-vybe-preview');
assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):\d+$/);
assert.notEqual(process.env.FIRESTORE_EMULATOR_HOST.split(':')[1], '8280');
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId });
const { db } = await import('../functions/lib/_shared/admin.js');
const { Timestamp } = await import('../functions/node_modules/firebase-admin/lib/firestore/index.js');
const { runManageMapSocial, manageMapSocial } = await import('../functions/lib/mapSocial.js');
const { notifyMapMeetup, mapSocialMembershipId } = await import('../functions/lib/_shared/mapSocialAuthority.js');
const { getOrResearchLocationIntel } = await import('../functions/lib/_shared/mapLocationIntel.js');
const { researchMapLocation } = await import('../functions/lib/vybemap.js');
const require = createRequire(path.resolve(process.env.FIREBASE_TEST_TOOLS_ROOT || '.', 'package.json'));
const { initializeTestEnvironment, assertFails } = require('@firebase/rules-unit-testing');
const { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc, query, where, setLogLevel } = require('firebase/firestore');
setLogLevel('silent');
const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
const env = await initializeTestEnvironment({ projectId, firestore: { host, port: Number(port), rules: await readFile(process.env.FIRESTORE_RULES_FILE || 'firestore.rules', 'utf8') } });
const now = Date.parse('2026-10-05T17:00:00.000Z');
const alice = { uid: 'map-alice', profile: 'map-alice-profile' }, bob = { uid: 'map-bob', profile: 'map-bob-profile' }, carol = { uid: 'map-carol', profile: 'map-carol-profile' };
const identity = person => ({ expectedOwnerUid: person.uid, expectedProfileId: person.profile });
const call = (person, input, at = now) => runManageMapSocial(db, person.uid, { ...identity(person), ...input }, at);
const mutation = (action, input = {}) => ({ action, requestId: randomUUID(), ...input });
const read = (person, kind, targetId) => call(person, { action: 'read', kind, targetId });
const list = (person, scope, input = {}, at = now) => call(person, { action: 'list', scope, ...input }, at);
const placeInput = { name: 'Synthetic map place', category: 'hangout', description: 'Fixture only', latitude: 30, longitude: -97 };
const meetupInput = { title: 'Synthetic meetup', description: 'Fixture only', latitude: 30, longitude: -97, destLabel: 'Synthetic location' };
const seedProfile = async who => {
  await db.doc(`profiles/${who.profile}`).set({ user_id: who.uid, username: who.uid, display_name: 'Synthetic person', email: 'PRIVATE@invalid.test' });
  await db.doc(`user_auth_index/${who.uid}`).set({ profile_id: who.profile });
};
const connection = db.doc('friend_requests/map-test-friends'), block = db.doc('blocked_users/map-test-block');
const friend = { sender_id: alice.profile, receiver_id: bob.profile, status: 'accepted' };
const intel = (person, input) => researchMapLocation.run({ auth: { uid: person.uid }, data: { ...identity(person), ...input } });
async function injectedResearch(fn) {
  const originalFetch = globalThis.fetch, originalKey = process.env.GEMINI_API_KEY; process.env.GEMINI_API_KEY = 'injected-test-only';
  const control = { calls: 0, beforeGemini: async () => {}, output: { safety_score: 50, verdict: 'caution', summary: 'Synthetic injected output', labels: [], tips: [] } };
  globalThis.fetch = async request => {
    control.calls++;
    if (String(request).startsWith('https://nominatim.openstreetmap.org/')) return { ok: true, json: async () => ({ display_name: 'Synthetic fixture area' }) };
    assert.ok(String(request).startsWith('https://generativelanguage.googleapis.com/'));
    await control.beforeGemini();
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(control.output) }] } }] }) };
  };
  try { await fn(control); }
  finally { globalThis.fetch = originalFetch; if (originalKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = originalKey; }
}
let checks = 0, ruleChecks = 0;
const check = async (name, fn) => { await fn(); checks++; console.log(`PASS ${name}`); };
let place, post, meetup;
try {
  for (const person of [alice, bob, carol]) await seedProfile(person);
  await connection.set(friend);
  await check('callable and identity/shape/finite coordinate validation reject before writes', async () => {
    await assert.rejects(manageMapSocial.run({ data: {} }), { code: 'unauthenticated' });
    await assert.rejects(call(alice, { action: 'list', scope: 'places', expectedOwnerUid: bob.uid }), { code: 'failed-precondition' });
    await assert.rejects(call(alice, { action: 'list', scope: 'places', expectedProfileId: bob.profile }), { code: 'failed-precondition' });
    for (const patch of [{ latitude: NaN }, { longitude: Infinity }, { latitude: 91 }, { longitude: -181 }, { name: ' ' }, { category: 'unknown' },
      { photoUrl: 'javascript:alert(1)' }, { created_by: bob.profile }, { requestId: 'not-stable' }]) {
      await assert.rejects(call(alice, mutation('createPlace', { ...placeInput, ...patch })), { code: 'invalid-argument' });
    }
    assert.equal((await db.collection('map_places').get()).size, 0);
  });
  await check('new place and one initial friends check-in are atomic and exact-request idempotent', async () => {
    const input = mutation('createPlace', placeInput); place = await call(alice, input);
    assert.equal(place.ok, true); assert.equal(place.item.created_by, alice.profile); assert.equal(place.item.check_in_count, 1);
    assert.equal(place.item.visibility, 'friends'); assert.equal(place.item.legacy, false); assert.equal(place.validUntil - place.serverTime, 15000);
    assert.deepEqual(await call(alice, input), place);
    assert.equal((await db.collection('map_places').get()).size, 1); assert.equal((await db.collection('map_check_ins').get()).size, 1);
    await assert.rejects(call(alice, { ...input, name: 'Changed retry' }), { code: 'already-exists' });
    assert.equal((await read(bob, 'place', place.resourceId)).item.id, place.resourceId);
    assert.equal((await read(carol, 'place', place.resourceId)).item, null);
    assert.ok(!JSON.stringify(place).includes('PRIVATE'));
  });
  await check('friend check-in increments another owner count atomically; replay cannot duplicate', async () => {
    const input = mutation('checkIn', { placeId: place.resourceId, message: 'A fixture check-in' });
    const receipt = await call(bob, input), again = await call(bob, input);
    assert.equal(receipt.item.user_id, bob.profile); assert.equal(receipt.resourceId, again.resourceId);
    assert.equal((await read(alice, 'place', place.resourceId)).item.check_in_count, 2);
    assert.equal((await db.collection('map_check_ins').get()).size, 2);
    await assert.rejects(call(carol, mutation('checkIn', { placeId: place.resourceId })), { code: 'permission-denied' });
    await assert.rejects(call(alice, mutation('checkIn', { placeId: place.resourceId, latitude: 1 })), { code: 'invalid-argument' });
  });
  await check('place posts and cross-owner replies have one atomic count and stable exact replay', async () => {
    post = await call(alice, mutation('createPlacePost', { placeId: place.resourceId, content: 'Synthetic place post' }));
    const input = mutation('createComment', { postId: post.resourceId, content: 'Synthetic reply' });
    const receipt = await call(bob, input);
    assert.equal(receipt.item.post_id, post.resourceId); assert.equal(receipt.item.user_id, bob.profile);
    assert.equal((await list(alice, 'placePosts', { targetId: place.resourceId })).items[0].comment_count, 1);
    assert.equal((await call(bob, input)).resourceId, receipt.resourceId);
    assert.equal((await list(alice, 'comments', { targetId: post.resourceId })).items.length, 1);
    await assert.rejects(call(bob, { ...input, content: 'Changed reply' }), { code: 'already-exists' });
  });
  await check('concurrent check-ins keep exact totals with no partial counter writes', async () => {
    const requests = Array.from({ length: 4 }, () => mutation('checkIn', { placeId: place.resourceId }));
    await Promise.all(requests.map(input => call(bob, input)));
    assert.equal((await read(alice, 'place', place.resourceId)).item.check_in_count, 6);
    await Promise.all(requests.map(input => call(bob, input)));
    assert.equal((await read(alice, 'place', place.resourceId)).item.check_in_count, 6);
  });
  await check('friend removal, blocks in either alias direction, and current location/privacy settings remove content', async () => {
    assert.equal((await list(carol, 'checkIns')).items.length, 0);
    for (const [blocker_id, blocked_id] of [[alice.uid, bob.profile], [bob.uid, alice.profile]]) {
      await block.set({ blocker_id, blocked_id });
      assert.equal((await read(bob, 'place', place.resourceId)).item, null);
      assert.equal((await list(bob, 'placePosts', { targetId: place.resourceId })).items.length, 0);
      assert.equal((await list(bob, 'checkIns')).items.length, 0); await block.delete();
    }
    await connection.update({ status: 'rejected' }); assert.equal((await read(bob, 'place', place.resourceId)).item, null); await connection.set(friend);
    await db.doc(`profile_visibility/${alice.profile}`).set({ fields: { location: 'only_me' } });
    assert.equal((await read(bob, 'place', place.resourceId)).item, null);
    await db.doc(`profile_visibility/${alice.profile}`).set({ fields: { location: 'bogus' } });
    assert.equal((await read(bob, 'place', place.resourceId)).item, null); await db.doc(`profile_visibility/${alice.profile}`).delete();
    await db.doc(`profiles/${alice.profile}`).update({ is_private: true });
    assert.equal((await read(bob, 'place', place.resourceId)).item, null); await db.doc(`profiles/${alice.profile}`).update({ is_private: false });
  });
  await check('friend check-ins are queried from current aliases across chunks, never buried by stranger traffic', async () => {
    const batch = db.batch();
    for (let n = 0; n < 110; n++) batch.set(db.doc(`map_check_ins/stranger-${n}`), { user_id: carol.profile, place_id: place.resourceId, created_at: new Date(now + 1).toISOString() });
    // Force multiple bounded candidate chunks, including a migrated Auth UID
    // friendship. Missing profile candidates do not confer admission.
    for (let n = 0; n < 31; n++) batch.set(db.doc(`friend_requests/chunk-${n}`), { sender_id: bob.uid, receiver_id: `missing-profile-${n}`, status: 'accepted' });
    await batch.commit(); await connection.set({ sender_id: alice.uid, receiver_id: bob.uid, status: 'accepted' });
    const page = await list(bob, 'checkIns', {}, now + 2);
    assert.equal(page.items.length, 6); assert.ok(page.items.every(row => [alice.profile, bob.profile].includes(row.user_id)));
    assert.equal(page.nextCursor, null, 'Unrelated traffic must not create empty continuation work');
    await connection.set(friend);
  });
  await check('raw caller-written legacy rows need explicit owner review with exact source revision', async () => {
    const targetId = 'legacy-map-place';
    await db.doc(`map_places/${targetId}`).set({ ...placeInput, photo_url: null, created_by: alice.profile, created_at: new Date(now - 1000).toISOString(), check_in_count: 999 });
    const own = await read(alice, 'place', targetId); assert.equal(own.item.legacy, true); assert.equal(own.item.check_in_count, 0);
    assert.equal((await read(bob, 'place', targetId)).item, null);
    await assert.rejects(call(alice, mutation('checkIn', { placeId: targetId })), { code: 'permission-denied' });
    await db.doc(`map_places/${targetId}`).update({ name: 'Changed after review' });
    await assert.rejects(call(alice, mutation('publishPlace', { targetId, expectedRevision: own.item.revision })), { code: 'aborted' });
    const reviewed = await read(alice, 'place', targetId), input = mutation('publishPlace', { targetId, expectedRevision: reviewed.item.revision });
    const shared = await call(alice, input); assert.equal(shared.resourceId, targetId); assert.equal(shared.item.legacy, false); assert.equal(shared.item.check_in_count, 0);
    assert.equal((await read(bob, 'place', targetId)).item.name, 'Changed after review');
    await db.doc(`map_places/${targetId}`).update({ name: 'Tampered after publication' });
    assert.equal((await read(alice, 'place', targetId)).item, null, 'Stale proof must not become legacy');
    assert.equal((await call(alice, input)).status, 'unavailable', 'Receipt cannot resurrect tampered source');
    await db.doc(`map_places/${targetId}`).delete(); assert.equal((await call(alice, input)).item, null);
    assert.equal((await db.doc(`map_places/${targetId}`).get()).exists, false);
  });
  await check('meetup creation atomically creates host membership; join leave rejoin and replay reflect current phase', async () => {
    meetup = await call(alice, mutation('createMeetup', meetupInput));
    assert.equal(meetup.item.member_count, 1); assert.equal(meetup.item.membership.status, 'going');
    assert.equal((await db.doc(`_map_social_memberships/${mapSocialMembershipId(alice.uid, meetup.resourceId)}`).get()).exists, true);
    const joinInput = mutation('joinMeetup', { meetupId: meetup.resourceId, expectedRevision: null });
    const joined = await call(bob, joinInput); assert.equal(joined.status, 'going'); assert.equal(joined.item.member_count, 2);
    assert.equal((await call(bob, joinInput)).item.member_count, 2);
    const leaveInput = mutation('leaveMeetup', { meetupId: meetup.resourceId, expectedRevision: joined.item.membership.revision });
    const left = await call(bob, leaveInput); assert.equal(left.status, 'left'); assert.equal(left.item.member_count, 1);
    assert.equal((await call(bob, joinInput)).status, 'left', 'Old join receipt cannot falsely report going');
    const rejoined = await call(bob, mutation('joinMeetup', { meetupId: meetup.resourceId, expectedRevision: left.item.membership.revision }));
    assert.equal(rejoined.status, 'going'); assert.equal(rejoined.item.member_count, 2);
    await assert.rejects(call(bob, mutation('leaveMeetup', { meetupId: meetup.resourceId, expectedRevision: left.item.membership.revision })), { code: 'aborted' });
    await assert.rejects(call(alice, mutation('leaveMeetup', { meetupId: meetup.resourceId, expectedRevision: meetup.item.membership.revision })), { code: 'failed-precondition' });
  });
  await check('concurrent opposite RSVPs use membership CAS and denied content never traps own leave', async () => {
    const before = (await read(bob, 'meetup', meetup.resourceId)).item;
    const attempts = await Promise.allSettled(['joinMeetup', 'leaveMeetup'].map(action => call(bob, mutation(action, { meetupId: meetup.resourceId, expectedRevision: before.membership.revision }))));
    assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 1); assert.equal(attempts.find(result => result.status === 'rejected').reason.code, 'aborted');
    const current = (await read(bob, 'meetup', meetup.resourceId)).item;
    await block.set({ blocker_id: alice.uid, blocked_id: bob.profile });
    const input = mutation('leaveMeetup', { meetupId: meetup.resourceId, expectedRevision: current.membership.revision });
    const left = await call(bob, input); assert.equal(left.status, 'left'); assert.equal(left.item, null); assert.equal((await call(bob, input)).status, 'left');
    assert.equal((await read(alice, 'meetup', meetup.resourceId)).item.member_count, 1); await block.delete();
  });
  await check('legacy meetup membership is never adopted; explicit share establishes one fresh host', async () => {
    const targetId = 'legacy-meetup';
    await db.doc(`map_meetups/${targetId}`).set({ host_id: alice.profile, title: 'Legacy review', description: null, dest_latitude: 30, dest_longitude: -97,
      dest_label: 'Fixture only', starts_at: new Date(now - 1000).toISOString(), created_at: new Date(now - 1000).toISOString(), status: 'active', member_count: 999 });
    await db.doc('map_meetup_members/forged-old-membership').set({ user_id: bob.profile, meetup_id: targetId, status: 'going' });
    const own = (await read(alice, 'meetup', targetId)).item;
    assert.equal(own.legacy, true); assert.equal(own.membership, null); assert.equal((await read(bob, 'meetup', targetId)).item, null);
    const shared = await call(alice, mutation('publishMeetup', { targetId, expectedRevision: own.revision }));
    assert.equal(shared.item.member_count, 1); assert.equal((await read(bob, 'meetup', targetId)).item.membership, null);
  });
  await check('opaque pagination preserves equal-date rows, rejects other accounts/selections/expiry and rechecks access', async () => {
    const batch = db.batch();
    for (let n = 0; n < 44; n++) batch.set(db.doc(`map_places/page-${String(n).padStart(3, '0')}`), { ...placeInput, created_by: carol.profile, photo_url: null, check_in_count: 999, created_at: new Date(now - 500).toISOString() });
    await batch.commit();
    const first = await list(carol, 'places'); assert.ok(first.nextCursor); assert.ok(first.items.length <= 20);
    const seen = new Set(first.items.map(row => row.id)); let next = first.nextCursor;
    while (next) { const page = await list(carol, 'places', { cursor: next }); for (const item of page.items) { assert.ok(!seen.has(item.id)); seen.add(item.id); } next = page.nextCursor; }
    assert.equal([...seen].filter(value => value.startsWith('page-')).length, 44);
    await assert.rejects(list(bob, 'places', { cursor: first.nextCursor }), { code: 'failed-precondition' });
    await assert.rejects(list(carol, 'meetups', { cursor: first.nextCursor }), { code: 'failed-precondition' });
    await assert.rejects(list(carol, 'places', { cursor: first.nextCursor }, now + 600001), { code: 'failed-precondition' });
    const bobPage = await list(bob, 'places'); assert.ok(bobPage.nextCursor, 'Denied candidates still preserve next page');
    await block.set({ blocker_id: alice.uid, blocked_id: bob.profile });
    const blockedPage = await list(bob, 'places', { cursor: bobPage.nextCursor }); assert.equal(blockedPage.items.length, 0); await block.delete();
  });
  await check('retired bindings and UID/profile collisions reject without changing map authority', async () => {
    await db.doc(`_account_profile_bindings/${bob.uid}`).set({ version: 1, owner_uid: bob.uid, profile_id: bob.profile, status: 'retired', revision: 'a'.repeat(48) });
    await assert.rejects(list(bob, 'places'), { code: 'failed-precondition' }); await db.doc(`_account_profile_bindings/${bob.uid}`).delete();
    await db.doc(`profiles/${bob.uid}`).set({ user_id: carol.uid }); await assert.rejects(list(bob, 'places'), { code: 'failed-precondition' }); await db.doc(`profiles/${bob.uid}`).delete();
  });
  await check('unadmitted Timestamp/number dates and long document IDs cannot mint unusable cursors', async () => {
    const cursorPlace = await call(alice, mutation('createPlace', { ...placeInput, name: 'Cursor fixture' }));
    const batch = db.batch();
    for (let n = 0; n < 19; n++) batch.set(db.doc(`map_place_posts/z-cursor-${n}`), { place_id: cursorPlace.resourceId, user_id: alice.profile, content: 'Unproven', created_at: new Date(now - 1000).toISOString() });
    batch.set(db.doc(`map_place_posts/m-${'x'.repeat(300)}`), { place_id: cursorPlace.resourceId, user_id: alice.profile, content: 'Unproven', created_at: new Date(now - 1000).toISOString() });
    batch.set(db.doc('map_place_posts/a-cursor-last'), { place_id: cursorPlace.resourceId, user_id: alice.profile, content: 'Unproven', created_at: new Date(now - 1000).toISOString() });
    batch.set(db.doc('map_place_posts/mixed-cursor-timestamp'), { place_id: cursorPlace.resourceId, user_id: alice.profile, content: 'Unproven', created_at: Timestamp.fromMillis(now - 1000) });
    batch.set(db.doc('map_place_posts/mixed-cursor-number'), { place_id: cursorPlace.resourceId, user_id: alice.profile, content: 'Unproven', created_at: 12 });
    await batch.commit();
    const first = await list(alice, 'placePosts', { targetId: cursorPlace.resourceId }); assert.ok(first.nextCursor); assert.deepEqual(first.items, []);
    const second = await list(alice, 'placePosts', { targetId: cursorPlace.resourceId, cursor: first.nextCursor }); assert.deepEqual(second.items, []); assert.equal(second.nextCursor, null);
  });
  await check('meetup notifications require proven current friend admission and stable one-time delivery', async () => {
    await db.doc('map_meetups/unproven-notify').set({ host_id: alice.profile, title: 'Unproven', status: 'active' });
    assert.equal((await notifyMapMeetup(db, 'unproven-notify', now)).sent, 0);
    assert.equal((await notifyMapMeetup(db, meetup.resourceId, now)).sent, 1);
    assert.equal((await notifyMapMeetup(db, meetup.resourceId, now)).sent, 0);
    const another = await call(alice, mutation('createMeetup', { ...meetupInput, title: 'No blocked notice' }));
    await block.set({ blocker_id: bob.profile, blocked_id: alice.uid }); assert.equal((await notifyMapMeetup(db, another.resourceId, now)).sent, 0); await block.delete();
    assert.equal((await db.collection('notifications').where('type', '==', 'map_meetup').get()).size, 1);
    await db.doc(`map_meetups/${another.resourceId}`).delete(); assert.equal((await notifyMapMeetup(db, another.resourceId, now)).sent, 0);
  });
  await check('injected area research never mutates a place publication or recreates a deleted place ID', async () => {
    const before = (await db.doc(`map_places/${place.resourceId}`).get()).data();
    await injectedResearch(async control => {
      const guard = { ownerUid: alice.uid, profileId: alice.profile, beforeResearch: async () => {}, beforeReturn: async () => {} };
      await getOrResearchLocationIntel({ ...guard, lat: 30, lng: -97, placeId: place.resourceId, forceRefresh: true });
      assert.deepEqual((await db.doc(`map_places/${place.resourceId}`).get()).data(), before);
      assert.ok((await read(bob, 'place', place.resourceId)).item);
      await getOrResearchLocationIntel({ ...guard, lat: 30, lng: -97, placeId: 'deleted-map-place', forceRefresh: true });
      assert.equal((await db.doc('map_places/deleted-map-place').get()).exists, false); assert.equal(control.calls, 4);
    });
  });
  await check('area cache is exact-request/actor private, ignores old global rows and derives admitted place details', async () => {
    await db.doc('map_location_intel/30_-97').set({ cache_key: '30_-97', latitude: 30.000123, longitude: -97.000456, place_name: 'OTHER PRIVATE NAME', summary: 'OTHER PRIVATE CONTENT', expires_at: '2099-01-01T00:00:00.000Z' });
    await injectedResearch(async control => {
      const aliceResult = await intel(alice, { placeId: place.resourceId, latitude: 0, longitude: 0, placeName: 'Caller spoofed name' });
      assert.equal(aliceResult.ok, true); assert.equal(aliceResult.ownerUid, alice.uid); assert.equal(aliceResult.profileId, alice.profile);
      assert.equal(aliceResult.placeId, place.resourceId); assert.equal(aliceResult.validUntil - aliceResult.serverTime, 15000);
      assert.equal(aliceResult.intel.latitude, 30); assert.equal(aliceResult.intel.longitude, -97); assert.equal(aliceResult.intel.place_name, placeInput.name);
      assert.match(aliceResult.intel.cache_key, /^[a-f0-9]{64}$/); assert.ok(!JSON.stringify(aliceResult).includes('OTHER PRIVATE'));
      const priorCalls = control.calls;
      for (let n = 0; n < 14; n++) await intel(alice, { placeId: place.resourceId });
      assert.equal(control.calls, priorCalls, 'Fresh cache reads must not consume provider quota or invoke a provider');
      const bobResult = await intel(bob, { placeId: place.resourceId }); assert.notEqual(bobResult.intel.cache_key, aliceResult.intel.cache_key);
      const draft = await intel(alice, { latitude: 31, longitude: -98, placeName: 'My private draft' });
      const renamed = await intel(alice, { latitude: 31, longitude: -98, placeName: 'My other private draft' });
      assert.notEqual(draft.intel.cache_key, renamed.intel.cache_key); assert.equal(renamed.intel.place_name, 'My other private draft');
      const callsBeforeDenial = control.calls;
      await assert.rejects(intel(carol, { placeId: place.resourceId }), { code: 'permission-denied' });
      await assert.rejects(intel(alice, { placeId: 'deleted-map-place' }), { code: 'permission-denied' });
      assert.equal(control.calls, callsBeforeDenial);
      await assert.rejects(intel(alice, { latitude: NaN, longitude: 0 }), { code: 'invalid-argument' });
    });
  });
  await check('late area research cannot return or cache after block/account retirement or place revision changes', async () => {
    for (const reason of ['block', 'retire', 'revision']) await injectedResearch(async control => {
      let started, release;
      const startedPromise = new Promise(resolve => { started = resolve; }), waiting = new Promise(resolve => { release = resolve; });
      control.beforeGemini = async () => { started(); await waiting; };
      const request = intel(bob, { placeId: place.resourceId, forceRefresh: true });
      const expected = reason === 'block' ? 'permission-denied' : reason === 'retire' ? 'failed-precondition' : 'aborted';
      const rejected = assert.rejects(request, { code: expected });
      await startedPromise;
      if (reason === 'block') await block.set({ blocker_id: alice.uid, blocked_id: bob.profile });
      if (reason === 'retire') await db.doc(`_account_profile_bindings/${bob.uid}`).set({ version: 1, owner_uid: bob.uid, profile_id: bob.profile, status: 'retired', revision: 'a'.repeat(48) });
      if (reason === 'revision') await call(alice, mutation('checkIn', { placeId: place.resourceId }));
      release(); await rejected;
      if (reason === 'block') await block.delete();
      if (reason === 'retire') await db.doc(`_account_profile_bindings/${bob.uid}`).delete();
    });
  });
  await check('malformed injected research output is rejected and zero remains zero rather than an invented score', async () => {
    await injectedResearch(async control => {
      const opts = { ownerUid: carol.uid, profileId: carol.profile, lat: 32, lng: -99, forceRefresh: true, beforeResearch: async () => {}, beforeReturn: async () => {} };
      const valid = { ...control.output };
      for (const patch of [{ labels: [null] }, { labels: [{ type: 'test', severity: 'safe', title: 'Test', detail: 'Test' }] }, { safety_score: '100' }, { verdict: 'sure' }, { tips: [22] }]) {
        control.output = { ...valid, ...patch }; await assert.rejects(getOrResearchLocationIntel(opts), { code: 'unavailable' });
      }
      control.output = { ...valid, safety_score: 0 }; assert.equal((await getOrResearchLocationIntel(opts)).safety_score, 0);
    });
  });
  await check('raw map locations/content/members and protected authority deny direct get/query/write even to owner', async () => {
    const tables = ['map_places', 'map_place_posts', 'map_place_post_comments', 'map_check_ins', 'map_meetups', 'map_meetup_members',
      '_map_social_publications', '_map_social_memberships', '_map_social_receipts', '_map_social_cursors', '_map_social_notifications', 'map_location_intel'];
    for (const table of tables) await db.doc(`${table}/raw-attempt`).set({ user_id: alice.profile, created_by: alice.profile, host_id: alice.profile });
    for (const person of [alice, bob, carol, null]) {
      const client = person ? env.authenticatedContext(person.uid).firestore() : env.unauthenticatedContext().firestore();
      for (const table of tables) {
        const ref = doc(client, table, 'raw-attempt');
        for (const op of [() => getDoc(ref), () => getDocs(collection(client, table)), () => setDoc(ref, { user_id: person?.profile ?? alice.profile, created_by: person?.profile ?? alice.profile, host_id: person?.profile ?? alice.profile }),
          () => updateDoc(ref, { user_id: bob.profile }), () => deleteDoc(ref)]) { await assertFails(op()); ruleChecks++; }
      }
      await assertFails(getDocs(query(collection(client, 'map_check_ins'), where('user_id', '==', alice.profile)))); ruleChecks++;
    }
  });
  console.log(`PASS ${checks} map social backend groups; ${ruleChecks} Firestore rules checks`);
} finally { await env.cleanup(); await db.terminate(); }
