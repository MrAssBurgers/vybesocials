import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
assert.equal(process.env.GCLOUD_PROJECT, 'demo-vybe-map-waves');
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8389');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9296');
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: process.env.GCLOUD_PROJECT });
const require = createRequire(path.resolve(process.env.FIREBASE_TEST_TOOLS_ROOT || '.', 'package.json'));
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { getDoc, getDocs, setDoc, updateDoc, deleteDoc, doc, collection, setLogLevel } = require('firebase/firestore'); setLogLevel('silent');
const { db, auth } = await import('../functions/lib/_shared/admin.js');
const { ensureAccountProfileForUid } = await import('../functions/lib/_shared/accountProfileAuthority.js');
const { runLocationSharing } = await import('../functions/lib/_shared/locationSharingAuthority.js');
const { manageMapWaveForUid, mapWaveHash } = await import('../functions/lib/_shared/mapWaveAuthority.js');
const { manageMapWave } = await import('../functions/lib/mapWaves.js');
const { closeFriendAuthorityId } = await import('../functions/lib/_shared/profileAudienceAuthority.js');
const env = await initializeTestEnvironment({ projectId: process.env.GCLOUD_PROJECT, firestore: { host: '127.0.0.1', port: 8389, rules: await readFile('firestore.rules', 'utf8') } });
// This suite uses isolated Auth and Firestore only; no provider dispatch is invoked.
const time = Date.now() + 3600000;
let groups = 0, rules = 0, fixtures = 0;
const check = async (label, run) => { await run(); groups++; console.log(`PASS ${label}`); };
async function actor(uid, migrated = false) {
  const user = await auth.createUser({ uid }), created = Date.parse(user.metadata.creationTime), profileId = migrated ? `profile-${uid}` : uid;
  if (migrated) await db.doc(`profiles/${profileId}`).set({ user_id: uid, username: uid, display_name: 'Canonical map friend' });
  await ensureAccountProfileForUid(db, auth, uid, { action: 'ensure', expectedOwnerUid: uid, expectedAccountCreatedAt: created, requestId: randomUUID() });
  return { uid, profileId, created };
}
const location = (who, data, now = time) => runLocationSharing(db, who.uid, { expectedOwnerUid: who.uid, expectedProfileId: who.profileId,
  ...(data.action === 'read' ? {} : { requestId: randomUUID() }), ...data }, now);
async function pair(duration = '1h') {
  const n = ++fixtures, from = await actor(`wave-from-${n}`, true), to = await actor(`wave-to-${n}`, true);
  const friend = db.doc(`friend_requests/wave-friends-${n}`); await friend.set({ sender_id: from.uid, receiver_id: to.profileId, status: 'accepted' });
  const request = await location(from, { action: 'request', targetId: to.profileId, duration, precision: 'approximate', message: 'Synthetic test consent' });
  const accepted = await location(to, { action: 'respond', locationRequestId: request.request.id, expectedRevision: request.request.revision, intent: 'accept' });
  const enabled = await location(to, { action: 'setSharing', expectedRevision: null, enabled: true });
  const value = { from, to, friend, share: accepted.share, state: enabled.state };
  await position(value); return value;
}
const position = (value, now = time) => location(value.to, { action: 'publishPosition', sharingRevision: value.state.revision, sampledAt: now, latitude: 30.123456,
  longitude: -97.654321, accuracy: 10, speed: null, heading: null, batteryPercent: null, activityType: 'stationary' }, now);
const input = (value, patch = {}) => ({ action: 'send', expectedOwnerUid: value.from.uid, expectedProfileId: value.from.profileId, expectedAccountCreatedAt: value.from.created,
  targetProfileId: value.to.profileId, expectedAccessRevision: value.share.revision, requestId: randomUUID(), ...patch });
