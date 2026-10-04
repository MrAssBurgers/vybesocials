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
const { managePostLocalArea } = await import('../functions/lib/postLocalArea.js');
const { managePostLocalAreaAuthority } = await import('../functions/lib/_shared/postLocalAreaAuthority.js');
const { readSocialFeed, readSocialPostPreviews } = await import('../functions/lib/socialFeed.js');
const { readSocialFeedPage, readSocialPostPreviewsPage } = await import('../functions/lib/_shared/socialFeedAuthority.js');
const { closeFriendAuthorityId } = await import('../functions/lib/_shared/profileAudienceAuthority.js');
const { manageFollowAuthority, followAuthorityId } = await import('../functions/lib/_shared/followAuthority.js');
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
    for (const patch of [{ admin: true }, { cursor: 'wrong/path' }, { expectedProfileId: [] }, { contentType: ['post'] }, { contentType: 'unknown' }, { feed: ['following'] }, { feed: 'unknown' }]) await assert.rejects(read(viewer, patch), { code: 'invalid-argument' });
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
  await check('presentation keeps only the current viewer interactions and safe counter snapshots', async () => {
    await seed('one', { like_count: 8, comment_count: -3, view_count: '999', is_pinned: true });
    await db.doc('likes/own-reaction').set({ user_id: viewer.uid, post_id: 'one', reaction_type: 'love' });
    await db.doc('likes/foreign-reaction').set({ user_id: author.profile, post_id: 'one', reaction_type: 'angry' });
    await db.doc('bookmarks/own-save').set({ user_id: viewer.profile, post_id: 'one' });
    const page = await read(viewer, { contentType: 'post' });
    assert.equal(page.contentType, 'post');
    assert.deepEqual([page.posts[0].likeCount, page.posts[0].commentCount, page.posts[0].viewCount, page.posts[0].isPinned], [8, 0, 0, true]);
    assert.equal(page.posts[0].reactionType, 'love'); assert.equal(page.posts[0].isBookmarked, true);
    const other = await read(author); assert.equal(other.posts[0].reactionType, 'angry'); assert.equal(other.posts[0].isBookmarked, false);
    await db.doc('likes/own-reaction').delete(); await db.doc('likes/foreign-reaction').delete(); await db.doc('bookmarks/own-save').delete(); await seed();
  });
  await check('content-type pages retain continuation through excluded clips and bind cursor selection', async () => {
    await clearPosts();
    await Promise.all(Array.from({ length: 21 }, (_, i) => seed(`clip-${i}`, { type: 'short', media_url: 'https://example.test/clip.mp4' })));
    await seed('older-post', { created_at: '2026-10-03T12:00:00.000Z' });
    const first = await read(viewer, { contentType: 'post' }); assert.equal(first.posts.length, 0); assert.ok(first.nextCursor);
    await assert.rejects(read(viewer, { cursor: first.nextCursor, contentType: 'short' }), { code: 'failed-precondition' });
    await assert.rejects(read(viewer, { cursor: first.nextCursor }), { code: 'failed-precondition' });
    await assert.rejects(read(viewer, { contentType: 'post', cursor: first.nextCursor, feed: 'following' }), { code: 'failed-precondition' });
    await assert.rejects(read(viewer, { contentType: 'post', cursor: first.nextCursor, feed: 'personalized' }), { code: 'failed-precondition' });
    const next = await read(viewer, { contentType: 'post', cursor: first.nextCursor });
    assert.deepEqual(next.posts.map(post => post.id), ['older-post']); assert.equal(next.nextCursor, null);
    await clearPosts(); await seed();
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
  await check('Following requires a current friendship or canonical active follow and rechecks revocation', async () => {
    await clearPosts(); await resetPolicy(); await seed();
    await seed('self', { author_id: viewer.profile });
    assert.deepEqual((await read(viewer, { feed: 'following' })).posts, []);
    await relationship.set({ sender_id: viewer.uid, receiver_id: author.profile, status: 'accepted' });
    assert.deepEqual((await read(viewer, { feed: 'following' })).posts.map(post => post.id), ['one']);
    await relationship.delete();
    const followInput = { expectedOwnerUid: viewer.uid, expectedProfileId: viewer.profile, action: 'request', targetId: author.profile, revision: 0 };
    const followed = await manageFollowAuthority(db, viewer.uid, followInput);
    assert.deepEqual((await read(viewer, { feed: 'following' })).posts.map(post => post.id), ['one']);
    await block.set({ blocker_id: author.uid, blocked_id: viewer.profile });
    assert.deepEqual((await read(viewer, { feed: 'following' })).posts, []); await block.delete();
    await db.doc(`profiles/${author.profile}`).update({ is_private: true });
    assert.deepEqual((await read(viewer, { feed: 'following' })).posts, []);
    const pending = await manageFollowAuthority(db, viewer.uid, { ...followInput, revision: followed.revision });
    await manageFollowAuthority(db, author.uid, { expectedOwnerUid: author.uid, expectedProfileId: author.profile, action: 'approve', relationshipId: pending.relationshipId, revision: pending.revision });
    assert.deepEqual((await read(viewer, { feed: 'following' })).posts.map(post => post.id), ['one']);
    await manageFollowAuthority(db, viewer.uid, { expectedOwnerUid: viewer.uid, expectedProfileId: viewer.profile, action: 'unfollow', relationshipId: pending.relationshipId, revision: pending.revision + 1 });
    assert.deepEqual((await read(viewer, { feed: 'following' })).posts, []);
    await db.doc(`profiles/${author.profile}`).update({ is_private: false });
    await db.doc(`_follow_authority/${followAuthorityId(author.uid, viewer.uid)}`).delete();
    await clearPosts(); await seed();
  });
  await check('personalization ranks admitted posts using viewer signals without surfacing restricted content', async () => {
    await clearPosts(); await seed('popular', { like_count: 2 }); await seed('funny');
    await seed('private', { audience: 'only_me', like_count: 999999 });
    await db.doc('likes/learn-humor').set({ user_id: viewer.profile, post_id: 'past-post', reaction_type: 'haha', created_at: '2026-10-04T12:00:00.000Z' });
    await db.doc('post_mood_signals/humor').set({ post_id: 'funny', mood: 'funny', signal_strength: 3 });
    await db.doc('post_mood_signals/private').set({ post_id: 'private', mood: 'funny', signal_strength: 999999 });
    const ranked = await read(viewer, { feed: 'personalized' }); assert.equal(ranked.feed, 'personalized');
    assert.deepEqual(ranked.posts.map(post => post.id), ['funny', 'popular']);
    await db.doc('likes/learn-humor').delete();
    assert.deepEqual((await read(viewer, { feed: 'personalized' })).posts.map(post => post.id), ['popular', 'funny']);
    await db.doc('post_mood_signals/humor').delete(); await db.doc('post_mood_signals/private').delete();
  });
  await check('Following continues past unrelated candidates to older friend posts', async () => {
    await clearPosts();
    await Promise.all(Array.from({ length: 21 }, (_, i) => seed(`self-${i}`, { author_id: viewer.profile })));
    await seed('older-friend', { created_at: '2026-10-03T12:00:00.000Z' });
    const disconnected = await read(viewer, { feed: 'following' }); assert.deepEqual(disconnected.posts, []); assert.equal(disconnected.nextCursor, null);
    await relationship.set({ sender_id: author.profile, receiver_id: viewer.uid, status: 'accepted' });
    const first = await read(viewer, { feed: 'following' }); assert.deepEqual(first.posts, []); assert.ok(first.nextCursor);
    const second = await read(viewer, { feed: 'following', cursor: first.nextCursor });
    assert.deepEqual(second.posts.map(post => post.id), ['older-friend']); assert.equal(second.nextCursor, null);
    await relationship.delete();
    assert.deepEqual((await read(viewer, { feed: 'following', cursor: first.nextCursor })).posts, []);
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
  await check('Local requires explicit coarse areas and author-owned acknowledged sharing', async () => {
    await clearPosts(); await resetPolicy(); await seed('local-near'); await seed('local-far'); await seed('local-private', { audience: 'only_me' }); await seed('local-unshared');
    const area = { lat: 41.9, lng: -87.6 };
    const manage = (postId, patch = {}, who = author) => managePostLocalAreaAuthority(db, who.uid, { ...request(who), postId, action: 'state', ...patch });
    await assert.rejects(managePostLocalArea.run({ data: {} }), { code: 'unauthenticated' });
    for (const patch of [{ feed: 'local' }, { feed: 'local', area: { lat: 41.878, lng: -87.6 } }, { area }, { feed: 'local', area: { ...area, precise: true } }]) await assert.rejects(read(viewer, patch), { code: 'invalid-argument' });
    await assert.rejects(manage('local-near', {}, viewer), { code: 'permission-denied' });
    await assert.rejects(manage('local-near', { action: 'share', revision: 0, area: { lat: 41.878, lng: -87.6 } }), { code: 'invalid-argument' });
    assert.equal((await manage('local-near')).enabled, false);
    for (const postId of ['local-near', 'local-private']) await manage(postId, { action: 'share', revision: 0, area });
    await manage('local-far', { action: 'share', revision: 0, area: { lat: 0, lng: 0 } });
    const page = await read(viewer, { feed: 'local', area }); assert.deepEqual(page.posts.map(post => post.id), ['local-near']); assert.deepEqual(page.area, area);
    assert.ok(!JSON.stringify(page.posts).includes('41.9'));
    await assert.rejects(manage('local-near', { action: 'remove', revision: 0 }), { code: 'failed-precondition' });
    await block.set({ blocker_id: author.profile, blocked_id: viewer.uid }); assert.deepEqual((await read(viewer, { feed: 'local', area })).posts, []); await block.delete();
    await manage('local-near', { action: 'remove', revision: 1 }); assert.deepEqual((await read(viewer, { feed: 'local', area })).posts, []);
    assert.equal((await db.doc('_post_local_areas/local-near').get()).data().area, null);
    await assert.rejects(manage('local-near', { action: 'share', revision: 1, area }), { code: 'failed-precondition' });
    await manage('local-near', { action: 'share', revision: 2, area });
    await db.doc('_post_local_areas/local-near').update({ owner_uid: viewer.uid }); assert.deepEqual((await read(viewer, { feed: 'local', area })).posts, []);
    await assert.rejects(manage('local-near'), { code: 'failed-precondition' });
  });
  await check('Local cursors cannot move between areas and recheck sharing after removal', async () => {
    await clearPosts(); await db.recursiveDelete(db.collection('_post_local_areas'));
    const area = { lat: 0, lng: 179.9 };
    await Promise.all(Array.from({ length: 21 }, (_, i) => seed(`unshared-${i}`)));
    await seed('older-near', { created_at: '2026-10-03T12:00:00.000Z' });
    const input = { ...request(author), postId: 'older-near', action: 'share', revision: 0, area: { lat: 0, lng: -179.9 } };
    await managePostLocalArea.run({ auth: { uid: author.uid }, data: input });
    const first = await read(viewer, { feed: 'local', area }); assert.deepEqual(first.posts, []); assert.ok(first.nextCursor);
    await assert.rejects(read(viewer, { feed: 'local', area: { lat: 0, lng: 179.8 }, cursor: first.nextCursor }), { code: 'failed-precondition' });
    await assert.rejects(read(viewer, { cursor: first.nextCursor }), { code: 'failed-precondition' });
    assert.deepEqual((await read(viewer, { feed: 'local', area, cursor: first.nextCursor })).posts.map(post => post.id), ['older-near']);
    const { area: ignoredArea, ...removeInput } = input;
    await managePostLocalAreaAuthority(db, author.uid, { ...removeInput, action: 'remove', revision: 1 });
    assert.deepEqual((await read(viewer, { feed: 'local', area, cursor: first.nextCursor })).posts, []);
    for (const context of [env.unauthenticatedContext(), env.authenticatedContext(author.uid), env.authenticatedContext(viewer.uid, { admin: true })]) {
      const database = context.firestore();
      await assertFails(getDoc(doc(database, '_post_local_areas/older-near')));
      await assertFails(setDoc(doc(database, '_post_local_areas/older-near'), { enabled: true }));
      await assertFails(getDocs(collection(database, '_post_local_areas')));
    }
  });
  const externalConnection = 'a'.repeat(32);
  const externalAuthority = db.doc('game_partner_connections/feed-boundary-test');
  const external = (connectionId = externalConnection) => ({ connectionId, authorize: async tx => {
    const row = (await tx.get(externalAuthority)).data();
    if (row?.status !== 'active') throw Object.assign(new Error('Connection revoked'), { code: 'permission-denied' });
  } });
  const externalRead = (patch = {}, boundary = external()) => readSocialFeedPage(db, viewer.uid, request(viewer, patch), Date.now(), boundary);
  await check('external boundary exposes only explicit safe public content and no viewer signals', async () => {
    await clearPosts(); await resetPolicy();
    await externalAuthority.set({ status: 'active' });
    await db.doc(`profiles/${author.profile}`).update({ is_private: false });
    await relationship.set({ sender_id: viewer.profile, receiver_id: author.profile, status: 'accepted' });
    await seed('external-public', { visibility: 'public' });
    await seed('external-friends', { visibility: 'friends' });
    await seed('external-unrated', { visibility: 'public', age_rating: 'unrated' });
    await seed('external-adult', { visibility: 'public', age_rating: '18+' });
    await seed('external-implicit');
    await db.doc(`profiles/${viewer.profile}`).update({ is_private: false });
    await seed('external-self-private', { author_id: viewer.profile, visibility: 'only_me' });
    await seed('external-conflicting', { visibility: 'public', audience: 'only_me' });
    await db.doc('likes/external-personal').set({ user_id: viewer.uid, post_id: 'external-public', reaction_type: 'love' });
    await db.doc('bookmarks/external-personal').set({ user_id: viewer.uid, post_id: 'external-public' });
    const page = await externalRead();
    assert.deepEqual(page.posts.map(post => post.id), ['external-public']);
    assert.equal(page.posts[0].reactionType, null); assert.equal(page.posts[0].isBookmarked, false);
    const normal = await read(); assert.equal(normal.posts.find(post => post.id === 'external-public').reactionType, 'love');
    assert.equal(normal.posts.find(post => post.id === 'external-public').isBookmarked, true);
    await preference.set({ profile_id: author.profile, fields: { posts: 'friends' } });
    assert.deepEqual((await externalRead()).posts, []);
    await preference.delete();
    await db.doc(`profiles/${author.profile}`).update({ is_private: true });
    assert.deepEqual((await externalRead()).posts, []);
    await db.doc(`profiles/${author.profile}`).update({ is_private: false });
    await block.set({ blocker_id: author.uid, blocked_id: viewer.uid });
    assert.deepEqual((await externalRead()).posts, []);
    await block.delete();
  });
  await check('external pagination is connection-bound and cannot borrow first-party cursors', async () => {
    await clearPosts(); await resetPolicy();
    await Promise.all(Array.from({ length: 22 }, (_, i) => seed(`external-page-${i}`, { visibility: 'public' })));
    const page = await externalRead(); assert.equal(page.posts.length, 20); assert.ok(page.nextCursor);
    assert.equal((await externalRead({ cursor: page.nextCursor })).posts.length, 2);
    await assert.rejects(externalRead({ cursor: page.nextCursor }, external('b'.repeat(32))), { code: 'failed-precondition' });
    await assert.rejects(read(viewer, { cursor: page.nextCursor }), { code: 'failed-precondition' });
    const normal = await read();
    await assert.rejects(externalRead({ cursor: normal.nextCursor }), { code: 'failed-precondition' });
    await externalAuthority.update({ status: 'revoked' });
    await assert.rejects(externalRead({ cursor: page.nextCursor }), { code: 'permission-denied' });
    await assert.rejects(externalRead(), { code: 'permission-denied' });
  });
  await check('external boundary rejects ranking/location modes and client-injected permissions', async () => {
    for (const feed of ['following', 'personalized', 'local']) await assert.rejects(externalRead({ feed, ...(feed === 'local' ? { area: { lat: 0, lng: 0 } } : {}) }), { code: 'invalid-argument' });
    await assert.rejects(read(viewer, { external: { connectionId: externalConnection } }), { code: 'invalid-argument' });
    await assert.rejects(externalRead({}, external('malformed')), { code: 'invalid-argument' });
  });
  const preview = (patch = {}, who = viewer) => readSocialPostPreviewsPage(db, who.uid, request(who, { postIds: ['preview'], ...patch }));
  await clearPosts(); await resetPolicy(); await seed('preview', { secret: 'preview-secret', visibility: 'public' });
  await check('known-ID preview validates identity, bounds and duplicate IDs before reading', async () => {
    await assert.rejects(readSocialPostPreviews.run({ data: {} }), { code: 'unauthenticated' });
    await assert.rejects(preview({ expectedOwnerUid: author.uid }), { code: 'failed-precondition' });
    await assert.rejects(preview({ expectedProfileId: author.profile }), { code: 'failed-precondition' });
    for (const patch of [{ postIds: [] }, { postIds: ['preview', 'preview'] }, { postIds: ['bad/path'] }, { postIds: Array.from({ length: 21 }, (_, i) => `post-${i}`) }, { postIds: 'preview' }, { mediaUrl: 'https://example.test/copied.png' }, { admin: true }]) {
      await assert.rejects(preview(patch), { code: 'invalid-argument' });
    }
  });
  await check('known-ID previews expose only admitted projection and omit missing or hidden posts', async () => {
    await seed('hidden-preview', { is_hidden: true });
    const result = await readSocialPostPreviews.run({ auth: { uid: viewer.uid }, data: request(viewer, { postIds: ['missing', 'preview', 'hidden-preview'] }) });
    assert.deepEqual(result.requestedPostIds, ['missing', 'preview', 'hidden-preview']);
    assert.equal(result.ownerUid, viewer.uid); assert.equal(result.viewerProfileId, viewer.profile);
    assert.deepEqual(result.posts.map(post => post.id), ['preview']);
    assert.ok(!JSON.stringify(result).includes('preview-secret')); assert.ok(!JSON.stringify(result).includes('must-not-escape'));
    assert.ok(!Object.hasOwn(result.posts[0], 'reactionType')); // Preview makes no claim about interaction state.
  });
  await check('known-ID previews recheck visibility, friendship and blocks on every request', async () => {
    for (const fields of [{ posts: 'only_me' }, { posts: 'unknown' }, { posts: 'friends' }]) {
      await preference.set({ fields }); assert.deepEqual((await preview()).posts, []);
    }
    await relationship.set({ sender_id: viewer.uid, receiver_id: author.profile, status: 'accepted' });
    assert.equal((await preview()).posts.length, 1);
    await block.set({ blocker_id: author.uid, blocked_id: viewer.profile }); assert.deepEqual((await preview()).posts, []);
    await resetPolicy();
    await seed('preview', { visibility: 'public', audience: 'only_me' }); assert.deepEqual((await preview()).posts, []);
    assert.equal((await preview({}, author)).posts.length, 1);
    await seed('preview', { user_id: viewer.uid }); assert.deepEqual((await preview()).posts, []);
    await seed('preview', { status: 'draft' }); assert.deepEqual((await preview()).posts, []);
    await db.doc('posts/preview').delete(); assert.deepEqual((await preview()).posts, []);
  });
  console.log(`Social feed backend: ${checks} grouped checks passed.`);
} finally { await env.cleanup(); await db.terminate(); }
