import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
assert.equal(process.env.GCLOUD_PROJECT, 'demo-vybe-map-pins');
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8389');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9296');
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: process.env.GCLOUD_PROJECT });
const require = createRequire(path.resolve(process.env.FIREBASE_TEST_TOOLS_ROOT || '.', 'package.json'));
const { initializeTestEnvironment, assertFails } = require('@firebase/rules-unit-testing');
const { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc, setLogLevel } = require('firebase/firestore'); setLogLevel('silent');
const { db, auth } = await import('../functions/lib/_shared/admin.js');
const { ensureAccountProfileForUid } = await import('../functions/lib/_shared/accountProfileAuthority.js');
const { runManagePost } = await import('../functions/lib/_shared/postPublicationAuthority.js');
const { postSourceFingerprint } = await import('../functions/lib/_shared/postPublicationProof.js');
const { manageMapPinForUid, mapPinHash, mapPinId, approximateMapPinArea } = await import('../functions/lib/_shared/mapPinAuthority.js');
const { manageMapPin } = await import('../functions/lib/mapPins.js');
const { closeFriendAuthorityId } = await import('../functions/lib/_shared/profileAudienceAuthority.js');
const { manageFollowAuthority } = await import('../functions/lib/_shared/followAuthority.js');
const env = await initializeTestEnvironment({ projectId: process.env.GCLOUD_PROJECT, firestore: { host: '127.0.0.1', port: 8389, rules: await readFile('firestore.rules', 'utf8') } });
let groups = 0, rules = 0;
const check = async (name, run) => { await run(); groups++; console.log(`PASS ${name}`); };
const deny = async task => { await assertFails(task); rules++; };
const rev = () => randomBytes(24).toString('hex');
const actor = async uid => {
  const user = await auth.createUser({ uid }), created = Date.parse(user.metadata.creationTime), profileId = `profile-${uid}`;
  await db.doc(`profiles/${profileId}`).set({ user_id: uid, username: uid, is_private: false, display_name: 'Map QA creator' });
  await ensureAccountProfileForUid(db, auth, uid, { action: 'ensure', expectedOwnerUid: uid, expectedAccountCreatedAt: created, requestId: randomUUID() });
  await db.doc(`profile_visibility/${profileId}`).set({ fields: { location: 'public', posts: 'public', clips: 'public' } });
  return { uid, profileId, created };
};
const binding = who => ({ expectedOwnerUid: who.uid, expectedProfileId: who.profileId, expectedAccountCreatedAt: who.created });
const run = (who, data, authority = auth, now) => manageMapPinForUid(db, authority, who.uid, { ...binding(who), ...data }, now);
const payload = (type = 'post', patch = {}) => ({ type, caption: 'Synthetic map content', tags: [], mediaUrl: type === 'post' ? null : 'https://example.test/qa.mp4', mediaUrls: [], thumbnailUrl: null, ageRating: 'unrated', visibility: 'public', ...patch });
const publish = (who, type = 'post') => runManagePost(db, who.uid, { expectedOwnerUid: who.uid, expectedProfileId: who.profileId, action: 'create', postId: randomUUID(), requestId: randomUUID(), payload: payload(type) });
const changePost = (who, postId, expectedRevision, action, fields = {}) => runManagePost(db, who.uid, { expectedOwnerUid: who.uid, expectedProfileId: who.profileId, action, postId, expectedRevision, requestId: randomUUID(), ...fields });
const state = (who, sourceId, kind = 'post') => run(who, { action: 'state', kind, sourceId });
const area = { latitude: 30.123456, longitude: -97.654321, label: 'Chosen QA area' };
const shareInput = (sourceId, current, patch = {}) => ({ action: 'share', kind: current.kind, sourceId, expectedRevision: current.revision, expectedSourceRevision: current.sourceRevision, area, requestId: randomUUID(), ...patch });
const share = async (who, sourceId, kind = 'post', patch = {}) => run(who, shareInput(sourceId, await state(who, sourceId, kind), patch));
const removeInput = (sourceId, current) => ({ action: 'remove', kind: current.kind, sourceId, expectedRevision: current.revision, requestId: randomUUID() });
const read = (who, pinId) => run(who, { action: 'read', pinId });
const list = (who, kind = 'post', cursor) => run(who, { action: 'list', kind, ...(cursor ? { cursor } : {}) });
try {
  await env.clearFirestore(); const alice = await actor('pin-alice'), bob = await actor('pin-bob'), stranger = await actor('pin-stranger');
  const original = await publish(alice), firstState = await state(alice, original.postId);
  await check('strict actor/incarnation/action/source and explicit area schema', async () => {
    await assert.rejects(manageMapPin.run({ data: {} }), { code: 'unauthenticated' });
    const valid = shareInput(original.postId, firstState);
    for (const patch of [{ expectedOwnerUid: bob.uid }, { expectedProfileId: bob.profileId }, { expectedAccountCreatedAt: alice.created + 1000 }]) await assert.rejects(run(alice, { ...valid, ...patch }), { code: 'failed-precondition' });
    for (const patch of [{ action: '__proto__' }, { action: 'constructor' }, { kind: 'story' }, { sourceId: '../x' }, { sourceId: 'x'.repeat(1501) }, { requestId: 'bad' }, { expectedRevision: undefined }, { expectedSourceRevision: null }, { area: { ...area, latitude: NaN } }, { area: { ...area, longitude: 181 } }, { area: { ...area, precision: 'precise' } }, { area: { ...area, label: '\nprivate' } }, { now: 0 }, { liveGps: true }]) await assert.rejects(run(alice, { ...valid, ...patch }), { code: 'invalid-argument' });
    assert.equal(firstState.status, 'unshared'); assert.equal(firstState.canShare, true); assert.equal(firstState.pin, null);
    assert.equal((await state(bob, original.postId)).canShare, false); await assert.rejects(run(bob, { ...valid, ...binding(bob) }), { code: 'permission-denied' });
  });
  let first, exact;
  await check('atomic concurrent exact sharing creates one rounded pin and never stores exact coordinates', async () => {
    exact = shareInput(original.postId, firstState);
    const replies = await Promise.all([run(alice, exact), run(alice, exact)]); first = replies[0];
    assert.equal(replies.filter(row => row.replayed === false).length, 1); assert.ok(replies.every(row => row.applied && row.status === 'shared'));
    assert.equal(first.pin.id, mapPinId('post', original.postId, alice.uid, alice.created)); assert.equal(first.pin.sourceId, original.postId);
    assert.equal(first.pin.precision, 'approximate'); assert.equal(first.pin.radiusMeters, 2000); assert.deepEqual({ latitude: first.pin.latitude, longitude: first.pin.longitude }, approximateMapPinArea(area.latitude, area.longitude));
    assert.ok(first.validUntil > first.serverTime && first.validUntil <= first.serverTime + 15000);
    const stored = (await db.doc(`_map_pins/${first.pin.id}`).get()).data(), receipt = (await db.doc(`_map_pin_receipts/${mapPinHash([alice.uid, alice.created, exact.requestId])}`).get()).data();
    assert.equal(JSON.stringify([stored, receipt]).includes('30.123456'), false); assert.equal(JSON.stringify([stored, receipt]).includes('-97.654321'), false);
    assert.equal((await db.collection('_map_pins').get()).size, 1); assert.equal((await db.collection('user_live_locations').get()).size, 0);
    const admitted = (await read(bob, first.pin.id)).pin; assert.equal(admitted.sourceId, original.postId); assert.equal(admitted.author.id, alice.profileId);
  });
  await check('request-body reuse and stale source/state revisions cannot silently change consent', async () => {
    await assert.rejects(run(alice, { ...exact, area: { ...area, label: 'Changed body' } }), { code: 'already-exists' });
    await assert.rejects(run(alice, { ...exact, requestId: randomUUID() }), { code: 'aborted' });
    const before = await state(alice, original.postId);
    await changePost(alice, original.postId, original.revision, 'update', { payload: { caption: 'Current caption after review' } });
    await assert.rejects(run(alice, shareInput(original.postId, before)), { code: 'aborted' });
    const shown = (await read(bob, first.pin.id)).pin; assert.equal(shown.caption, 'Current caption after review'); assert.equal(shown.revision, first.revision);
  });
  await check('normal presentation counters and profile pinning preserve explicit map consent', async () => {
    await db.doc(`posts/${original.postId}`).update({ like_count: 9, comment_count: 3 });
    const currentPost = await runManagePost(db, alice.uid, { expectedOwnerUid: alice.uid, expectedProfileId: alice.profileId, action: 'read', postId: original.postId });
    await changePost(alice, original.postId, currentPost.revision, 'pin', { payload: { isPinned: true } });
    const pin = (await read(bob, first.pin.id)).pin; assert.equal(pin.id, first.pin.id); assert.equal(pin.revision, first.revision); assert.notEqual(pin.publicationRevision, first.pin.publicationRevision);
  });
  await check('source kind, publication and owner confirmation are never borrowed from legacy/raw pins', async () => {
    await db.doc('posts/legacy-post').set({ author_id: alice.profileId, caption: 'Legacy', type: 'post', created_at: new Date().toISOString(), visibility: 'public' });
    await db.doc('map_post_pins/legacy').set({ id: 'legacy-post', user_id: alice.profileId, latitude: 1, longitude: 1 });
    const legacy = await state(alice, 'legacy-post'); assert.equal(legacy.canShare, false); assert.equal(legacy.sourceRevision, null);
    await assert.rejects(run(alice, shareInput('legacy-post', { ...legacy, sourceRevision: rev() })), { code: 'permission-denied' });
    assert.equal((await state(alice, original.postId, 'clip')).canShare, false);
    const short = await publish(alice, 'short'), shortPin = await share(alice, short.postId, 'clip'); assert.equal(shortPin.pin.sourceType, 'short');
    assert.equal((await state(alice, short.postId, 'post')).canShare, false);
    const video = await publish(alice, 'video'), videoPin = await share(alice, video.postId); assert.equal(videoPin.pin.sourceType, 'video');
    assert.equal((await db.doc(`map_clip_pins/${short.postId}`).get()).exists, false);
  });
  await check('current source audience, location policy, both blocks and private-account follow are intersected', async () => {
    const privacy = db.doc(`profile_visibility/${alice.profileId}`);
    for (const location of ['friends', 'close_friends', 'only_me', 'private', 'unknown']) { await privacy.set({ fields: { location, posts: 'public', clips: 'public' } }); assert.equal((await read(bob, first.pin.id)).pin, null); }
    const friend = db.doc('friend_requests/pin-friend'); await friend.set({ sender_id: alice.uid, receiver_id: bob.profileId, status: 'accepted' });
    await privacy.set({ fields: { location: 'friends', posts: 'public', clips: 'public' } }); assert.ok((await read(bob, first.pin.id)).pin);
    await privacy.set({ fields: { location: 'close_friends', posts: 'public', clips: 'public' } }); assert.equal((await read(bob, first.pin.id)).pin, null);
    await db.doc(`_close_friend_authority/${closeFriendAuthorityId(alice.uid, bob.uid)}`).set({ version: 1, owner_uid: alice.uid, owner_profile_id: alice.profileId, friend_uid: bob.uid, friend_profile_id: bob.profileId, enabled: true }); assert.ok((await read(bob, first.pin.id)).pin);
    for (const [blocker_id, blocked_id] of [[alice.uid, bob.profileId], [bob.uid, alice.profileId]]) { await db.doc('blocked_users/pin-block').set({ blocker_id, blocked_id }); assert.equal((await read(bob, first.pin.id)).pin, null); await db.doc('blocked_users/pin-block').delete(); }
    await privacy.set({ fields: { location: 'public', posts: 'only_me', clips: 'public' } }); assert.equal((await read(bob, first.pin.id)).pin, null);
    await privacy.set({ fields: { location: 'public', posts: 'public', clips: 'public' } });
    await db.doc(`profiles/${alice.profileId}`).update({ is_private: true }); assert.equal((await read(bob, first.pin.id)).pin, null);
    const followed = await manageFollowAuthority(db, bob.uid, { action: 'request', expectedOwnerUid: bob.uid, expectedProfileId: bob.profileId, targetId: alice.profileId, revision: 0 });
    await manageFollowAuthority(db, alice.uid, { action: 'approve', expectedOwnerUid: alice.uid, expectedProfileId: alice.profileId, relationshipId: followed.relationshipId, revision: followed.revision });
    assert.ok((await read(bob, first.pin.id)).pin); assert.equal((await read(stranger, first.pin.id)).pin, null); await db.doc(`profiles/${alice.profileId}`).update({ is_private: false });
  });
  await check('removal persists and old share/remove replays cannot change a new consent generation', async () => {
    const before = await state(alice, original.postId), remove = removeInput(original.postId, before), removed = await run(alice, remove);
    assert.equal(removed.status, 'removed'); assert.equal(removed.applied, true); assert.equal((await read(bob, first.pin.id)).pin, null);
    const oldShare = await run(alice, exact); assert.equal(oldShare.status, 'removed'); assert.equal(oldShare.applied, false);
    const nextInput = shareInput(original.postId, await state(alice, original.postId), { area: { ...area, label: 'Reviewed different area', longitude: 20 } }), next = await run(alice, nextInput);
    const oldRemove = await run(alice, remove); assert.equal(oldRemove.status, 'shared'); assert.equal(oldRemove.applied, false); assert.equal(oldRemove.pin.areaLabel, 'Reviewed different area');
    const earlier = await run(alice, exact); assert.equal(earlier.status, 'shared'); assert.equal(earlier.applied, false); assert.equal(earlier.pin.revision, next.revision);
    await assert.rejects(run(alice, { ...remove, requestId: randomUUID() }), { code: 'aborted' });
  });
  await check('source audience and publication integrity remain mandatory after map consent', async () => {
    const post = await publish(alice), shared = await share(alice, post.postId), ref = db.doc(`posts/${post.postId}`), original = (await ref.get()).data();
    const proof = db.doc(`_post_publications/${post.postId}`), originalProof = (await proof.get()).data();
    for (const patch of [{ visibility: 'only_me' }, { audience: 'only_me' }, { is_private: true }, { moderation_status: 'rejected' }, { is_hidden: true }, { author_id: bob.profileId }]) {
      const row = { ...original, ...patch }; await ref.set(row); await proof.update({ source_fingerprint: postSourceFingerprint(row), revision: rev() });
      assert.equal((await read(stranger, shared.pin.id)).pin, null);
    }
    await ref.set(original); await proof.set(originalProof); assert.ok((await read(stranger, shared.pin.id)).pin);
    await ref.update({ caption: 'Unproven modified content' }); assert.equal((await read(stranger, shared.pin.id)).pin, null);
  });
  await check('source/proof deletion and recreation require explicit fresh review, never revive old consent', async () => {
    for (const kind of ['source', 'proof']) {
      const post = await publish(alice), current = await state(alice, post.postId), body = shareInput(post.postId, current), shared = await run(alice, body);
      const ref = db.doc(kind === 'source' ? `posts/${post.postId}` : `_post_publications/${post.postId}`), copied = (await ref.get()).data();
      await ref.delete(); assert.equal((await read(bob, shared.pin.id)).pin, null); await ref.set(copied); assert.equal((await read(bob, shared.pin.id)).pin, null);
      const replay = await run(alice, body); assert.equal(replay.applied, false); assert.equal(replay.status, 'unavailable');
      const review = await state(alice, post.postId); assert.equal(review.canShare, true); assert.notEqual(review.sourceRevision, current.sourceRevision);
      const next = await run(alice, shareInput(post.postId, review)); assert.equal(next.applied, true); assert.ok((await read(bob, next.pin.id)).pin);
      assert.equal((await run(alice, body)).applied, false);
    }
  });
  await check('removed/deleted/moderated sources and unrelated replacement owners do not prevent owner removal', async () => {
    for (const mode of ['deleted', 'moderated', 'new-owner']) {
      const post = await publish(alice), shared = await share(alice, post.postId), ref = db.doc(`posts/${post.postId}`);
      if (mode === 'deleted') await ref.delete();
      if (mode === 'moderated') await ref.update({ moderation_status: 'rejected' });
      if (mode === 'new-owner') { const row = { ...(await ref.get()).data(), author_id: bob.profileId, user_id: bob.profileId }; await ref.set(row); await db.doc(`_post_publications/${post.postId}`).update({ owner_uid: bob.uid, profile_id: bob.profileId, source_fingerprint: postSourceFingerprint(row) }); }
      const unavailableAuth = { getUser: uid => { if (uid === bob.uid) throw new Error('Unrelated owner unavailable'); return auth.getUser(uid); } };
      const removed = await run(alice, removeInput(post.postId, shared), unavailableAuth); assert.equal(removed.status, 'removed'); assert.equal(removed.applied, true);
      assert.equal((await read(stranger, shared.pin.id)).pin, null);
    }
  });
  await check('pin source creation proof rejects copied-back protected state without reminting', async () => {
    const post = await publish(alice), body = shareInput(post.postId, await state(alice, post.postId)), shared = await run(alice, body), ref = db.doc(`_map_pins/${shared.pin.id}`), copied = (await ref.get()).data();
    await ref.delete(); await ref.set(copied); assert.equal((await read(bob, shared.pin.id)).pin, null);
    await assert.rejects(run(alice, body), { code: 'failed-precondition' });
  });
  await check('current and delayed owner identity/incarnation/binding failures cannot disclose or commit', async () => {
    const post = await publish(alice), shared = await share(alice, post.postId), bind = db.doc(`_account_profile_bindings/${alice.uid}`), saved = (await bind.get()).data();
    await bind.update({ status: 'retired' }); assert.equal((await read(bob, shared.pin.id)).pin, null); await bind.set(saved);
    await bind.update({ revision: rev() }); assert.equal((await read(bob, shared.pin.id)).pin, null); await bind.set(saved);
    await auth.updateUser(alice.uid, { disabled: true }); assert.equal((await read(bob, shared.pin.id)).pin, null); await auth.updateUser(alice.uid, { disabled: false });
    const reincarnated = { getUser: async uid => { const user = await auth.getUser(uid); return uid === alice.uid ? { ...user, metadata: { ...user.metadata, creationTime: new Date(alice.created + 1000).toISOString() } } : user; } }; assert.equal((await readWith(bob, shared.pin.id, reincarnated)).pin, null);
    let calls = 0; const late = { getUser: async uid => { const user = await auth.getUser(uid); return uid === alice.uid && ++calls >= 2 ? { ...user, disabled: true } : user; } }; await assert.rejects(readWith(bob, shared.pin.id, late), { code: 'permission-denied' });
    const fresh = await publish(alice), reviewed = await state(alice, fresh.postId); calls = 0;
    await assert.rejects(run(alice, shareInput(fresh.postId, reviewed), late), { code: 'failed-precondition' }); assert.equal((await db.doc(`_map_pins/${mapPinId('post', fresh.postId, alice.uid, alice.created)}`).get()).exists, false);
    await db.doc(`profiles/${alice.uid}`).set({ user_id: bob.uid }); assert.equal((await read(stranger, shared.pin.id)).pin, null); await db.doc(`profiles/${alice.uid}`).delete();
  });
  await check('pole and antimeridian selections always return a bounded approximate cell', async () => {
    for (const [latitude, longitude, expected] of [[90, 180, [89.99, 179.99]], [-90, -180, [-89.99, -179.99]], [0, 0, [0.01, 0.01]]]) {
      const post = await publish(alice), shared = await share(alice, post.postId, 'post', { area: { latitude, longitude, label: 'Boundary review' } }); assert.deepEqual([shared.pin.latitude, shared.pin.longitude], expected);
    }
  });
  await check('bounded pagination continues across filtered candidates and rejects cursor reuse', async () => {
    const source = await publish(alice, 'short'), base = await share(alice, source.postId, 'clip'), stateRow = (await db.doc(`_map_pins/${base.pin.id}`).get()).data(), sourceRow = (await db.doc(`posts/${source.postId}`).get()).data(), proofRow = (await db.doc(`_post_publications/${source.postId}`).get()).data();
    // Model legitimate atomic protected rows, plus invalid candidates; no production writes.
    const batch = db.batch();
    for (let i = 0; i < 23; i++) {
      const sourceId = `page-${String(i).padStart(2, '0')}`, pinId = mapPinId('clip', sourceId, alice.uid, alice.created), receiptId = mapPinHash(['page-receipt', i]);
      batch.create(db.doc(`posts/${sourceId}`), sourceRow); batch.create(db.doc(`_post_publications/${sourceId}`), { ...proofRow, post_id: sourceId });
      // Source versions are filled in below once their actual Firestore createTime is known.
      batch.create(db.doc(`_map_pins/${pinId}`), { ...stateRow, id: pinId, source_id: sourceId, creation_receipt_id: receiptId, last_receipt_id: receiptId, shared_at: new Date(Date.now() - i * 1000).toISOString() });
      batch.create(db.doc(`_map_pin_receipts/${receiptId}`), { version: 1, action: 'share', pin_id: pinId, owner_uid: alice.uid, profile_id: alice.profileId, account_created_at_ms: alice.created, binding_revision: stateRow.binding_revision });
    }
    await batch.commit();
    for (let i = 0; i < 23; i++) {
      const sourceId = `page-${String(i).padStart(2, '0')}`, sourceSnap = await db.doc(`posts/${sourceId}`).get(), proofSnap = await db.doc(`_post_publications/${sourceId}`).get();
      const time = value => `${value.seconds}:${value.nanoseconds}`;
      await db.doc(`_map_pins/${mapPinId('clip', sourceId, alice.uid, alice.created)}`).update({ source_create_time: time(sourceSnap.createTime), proof_create_time: time(proofSnap.createTime) });
      if (i < 20) await db.doc(`posts/${sourceId}`).update({ is_hidden: true });
    }
    let page = await list(bob, 'clip'), seen = page.items.map(pin => pin.sourceId), pages = 1;
    assert.ok(page.nextCursor); const cursor = page.nextCursor;
    await assert.rejects(list(stranger, 'clip', cursor), { code: 'failed-precondition' }); await assert.rejects(list(bob, 'post', cursor), { code: 'failed-precondition' });
    while (page.nextCursor) { page = await list(bob, 'clip', page.nextCursor); seen.push(...page.items.map(pin => pin.sourceId)); pages++; assert.ok(pages <= 3); }
    for (let i = 20; i < 23; i++) assert.ok(seen.includes(`page-${i}`)); assert.equal(new Set(seen).size, seen.length);
    await assert.rejects(run(bob, { action: 'list', kind: 'clip', cursor }, auth, Date.now() + 600001), { code: 'failed-precondition' });
    const emptyCursor = await list(bob, 'clip'); await db.doc('blocked_users/page-block').set({ blocker_id: alice.uid, blocked_id: bob.profileId });
    const hiddenFirst = await list(bob, 'clip'); assert.deepEqual(hiddenFirst.items, []); assert.ok(hiddenFirst.nextCursor);
    assert.deepEqual((await list(bob, 'clip', emptyCursor.nextCursor)).items, []); await db.doc('blocked_users/page-block').delete();
  });
  await check('raw legacy pin and protected state/receipt/cursor Rules close every direct bypass', async () => {
    for (const name of ['map_post_pins', 'map_clip_pins', '_map_pins', '_map_pin_receipts', '_map_pin_cursors']) {
      await db.doc(`${name}/rules-target`).set({ user_id: alice.profileId, owner_uid: alice.uid });
      for (const viewer of [env.authenticatedContext(alice.uid), env.authenticatedContext(bob.uid), env.authenticatedContext('admin', { admin: true }), env.unauthenticatedContext()]) {
        const client = viewer.firestore(), ref = doc(client, name, 'rules-target'); await deny(getDoc(ref)); await deny(getDocs(collection(client, name))); await deny(setDoc(doc(client, name, 'new'), { user_id: alice.profileId })); await deny(updateDoc(ref, { user_id: bob.profileId })); await deny(deleteDoc(ref));
      }
    }
  });
  console.log(`PASS ${groups} map pin backend groups + ${rules} Firestore rule checks`);
} finally { await env.cleanup(); }
function readWith(who, pinId, authority) { return run(who, { action: 'read', pinId }, authority); }
