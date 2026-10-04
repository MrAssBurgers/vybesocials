import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const projectId = process.env.GCLOUD_PROJECT;
assert.match(projectId || '', /^demo-[a-z0-9-]+$/);
assert.notEqual(projectId, 'demo-vybe-preview', 'Never reset the retained preview.');
assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):\d+$/);
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId });
const require = createRequire(path.resolve(process.env.FIREBASE_TEST_TOOLS_ROOT || '.', 'package.json'));
const { initializeTestEnvironment, assertFails } = require('@firebase/rules-unit-testing');
const { doc, setDoc, getDoc, getDocs, collection } = require('firebase/firestore');
const { db } = await import('../functions/lib/_shared/admin.js');
const { Timestamp } = await import('../functions/node_modules/firebase-admin/lib/firestore/index.js');
const { readSocialFeed } = await import('../functions/lib/socialFeed.js');
const { readSocialFeedPage } = await import('../functions/lib/_shared/socialFeedAuthority.js');
const { closeFriendAuthorityId } = await import('../functions/lib/_shared/profileAudienceAuthority.js');
const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
const env = await initializeTestEnvironment({ projectId, firestore: { host, port: Number(port), rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8') } });
const viewer = { uid: 'feed-viewer', profile: 'feed-viewer-profile' };
const author = { uid: 'feed-author', profile: 'feed-author-profile' };
const request = (who = viewer, patch = {}) => ({ expectedOwnerUid: who.uid, expectedProfileId: who.profile, ...patch });
const read = (who = viewer, patch = {}, now) => readSocialFeedPage(db, who.uid, request(who, patch), now);
const preference = db.doc(`profile_visibility/${author.profile}`);
const relationship = db.doc('friend_requests/feed-friendship');
const block = db.doc('blocked_users/feed-block');
const proof = db.doc(`_close_friend_authority/${closeFriendAuthorityId(author.uid, viewer.uid)}`);
const sample = (patch = {}) => ({ author_id: author.profile, type: 'post', caption: 'A moment from Vybe', created_at: '2026-10-04T12:00:00.000Z', media_url: '', age_rating: 'safe', ...patch });
const seed = (id = 'one', patch = {}) => db.doc(`posts/${id}`).set(sample(patch));
const clearPosts = () => db.recursiveDelete(db.collection('posts'));
const resetPolicy = async () => { await Promise.all([preference.delete(), relationship.delete(), block.delete(), proof.delete()]); };
let checks = 0;
const check = async (label, run) => { await run(); checks++; console.log(`PASS ${label}`); };
try {
  await env.clearFirestore();
  for (const who of [viewer, author]) {
    await db.doc(`profiles/${who.profile}`).set({ user_id: who.uid, username: who.uid, display_name: 'Player', email: 'must-not-escape@example.test', roles: ['owner'] });
    await db.doc(`user_auth_index/${who.uid}`).set({ profile_id: who.profile });
  }
  await check('callable rejects guests, account changes and malformed inputs before rate work', async () => {
    await assert.rejects(readSocialFeed.run({ data: {} }), { code: 'unauthenticated' });
    await assert.rejects(readSocialFeed.run({ auth: { uid: viewer.uid }, data: request(author) }), { code: 'failed-precondition' });
    for (const patch of [{ admin: true }, { cursor: 'wrong/path' }, { expectedProfileId: [] }]) await assert.rejects(read(viewer, patch), { code: 'invalid-argument' });
    assert.equal((await db.collection('_rate_limits').get()).size, 0);
  });
  await check('returns only projected content with canonical author and viewer identities', async () => {
    await seed('one', { secret: 'never emit', author_email: 'private', roles: ['admin'] });
    const page = await readSocialFeed.run({ auth: { uid: viewer.uid }, data: request() });
    assert.equal(page.ownerUid, viewer.uid); assert.equal(page.viewerProfileId, viewer.profile); assert.equal(page.nextCursor, null);
    assert.equal(page.posts.length, 1); assert.equal(page.posts[0].author.id, author.profile);
    const serialized = JSON.stringify(page); assert.ok(!serialized.includes('never emit')); assert.ok(!serialized.includes('must-not-escape'));
    assert.deepEqual(Object.keys(page.posts[0].author).sort(), ['avatarUrl', 'displayName', 'id', 'username']);
  });
  await check('profile section restrictions and post audience restrictions intersect', async () => {
    for (const level of ['friends', 'close_friends', 'only_me', 'private', 'unknown']) {
      await preference.set({ fields: { posts: level } }); assert.equal((await read()).posts.length, 0);
    }
    await preference.set({ fields: { posts: 'public', clips: 'only_me' } });
    await seed('clip', { type: 'short', media_url: 'https://example.test/clip.mp4' });
    assert.deepEqual((await read()).posts.map(post => post.id), ['one']);
    for (const patch of [{ visibility: 'only_me' }, { audience: 'friends' }, { is_private: true }, { is_private: 'false' }, { visibility: 'public', audience: 'private' }]) {
      await seed('one', patch); assert.equal((await read()).posts.length, 0);
    }
    await clearPosts(); await seed(); await resetPolicy();
  });
  await check('accepted canonical friendships and directional current Close Friends proof are required', async () => {
    await preference.set({ fields: { posts: 'close_friends' } });
    await relationship.set({ sender_id: author.uid, receiver_id: viewer.profile, status: 'accepted' });
    await db.doc('close_friends/forged').set({ user_id: author.profile, friend_id: viewer.profile });
    assert.equal((await read()).posts.length, 0);
    await proof.set({ version: 1, owner_uid: author.uid, owner_profile_id: author.profile, friend_uid: viewer.uid, friend_profile_id: viewer.profile, enabled: true });
    assert.equal((await read()).posts.length, 1);
    await proof.update({ friend_profile_id: 'old-profile' }); assert.equal((await read()).posts.length, 0);
    await proof.update({ friend_profile_id: viewer.profile });
    await relationship.delete(); assert.equal((await read()).posts.length, 0);
    await resetPolicy();
  });
  await check('either-direction blocks override public access for UID and profile aliases', async () => {
    for (const row of [{ blocker_id: viewer.uid, blocked_id: author.profile }, { blocker_id: author.uid, blocked_id: viewer.profile }]) {
      await block.set(row); assert.equal((await readSocialFeed.run({ auth: { uid: viewer.uid, token: { admin: true } }, data: request() })).posts.length, 0);
    }
    await block.delete(); assert.equal((await read()).posts.length, 1);
  });
  await check('self can read own explicit private post but not malformed or removed content', async () => {
    await seed('one', { audience: 'only_me', is_private: true }); assert.equal((await read(author)).posts.length, 1);
    await preference.set({ fields: { posts: 'invalid' } }); assert.equal((await read(author)).posts.length, 0);
    await resetPolicy(); await seed('one', { is_deleted: true }); assert.equal((await read(author)).posts.length, 0); await seed();
  });
  await check('self-created follows cannot open a private account', async () => {
    await db.doc(`profiles/${author.profile}`).update({ is_private: true });
    await db.doc('follows/self-created').set({ follower_id: viewer.profile, following_id: author.profile, status: 'approved' });
    assert.equal((await read()).posts.length, 0); assert.equal((await read(author)).posts.length, 1);
    await db.doc(`profiles/${author.profile}`).update({ is_private: 'false' }); assert.equal((await read()).posts.length, 0);
    await db.doc(`profiles/${author.profile}`).update({ is_private: false });
  });
  await check('missing, deleted, duplicate or colliding identities fail closed', async () => {
    await db.doc('profiles/duplicate').set({ user_id: viewer.uid }); await assert.rejects(read(), { code: 'failed-precondition' }); await db.doc('profiles/duplicate').delete();
    await db.doc('profiles/duplicate').set({ user_id: author.uid }); assert.equal((await read()).posts.length, 0); await db.doc('profiles/duplicate').delete();
    await db.doc(`profiles/${author.profile}`).update({ is_deleted: true }); assert.equal((await read()).posts.length, 0);
    await db.doc(`profiles/${author.profile}`).update({ is_deleted: false });
    await seed('one', { user_id: viewer.uid }); assert.equal((await read()).posts.length, 0);
    await seed('one', { author_id: author.uid, user_id: author.profile }); assert.equal((await read()).posts.length, 1); await seed();
  });
  await check('bad media, invalid states and malformed rows are omitted without echoing raw fields', async () => {
    for (const patch of [{ type: ['post'] }, { age_rating: ['safe'] }, { media_url: 'javascript:alert(1)' }, { media_url: 'https://user:password@example.test/image' }, { media_urls: ['data:image/png,secret'] }, { status: 'draft' }, { moderation_status: 'pending' }, { vybe_check_status: 'blocked' }, { is_hidden: true }, { caption: [] }, { created_at: 'not-a-date' }, { age_rating: 'anything' }]) {
      await seed('one', patch); assert.equal((await read()).posts.length, 0, JSON.stringify(patch));
    }
    await seed('one', { media_url: 'https://example.test/image.jpg', media_urls: ['https://example.test/image.jpg'], thumbnail_url: 'javascript:no', tags: ['ok', 2], age_rating: '18+' });
    const post = (await read()).posts[0]; assert.equal(post.thumbnailUrl, null); assert.deepEqual(post.tags, ['ok']); assert.equal(post.ageRating, '18+');
    await seed();
  });
  await check('bounded stable pagination survives deleted boundaries and excludes internal cursor data', async () => {
    await clearPosts(); await Promise.all(Array.from({ length: 41 }, (_, i) => seed(`p${String(i).padStart(2, '0')}`)));
    const first = await read(); assert.equal(first.posts.length, 20); assert.match(first.nextCursor, /^[a-f0-9]{48}$/);
    assert.equal(first.posts[0].id, 'p40'); assert.equal(first.posts[19].id, 'p21');
    await db.doc('posts/p21').delete();
    const second = await read(viewer, { cursor: first.nextCursor }); assert.equal(second.posts.length, 20); assert.equal(second.posts[0].id, 'p20');
    const third = await read(viewer, { cursor: second.nextCursor }); assert.deepEqual(third.posts.map(post => post.id), ['p00']); assert.equal(third.nextCursor, null);
    await assert.rejects(read(author, { cursor: first.nextCursor }), { code: 'failed-precondition' });
    await assert.rejects(read(viewer, { cursor: first.nextCursor }, Date.now() + 11 * 60 * 1000), { code: 'failed-precondition' });
    await block.set({ blocker_id: author.uid, blocked_id: viewer.uid }); assert.equal((await read(viewer, { cursor: first.nextCursor })).posts.length, 0); await block.delete();
  });
  await check('empty filtered pages continue and malformed boundary types do not strand the feed', async () => {
    await clearPosts(); await preference.set({ fields: { posts: 'only_me' } });
    await Promise.all(Array.from({ length: 21 }, (_, i) => seed(`p${i}`, { created_at: 'zzzz-invalid' })));
    await seed('visible-after', { author_id: viewer.profile, created_at: Timestamp.fromMillis(Date.now()) });
    let page = await read(); assert.equal(page.posts.length, 0); assert.ok(page.nextCursor);
    page = await read(viewer, { cursor: page.nextCursor }); assert.deepEqual(page.posts.map(post => post.id), ['visible-after']); assert.equal(page.nextCursor, null);
    await resetPolicy();
  });
  await check('cursor proof is unreadable and unwriteable to owner, guests and staff', async () => {
    const saved = (await db.collection('_social_feed_cursors').limit(1).get()).docs[0]; assert.ok(saved);
    for (const context of [env.unauthenticatedContext(), env.authenticatedContext(viewer.uid), env.authenticatedContext(author.uid, { admin: true })]) {
      const database = context.firestore();
      await assertFails(getDoc(doc(database, saved.ref.path)));
      await assertFails(setDoc(doc(database, saved.ref.path), { owner_uid: viewer.uid }));
      await assertFails(getDocs(collection(database, '_social_feed_cursors')));
    }
  });
  console.log(`Social feed backend: ${checks} grouped checks passed.`);
} finally { await env.cleanup(); await db.terminate(); }
