import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
const projectId = process.env.GCLOUD_PROJECT;
assert.match(projectId || '', /^demo-[a-z0-9-]+$/); assert.notEqual(projectId, 'demo-vybe-preview');
assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^127\.0\.0\.1:8387$/);
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId });
const require = createRequire(path.resolve(process.env.FIREBASE_TEST_TOOLS_ROOT || '.', 'package.json'));
const { initializeTestEnvironment, assertFails } = require('@firebase/rules-unit-testing');
const { doc, setDoc, updateDoc, deleteDoc, getDoc, setLogLevel } = require('firebase/firestore'); setLogLevel('silent');
const { db } = await import('../functions/lib/_shared/admin.js');
const { runManagePost } = await import('../functions/lib/_shared/postPublicationAuthority.js');
const { managePost } = await import('../functions/lib/postPublication.js');
const { readSocialFeedPage, readSocialPostPreviewsPage, readPublicSocialPost } = await import('../functions/lib/_shared/socialFeedAuthority.js');
const { readSocialPostListPage } = await import('../functions/lib/_shared/socialPostListAuthority.js');
const { committedCapturePost } = await import('../functions/lib/_shared/gameCaptureCore.js');
const { validPublicationMediaUrl } = await import('../functions/lib/_shared/postPublicationProof.js');
const { manageFollowAuthority } = await import('../functions/lib/_shared/followAuthority.js');
const { claimTokenCredit } = await import('../functions/lib/_shared/tokenCreditAuthority.js');
const { reconcileChallenge } = await import('../functions/lib/_shared/challengeRewardAuthority.js');
const env = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8387, rules: await readFile(process.env.FIRESTORE_RULES_FILE || 'firestore.rules', 'utf8') } });
const alice = { uid: 'publisher-alice', profileId: 'publisher-alice-profile' }, bob = { uid: 'publisher-bob', profileId: 'publisher-bob-profile' }, moderator = { uid: 'publisher-mod', profileId: 'publisher-mod-profile' };
const binding = owner => ({ expectedOwnerUid: owner.uid, expectedProfileId: owner.profileId });
const payload = patch => ({ type: 'post', caption: 'Synthetic publication', tags: ['qa'], mediaUrl: null, mediaUrls: [], thumbnailUrl: null, ageRating: 'unrated', visibility: 'public', ...patch });
const change = (owner, input, now) => runManagePost(db, owner.uid, { ...binding(owner), ...(input.action === 'read' ? {} : { requestId: randomUUID() }), ...input }, now);
const read = (owner, postId) => change(owner, { action: 'read', postId });
const create = (owner = alice, patch = {}) => change(owner, { action: 'create', postId: randomUUID(), payload: payload(), ...patch });
const preview = (owner, postId) => readSocialPostPreviewsPage(db, owner.uid, { ...binding(owner), postIds: [postId] });
const rawLegacy = (owner, fields = {}) => ({ author_id: owner.profileId, type: 'post', caption: 'Old unproven text', tags: [], media_url: '', visibility: 'public', age_rating: 'safe', created_at: '2025-01-01T00:00:00.000Z', ...fields });
let groups = 0; const check = async (name, fn) => { await fn(); groups++; console.log(`PASS ${name}`); };
try {
  await env.clearFirestore();
  for (const owner of [alice, bob, moderator]) { await db.doc(`profiles/${owner.profileId}`).set({ user_id: owner.uid, username: owner.uid, is_private: false }); await db.doc(`user_auth_index/${owner.uid}`).set({ profile_id: owner.profileId }); }
  await db.doc('user_roles/mod').set({ user_id: moderator.profileId, role: 'moderator', enabled: true });
  await check('authentication, strict schema and canonical UID/profile binding precede publication', async () => {
    await assert.rejects(managePost.run({ data: {} }), { code: 'unauthenticated' });
    const good = { action: 'create', postId: randomUUID(), requestId: randomUUID(), payload: payload() };
    await assert.rejects(change(alice, { ...good, expectedOwnerUid: bob.uid }), { code: 'failed-precondition' });
    await assert.rejects(change(alice, { ...good, expectedProfileId: bob.profileId }), { code: 'failed-precondition' });
    for (const patch of [{ admin: true }, { expectedRevision: null }, { payload: payload({ author_id: bob.profileId }) }, { payload: payload({ like_count: 999 }) }, { payload: payload({ mediaUrl: 'http://example.test/a' }) }, { payload: payload({ type: 'video' }) }, { payload: payload({ caption: 'x'.repeat(10001) }) }, { postId: 'legacy-id' }]) await assert.rejects(change(alice, { ...good, ...patch }), { code: 'invalid-argument' });
    assert.equal((await db.collection('posts').get()).size, 0);
    await db.doc(`profiles/${alice.uid}`).set({ user_id: bob.uid }); await assert.rejects(change(alice, good), { code: 'failed-precondition' }); await db.doc(`profiles/${alice.uid}`).delete();
  });
  let first;
  await check('new publication is canonical, atomically proven and visible through checked readers', async () => {
    first = await create(); assert.equal(first.status, 'published'); assert.equal(first.created, true); assert.equal(first.needsOwnerConfirmation, false);
    const proof = (await db.doc(`_post_publications/${first.postId}`).get()).data(); assert.equal(proof.owner_uid, alice.uid); assert.equal(proof.profile_id, alice.profileId); assert.equal(proof.revision, first.revision);
    assert.equal((await preview(bob, first.postId)).posts[0].publicationRevision, first.revision);
    assert.equal((await readPublicSocialPost(db, first.postId)).id, first.postId);
    assert.equal((await readSocialPostListPage(db, bob.uid, { ...binding(bob), scope: 'profile', targetId: alice.profileId })).posts[0].needsOwnerConfirmation, false);
    assert.ok((await readSocialFeedPage(db, bob.uid, binding(bob))).posts.some(row => row.id === first.postId));
    await db.doc('blocked_users/publish-block').set({ blocker_id: bob.uid, blocked_id: alice.profileId }); assert.deepEqual((await preview(bob, first.postId)).posts, []); await db.doc('blocked_users/publish-block').delete();
  });
  await check('current revision prevents concurrent edits and owner identity cannot be reassigned', async () => {
    await assert.rejects(change(bob, { action: 'update', postId: first.postId, expectedRevision: first.revision, payload: { caption: 'forged' } }), { code: 'permission-denied' });
    const updated = await change(alice, { action: 'update', postId: first.postId, expectedRevision: first.revision, payload: { caption: 'Edited once', aiOverride: true } });
    assert.notEqual(updated.revision, first.revision); assert.equal(updated.post.aiOverride, true);
    await assert.rejects(change(alice, { action: 'update', postId: first.postId, expectedRevision: first.revision, payload: { caption: 'stale' } }), { code: 'aborted' });
    assert.equal((await preview(bob, first.postId)).posts[0].caption, 'Edited once'); first = updated;
  });
  await check('lost-response retries are idempotent and never restore later edited or deleted posts', async () => {
    const request = { action: 'create', postId: randomUUID(), requestId: randomUUID(), payload: payload() };
    const committed = await change(alice, request); assert.deepEqual(await change(alice, request), committed);
    await assert.rejects(change(alice, { ...request, payload: payload({ caption: 'different' }) }), { code: 'already-exists' });
    const remove = { action: 'delete', postId: committed.postId, requestId: randomUUID(), expectedRevision: committed.revision };
    const deleted = await change(alice, remove); assert.equal(deleted.status, 'deleted'); assert.equal(deleted.revision, null); assert.deepEqual(await change(alice, remove), deleted);
    await assert.rejects(change(alice, request), { code: 'failed-precondition' }); await assert.rejects(change(alice, { ...request, requestId: randomUUID() }), { code: 'already-exists' });
    assert.equal((await db.doc(`posts/${committed.postId}`).get()).exists, false); assert.equal((await read(alice, committed.postId)).status, 'deleted');
    for (const restriction of [{ is_hidden: true }, { is_deleted: true }, { moderation_status: 'rejected' }]) {
      const pending = { action: 'create', postId: randomUUID(), requestId: randomUUID(), payload: payload() };
      await change(alice, pending); await db.doc(`posts/${pending.postId}`).update(restriction);
      await assert.rejects(change(alice, pending), { code: 'failed-precondition' });
      assert.deepEqual((await preview(bob, pending.postId)).posts, []);
      for (const [key, value] of Object.entries(restriction)) assert.equal((await db.doc(`posts/${pending.postId}`).get()).data()[key], value);
    }
  });
  await check('historical forged reassignment stays owner-only until deliberate replacement resets metadata', async () => {
    const id = 'historical-forged-bob'; await db.doc(`posts/${id}`).set(rawLegacy(bob, { like_count: 9999, comment_count: 4444, view_count: 999999, is_ai_generated: true, moderation_status: 'approved', vybe_check_status: 'approved', ai_override: true, secret: 'malicious old field' }));
    assert.deepEqual((await preview(alice, id)).posts, []); assert.equal(await readPublicSocialPost(db, id), null);
    const own = (await preview(bob, id)).posts[0]; assert.equal(own.needsOwnerConfirmation, true); const state = await read(bob, id); assert.equal(state.revision, own.publicationRevision);
    await assert.rejects(change(bob, { action: 'update', postId: id, expectedRevision: state.revision, payload: { caption: 'ordinary edit must not attest' } }), { code: 'failed-precondition' });
    await assert.rejects(change(alice, { action: 'recover', postId: id, expectedRevision: state.revision, payload: payload() }), { code: 'permission-denied' });
    await db.doc(`posts/${id}`).update({ caption: 'Changed after review' }); await assert.rejects(change(bob, { action: 'recover', postId: id, expectedRevision: state.revision, payload: payload() }), { code: 'aborted' });
    const current = await read(bob, id); const recovered = await change(bob, { action: 'recover', postId: id, expectedRevision: current.revision, payload: payload({ caption: 'Bob deliberately shares this now', ageRating: 'safe' }) });
    const stored = (await db.doc(`posts/${id}`).get()).data(); assert.equal(stored.like_count, 0); assert.equal(stored.comment_count, 0); assert.equal(stored.view_count, 0); assert.equal(stored.age_rating, 'unrated'); assert.equal(stored.secret, undefined); assert.equal(stored.is_ai_generated, undefined); assert.equal(stored.vybe_check_status, undefined); assert.equal(stored.ai_override, null);
    assert.equal((await preview(alice, id)).posts[0].caption, recovered.post.caption); assert.equal(recovered.needsOwnerConfirmation, false);
  });
  await check('long historical IDs remain recoverable and deletion requires current legacy state', async () => {
    const id = 'l'.repeat(1500); await db.doc(`posts/${id}`).set(rawLegacy(alice)); const state = await read(alice, id);
    const result = await change(alice, { action: 'recover', postId: id, expectedRevision: state.revision, payload: payload() }); assert.equal(result.postId.length, 1500);
    const legacy = 'legacy-delete'; await db.doc(`posts/${legacy}`).set(rawLegacy(alice)); const snapshot = await read(alice, legacy);
    await change(alice, { action: 'delete', postId: legacy, expectedRevision: snapshot.revision }); assert.equal((await db.doc(`posts/${legacy}`).get()).exists, false);
  });
  await check('legacy Firestore metadata remains reviewable and changing its reference retires the revision', async () => {
    const id = 'legacy-reference-metadata';
    await db.doc(`posts/${id}`).set(rawLegacy(alice, { legacy_profile: db.doc(`profiles/${alice.profileId}`) }));
    const before = await read(alice, id); assert.equal(before.status, 'legacy');
    await db.doc(`posts/${id}`).update({ legacy_profile: db.doc(`profiles/${bob.profileId}`) });
    await assert.rejects(change(alice, { action: 'recover', postId: id, expectedRevision: before.revision, payload: payload() }), { code: 'aborted' });
    const current = await read(alice, id);
    await change(alice, { action: 'recover', postId: id, expectedRevision: current.revision, payload: payload() });
    assert.equal((await db.doc(`posts/${id}`).get()).data().legacy_profile, undefined);
  });
  await check('legacy review intersects every existing restriction instead of widening its audience', async () => {
    for (const [fields, expected] of [[{ visibility: 'public', audience: 'friends' }, 'friends'], [{ visibility: 'friends', audience: 'close_friends' }, 'close_friends'],
      [{ visibility: 'followers', audience: 'friends' }, 'only_me'], [{ visibility: 'public', audience: 'unknown' }, 'only_me'], [{ visibility: 'public', is_private: true }, 'only_me']]) {
      const id = `legacy-${randomUUID()}`; await db.doc(`posts/${id}`).set(rawLegacy(alice, fields)); assert.equal((await read(alice, id)).post.visibility, expected);
    }
  });
  await check('followers-only publication admits current followers and immediately respects revocation', async () => {
    const value = await create(alice, { payload: payload({ visibility: 'followers' }) }); assert.deepEqual((await preview(bob, value.postId)).posts, []);
    const relationship = await manageFollowAuthority(db, bob.uid, { ...binding(bob), targetId: alice.profileId, action: 'request', revision: 0 }); assert.equal((await preview(bob, value.postId)).posts.length, 1);
    await manageFollowAuthority(db, bob.uid, { ...binding(bob), relationshipId: relationship.relationshipId, action: 'unfollow', revision: relationship.revision }); assert.deepEqual((await preview(bob, value.postId)).posts, []);
  });
  await check('protected content mismatch never downgrades into recoverable legacy content', async () => {
    const value = await create(); await db.doc(`posts/${value.postId}`).update({ caption: 'out-of-band tampering' });
    assert.deepEqual((await preview(bob, value.postId)).posts, []); assert.deepEqual((await preview(alice, value.postId)).posts, []);
    await assert.rejects(change(alice, { action: 'recover', postId: value.postId, expectedRevision: value.revision, payload: payload() }), { code: 'failed-precondition' });
    const removal = await change(moderator, { action: 'delete', postId: value.postId, expectedRevision: value.revision }); assert.equal(removal.status, 'deleted');
  });
  await check('pin limit serializes concurrent requests and never trusts forged counters', async () => {
    const posts = await Promise.all(Array.from({ length: 5 }, () => create(bob)));
    const receipts = await Promise.all(posts.map(post => change(bob, { action: 'pin', postId: post.postId, expectedRevision: post.revision, payload: { isPinned: true } })));
    assert.equal((await db.collection('posts').where('author_id', '==', bob.profileId).where('is_pinned', '==', true).get()).size, 3);
    assert.equal(receipts.flatMap(row => row.unpinnedPostIds).length, 2);
    for (const receipt of receipts) assert.ok(receipt.unpinnedPostIds.length <= 50);
  });
  await check('game capture publish consumes only current owner capture and proof prevents replay resurrection', async () => {
    const captureId = 'a'.repeat(48), id = `game_${captureId}`;
    await db.doc(`game_captures/${captureId}`).set({ owner_uid: alice.uid, status: 'ready', expires_at_ms: Date.now() + 60000 });
    const request = { action: 'create', postId: id, requestId: randomUUID(), payload: payload({ gameCaptureId: captureId, type: 'video', mediaUrl: 'https://example.test/game.mp4' }) };
    await assert.rejects(change(bob, request), { code: 'failed-precondition' }); const result = await change(alice, request);
    assert.equal((await db.doc(`game_captures/${captureId}`).get()).data().status, 'imported'); assert.equal(await db.runTransaction(tx => committedCapturePost(tx, captureId, alice.uid)), id);
    await change(alice, { action: 'delete', postId: id, expectedRevision: result.revision }); await assert.rejects(change(alice, request), { code: 'failed-precondition' }); assert.equal(await db.runTransaction(tx => committedCapturePost(tx, captureId, alice.uid)), null);
    const old = 'b'.repeat(48); await db.doc(`posts/game_${old}`).set(rawLegacy(alice, { game_capture_id: old })); assert.equal(await db.runTransaction(tx => committedCapturePost(tx, old, alice.uid)), null);
  });
  await check('safety checks and optional media associations require current server records', async () => {
    await assert.rejects(create(alice, { payload: payload({ vybeCheckId: 'missing' }) }), { code: 'failed-precondition' });
    await db.doc('vybe_checks/approved').set({ user_id: alice.uid, status: 'limited' }); const checked = await create(alice, { payload: payload({ vybeCheckId: 'approved', ageRating: 'safe' }) }); assert.equal(checked.post.ageRating, '13+');
    await assert.rejects(create(bob, { payload: payload({ vybeCheckId: 'approved' }) }), { code: 'failed-precondition' });
    await assert.rejects(create(alice, { payload: payload({ soundId: 'not-a-proven-sound' }) }), { code: 'failed-precondition' });
    await assert.rejects(create(alice, { payload: payload({ filterId: 'missing-filter' }) }), { code: 'failed-precondition' });
    await db.doc('filters/current-filter').set({ creator_id: bob.profileId, is_published: true, is_approved: true }); assert.equal((await create(alice, { payload: payload({ filterId: 'current-filter' }) })).post.filterId, 'current-filter');
    await db.doc('filters/current-filter').update({ is_published: false }); await assert.rejects(create(alice, { payload: payload({ filterId: 'current-filter' }) }), { code: 'failed-precondition' });
  });
  await check('local media exception is isolated to the configured demo bucket and loopback emulator', async () => {
    const prior = process.env.FIREBASE_STORAGE_EMULATOR_HOST; process.env.FIREBASE_STORAGE_EMULATOR_HOST = '127.0.0.1:9396';
    assert.equal(validPublicationMediaUrl(`http://127.0.0.1:9396/v0/b/${projectId}.appspot.com/o/media%2Fone`), true);
    for (const value of ['http://example.test/a', 'http://localhost:9396/v0/b/demo-other/o/a', `http://127.0.0.1:9399/v0/b/${projectId}/o/a`, 'https://user:password@example.test/a']) assert.equal(validPublicationMediaUrl(value), false);
    if (prior === undefined) delete process.env.FIREBASE_STORAGE_EMULATOR_HOST; else process.env.FIREBASE_STORAGE_EMULATOR_HOST = prior;
    // Test the pure URL guard only. No emulator client is reinitialized and no
    // reads/writes target the retained preview while these values are installed.
    const previewEnvironment = { GCLOUD_PROJECT: 'demo-vybe-preview', FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9399',
      FIRESTORE_EMULATOR_HOST: '127.0.0.1:8280', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9199' };
    const savedEnvironment = Object.fromEntries(Object.keys(previewEnvironment).map(key => [key, process.env[key]]));
    const proxy = 'http://127.0.0.1:8082/v0/b/demo-vybe-preview.appspot.com/o/media%2Fowner%2Fphoto.png';
    try {
      Object.assign(process.env, previewEnvironment);
      for (const host of ['127.0.0.1', 'localhost', '[::1]']) assert.equal(validPublicationMediaUrl(proxy.replace('127.0.0.1', host)), true);
      for (const denied of [proxy.replace('8082', '8081'), proxy.replace('127.0.0.1', 'example.test'), proxy.replace('demo-vybe-preview.appspot.com', 'demo-other.appspot.com'),
        proxy.replace('demo-vybe-preview.appspot.com', 'demo-vybe-preview.firebasestorage.app'), `${proxy}#fragment`, proxy.replace('http://', 'http://user:password@')]) assert.equal(validPublicationMediaUrl(denied), false);
      for (const key of Object.keys(previewEnvironment)) {
        process.env[key] = key === 'GCLOUD_PROJECT' ? 'production-project' : '127.0.0.1:1';
        assert.equal(validPublicationMediaUrl(proxy), false); process.env[key] = previewEnvironment[key];
      }
    } finally {
      for (const [key, value] of Object.entries(savedEnvironment)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    }
  });
  await check('raw writes and private publication evidence are denied even to owners and staff', async () => {
    for (const owner of [alice, bob, moderator]) {
      const client = env.authenticatedContext(owner.uid).firestore();
      await assertFails(setDoc(doc(client, 'posts', randomUUID()), rawLegacy(owner))); await assertFails(updateDoc(doc(client, 'posts', first.postId), { caption: 'bypass' })); await assertFails(deleteDoc(doc(client, 'posts', first.postId)));
      for (const collection of ['_post_publications', '_post_publication_receipts', '_post_pin_state']) { const ref = doc(client, collection, first.postId); await assertFails(getDoc(ref)); await assertFails(setDoc(ref, { owner_uid: owner.uid })); }
    }
  });
  await check('historically unproven ownership grants neither post tokens nor challenge completion', async () => {
    const owner = { uid: 'publication-reward-user', profileId: 'publication-reward-profile' }, id = 'publication-reward-legacy';
    await db.doc(`profiles/${owner.profileId}`).set({ user_id: owner.uid, username: 'reward-fixture' }); await db.doc(`user_auth_index/${owner.uid}`).set({ profile_id: owner.profileId });
    const actor = { authUid: owner.uid, profileId: owner.profileId }; const now = Date.now() + 1000;
    await db.doc(`posts/${id}`).set(rawLegacy(owner, { created_at: new Date(now).toISOString() }));
    await db.doc('challenges/publication-reward').set({ type: 'daily', active_date: new Date(now).toISOString().slice(0, 10), is_active: true, requirement_type: 'post', requirement_count: 1, reward_xp: 10, reward_badge_id: null });
    await assert.rejects(claimTokenCredit(db, actor, { type: 'post_created', referenceId: id }, now), { code: 'failed-precondition' });
    assert.equal((await reconcileChallenge(db, actor, 'publication-reward', now)).is_completed, false);
    const current = await read(owner, id); await change(owner, { action: 'recover', postId: id, expectedRevision: current.revision, payload: payload() });
    assert.equal((await claimTokenCredit(db, actor, { type: 'post_created', referenceId: id }, Date.now() + 1000)).credited, 10);
    assert.equal((await reconcileChallenge(db, actor, 'publication-reward', Date.now() + 1000)).is_completed, true);
  });
  console.log(`Post publication: ${groups} grouped checks passed.`);
} finally { await env.cleanup(); }