const send = (value, body = input(value), now = time, authority = auth) => manageMapWaveForUid(db, authority, value.from.uid, body, now);
const receiptPath = body => `_map_wave_receipts/${mapWaveHash([body.expectedOwnerUid, body.expectedAccountCreatedAt, body.requestId])}`;
const deny = async task => { await assertFails(task); rules++; };
try {
  await env.clearFirestore(); const base = await pair();
  await check('callable authentication, exact actor/incarnation and strict input bind every wave', async () => {
    await assert.rejects(manageMapWave.run({ data: {} }), { code: 'unauthenticated' });
    for (const patch of [{ expectedOwnerUid: base.to.uid }, { expectedProfileId: base.to.profileId }, { expectedAccountCreatedAt: base.from.created + 1000 }]) await assert.rejects(send(base, input(base, patch)), { code: 'failed-precondition' });
    for (const patch of [{ requestId: 'not-uuid' }, { expectedAccessRevision: 'bad' }, { targetProfileId: 'bad/path' }, { title: 'Spoofed name' }, { latitude: 50 }, { now: 0 }, { admin: true }]) await assert.rejects(send(base, input(base, patch)), { code: 'invalid-argument' });
    await assert.rejects(send(base, input(base, { targetProfileId: base.from.profileId })), { code: 'permission-denied' });
  });
  let first, body;
  await check('atomic notification and exact concurrent receipt create one canonical wave without actor GPS', async () => {
    body = input(base); const before = (await db.doc(`user_live_locations/${base.to.profileId}`).get()).data();
    const replies = await Promise.all([send(base, body), send(base, body)]); first = replies[0];
    assert.equal(new Set(replies.map(row => row.notificationId)).size, 1); assert.equal(replies.filter(row => !row.replayed).length, 1);
    assert.equal(first.status, 'sent'); assert.equal(first.cooldownUntil, first.sentAt + 60000); assert.ok(first.validUntil > first.serverTime && first.validUntil <= first.serverTime + 15000);
    const note = (await db.doc(`notifications/${first.notificationId}`).get()).data();
    assert.equal(note.title, 'Canonical map friend'); assert.equal(note.user_id, base.to.profileId); assert.equal(note.actor_id, base.from.profileId); assert.equal(note.type, 'map_wave'); assert.equal(note.deep_link, '/map');
    assert.equal(JSON.stringify(note).includes('30.123456'), false); assert.equal(JSON.stringify((await db.doc(receiptPath(body)).get()).data()).includes('30.123456'), false);
    assert.equal((await db.doc(`_location_state/${base.from.uid}`).get()).exists, false); assert.deepEqual((await db.doc(`user_live_locations/${base.to.profileId}`).get()).data(), before);
    assert.equal((await db.collection('notifications').get()).size, 1);
  });
  await check('new-request cooldown is atomic while exact retry only confirms the old notification', async () => {
    await assert.rejects(send(base), error => error.code === 'resource-exhausted' && error.details.cooldownUntil === first.cooldownUntil && error.details.serverTime < first.cooldownUntil);
    const replay = await send(base, body); assert.equal(replay.replayed, true); assert.equal(replay.sentAt, first.sentAt);
    await assert.rejects(send(base, { ...body, expectedAccessRevision: 'a'.repeat(48) }), { code: 'aborted' });
    const afterCooldown = first.cooldownUntil + 100;
    await position(base, afterCooldown);
    const replies = await Promise.allSettled([send(base, input(base), afterCooldown), send(base, input(base), afterCooldown)]);
    assert.equal(replies.filter(row => row.status === 'fulfilled').length, 1, JSON.stringify(replies.map(row => row.status === 'fulfilled' ? row.value : { code: row.reason.code, message: row.reason.message })));
    assert.equal(replies.filter(row => row.status === 'rejected' && row.reason.code === 'resource-exhausted').length, 1);
    const old = await send(base, body, afterCooldown + 1); assert.equal(old.sentAt, first.sentAt); assert.equal(old.replayed, true);
  });
  await check('friendship and both block directions are current and never converted to false success', async () => {
    const value = await pair();
    await value.friend.update({ status: 'declined' }); await assert.rejects(send(value), { code: 'permission-denied' }); await value.friend.update({ status: 'accepted' });
    for (const [blocker_id, blocked_id] of [[value.from.uid, value.to.profileId], [value.to.uid, value.from.profileId]]) {
      const ref = db.doc(`blocked_users/wave-${value.from.uid}`); await ref.set({ blocker_id, blocked_id }); await assert.rejects(send(value), { code: 'permission-denied' }); await ref.delete();
    }
    assert.equal((await send(value)).status, 'sent');
  });
  await check('location privacy and close-friend authority are enforced without trusting public hints', async () => {
    const value = await pair(), ref = db.doc(`profile_visibility/${value.to.profileId}`);
    for (const location of ['only_me', 'private', 'invalid']) { await ref.set({ fields: { location } }); await assert.rejects(send(value), { code: 'permission-denied' }); }
    await ref.set({ fields: { location: 'close_friends' } }); await assert.rejects(send(value), { code: 'permission-denied' });
    await db.doc(`_close_friend_authority/${closeFriendAuthorityId(value.to.uid, value.from.uid)}`).set({ version: 1, owner_uid: value.to.uid, owner_profile_id: value.to.profileId, friend_uid: value.from.uid, friend_profile_id: value.from.profileId, enabled: true });
    assert.equal((await send(value)).status, 'sent');
  });
  await check('pause/stop and enable ABA invalidate old receipts instead of reminting delivery', async () => {
    const value = await pair(), request = input(value), reply = await send(value, request);
    const paused = await location(value.to, { action: 'pause', shareId: value.share.id, expectedRevision: value.share.revision, paused: true });
    await assert.rejects(send(value, request), { code: 'permission-denied' });
    const resumed = await location(value.to, { action: 'pause', shareId: value.share.id, expectedRevision: paused.share.revision, paused: false });
    await assert.rejects(send(value, request), { code: 'aborted' }); value.share = resumed.share;
    await assert.rejects(send(value, { ...request, expectedAccessRevision: resumed.share.revision }), { code: 'already-exists' });
    assert.equal((await db.doc(`notifications/${reply.notificationId}`).get()).exists, true);
    const second = await pair(), original = input(second); await send(second, original);
    const off = await location(second.to, { action: 'setSharing', expectedRevision: second.state.revision, enabled: false });
    second.state = (await location(second.to, { action: 'setSharing', expectedRevision: off.state.revision, enabled: true })).state; await position(second, time + 1);
    await assert.rejects(send(second, original, time + 1), { code: 'aborted' });
  });
  await check('expired, stale, absent and while-using samples cannot authorize a new wave', async () => {
    const value = await pair(); await assert.rejects(send(value, input(value), time + 120001), { code: 'permission-denied' });
    await db.doc(`user_live_locations/${value.to.profileId}`).delete(); await assert.rejects(send(value), { code: 'permission-denied' });
    const whileUsing = await pair('while_using'); await assert.rejects(send(whileUsing, input(whileUsing), time + 30001), { code: 'permission-denied' });
    let checks = 0; const delayed = { getUser: async uid => { const user = await auth.getUser(uid); if (uid === whileUsing.from.uid && ++checks >= 2) await new Promise(resolve => setTimeout(resolve, 30)); return user; } };
    await assert.rejects(send(whileUsing, input(whileUsing), time + 29990, delayed), { code: 'permission-denied' });
  });
  await check('retired binding, UID collisions, disabled users and replaced Auth identities fail closed', async () => {
    const value = await pair(), bindingRef = db.doc(`_account_profile_bindings/${value.to.uid}`), binding = (await bindingRef.get()).data();
    await bindingRef.update({ status: 'retired' }); await assert.rejects(send(value), { code: 'failed-precondition' }); await bindingRef.set(binding);
    await db.doc(`profiles/${value.from.uid}`).set({ user_id: value.to.uid }); await assert.rejects(send(value), { code: 'failed-precondition' }); await db.doc(`profiles/${value.from.uid}`).delete();
    await auth.updateUser(value.to.uid, { disabled: true }); await assert.rejects(send(value), { code: 'failed-precondition' }); await auth.updateUser(value.to.uid, { disabled: false });
    const replaced = { getUser: async uid => { const user = await auth.getUser(uid); return uid === value.to.uid ? { ...user, metadata: { ...user.metadata, creationTime: new Date(value.to.created + 1000).toISOString() } } : user; } };
    await assert.rejects(send(value, input(value), time, replaced), { code: 'failed-precondition' });
    const oldGrant = db.doc(`_location_grants/${value.share.id}`); await oldGrant.update({ created_at_ms: value.to.created - 1 }); await assert.rejects(send(value), { code: 'permission-denied' });
  });
  await check('late external Auth changes and unreadable ownership never commit a notification', async () => {
    const value = await pair(); let calls = 0; const body = input(value);
    const late = { getUser: async uid => { const user = await auth.getUser(uid); return uid === value.to.uid && ++calls > 1 ? { ...user, disabled: true } : user; } };
    await assert.rejects(send(value, body, time, late), { code: 'failed-precondition' }); assert.equal((await db.doc(receiptPath(body)).get()).exists, false);
    const outage = { getUser: async () => { throw Object.assign(new Error('Synthetic outage'), { code: 'auth/internal-error' }); } };
    await assert.rejects(send(value, body, time, outage), { code: 'unavailable' });
  });
  await check('deleted/recreated grant/state source and notification documents cannot revive old proof', async () => {
    for (const kind of ['grant', 'state', 'notification']) {
      const value = await pair(), body = input(value), reply = await send(value, body);
      const ref = db.doc(kind === 'grant' ? `_location_grants/${value.share.id}` : kind === 'state' ? `_location_state/${value.to.uid}` : `notifications/${reply.notificationId}`), row = (await ref.get()).data();
      await ref.delete(); if (kind === 'notification') { await assert.rejects(send(value, body), { code: 'aborted' }); assert.equal((await ref.get()).exists, false); }
      await ref.set(row); await assert.rejects(send(value, body), { code: 'aborted' });
    }
  });
  await check('private receipt/cooldown Rules deny raw access and map_wave create remains denied', async () => {
    for (const namespace of ['_map_wave_receipts', '_map_wave_cooldowns']) {
      await db.doc(`${namespace}/rules-target`).set({ owner_uid: base.from.uid, user_id: base.from.profileId });
      for (const context of [env.authenticatedContext(base.from.uid), env.authenticatedContext(base.to.uid), env.authenticatedContext('staff', { admin: true }), env.unauthenticatedContext()]) {
        const client = context.firestore(), target = doc(client, namespace, 'rules-target');
        await deny(getDoc(target)); await deny(getDocs(collection(client, namespace))); await deny(setDoc(doc(client, namespace, 'new'), { user_id: base.from.profileId })); await deny(updateDoc(target, { until_ms: 0 })); await deny(deleteDoc(target));
      }
    }
    const sender = env.authenticatedContext(base.from.uid).firestore(), receiver = env.authenticatedContext(base.to.uid).firestore();
    await deny(setDoc(doc(sender, 'notifications', 'forged-wave'), { user_id: base.to.profileId, actor_id: base.from.profileId, type: 'map_wave', title: 'Spoof', body: 'Spoof', deep_link: '/map' }));
    await deny(getDoc(doc(sender, 'notifications', first.notificationId))); await assertSucceeds(getDoc(doc(receiver, 'notifications', first.notificationId))); rules++;
    await assertSucceeds(updateDoc(doc(receiver, 'notifications', first.notificationId), { read: true })); rules++;
  });
  console.log(`PASS ${groups} map wave backend groups + ${rules} Firestore rule checks`);
} finally { await env.cleanup(); }
