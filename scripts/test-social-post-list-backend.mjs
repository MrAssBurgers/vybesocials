import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
const projectId = process.env.GCLOUD_PROJECT;
assert.match(projectId || '', /^demo-[a-z0-9-]+$/); assert.notEqual(projectId, 'demo-vybe-preview');
assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):8387$/);
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId });
const require = createRequire(path.resolve(process.env.FIREBASE_TEST_TOOLS_ROOT || '.', 'package.json'));
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, getDoc, getDocs, collection, query, where, setDoc } = require('firebase/firestore');
const { db } = await import('../functions/lib/_shared/admin.js');
const { readSocialPostListPage } = await import('../functions/lib/_shared/socialPostListAuthority.js');
const { readPublicSocialPost } = await import('../functions/lib/_shared/socialFeedAuthority.js');
const { readSocialPostList } = await import('../functions/lib/socialFeed.js');
const { getRecommendations, getRankedFeed, calculateFeedRanking } = await import('../functions/lib/social.js');
const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
const env = await initializeTestEnvironment({ projectId, firestore: { host, port: Number(port), rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8') } });
const alice = { uid: 'alice', profile: 'profile-alice' }, bob = { uid: 'bob', profile: 'profile-bob' };
const input = (patch = {}, owner = alice) => ({ expectedOwnerUid: owner.uid, expectedProfileId: owner.profile, scope: 'profile', targetId: bob.profile, ...patch });
const read = (patch = {}, owner = alice, now) => readSocialPostListPage(db, owner.uid, input(patch, owner), now);
const sample = (patch = {}) => ({ author_id: bob.profile, type: 'post', caption: 'Visible music', tags: ['music'], age_rating: 'safe', media_url: '', created_at: '2026-10-04T12:00:00.000Z', visibility: 'public', ...patch });
const seed = (id, patch = {}) => db.doc(`posts/${id}`).set(sample(patch));
const clear = () => db.recursiveDelete(db.collection('posts'));
let checks = 0; const check = async (name, run) => { await run(); console.log(`PASS ${name}`); checks++; };
try {
  await env.clearFirestore();
  for (const owner of [alice, bob]) { await db.doc(`profiles/${owner.profile}`).set({ user_id: owner.uid, username: owner.uid, is_private: false }); await db.doc(`user_auth_index/${owner.uid}`).set({ profile_id: owner.profile }); }
  await check('callable validates authenticated canonical binding and input before rate work', async () => {
    await assert.rejects(readSocialPostList.run({ data: input() }), { code: 'unauthenticated' });
    await assert.rejects(read({ expectedOwnerUid: bob.uid }), { code: 'failed-precondition' });
    await assert.rejects(read({ expectedProfileId: bob.profile }), { code: 'failed-precondition' });
    for (const patch of [{ scope: 'admin' }, { targetId: 'bad/path' }, { cursor: 'fake' }, { admin: true }, { scope: 'saved' }, { search: 'private' }, { contentType: [] }]) await assert.rejects(read(patch), { code: 'invalid-argument' });
    assert.equal((await db.collection('_rate_limits').get()).size, 0);
  });
  await check('all list scopes project only current permitted contents', async () => {
    await seed('visible', { sound_id: 'sound', filter_id: 'filter', secret: 'do-not-emit' }); await seed('denied', { visibility: 'only_me', sound_id: 'sound', filter_id: 'filter' });
    await db.doc('bookmarks/visible').set({ user_id: alice.uid, post_id: 'visible', created_at: '2026-10-04T12:00:00.000Z' });
    await db.doc('bookmarks/denied').set({ user_id: alice.profile, post_id: 'denied', created_at: '2026-10-04T12:00:01.000Z' });
    await db.doc('bookmarks/gone').set({ user_id: alice.profile, post_id: 'deleted', created_at: '2026-10-04T12:00:02.000Z' });
    await db.doc('post_user_tags/tag').set({ tagged_user_id: bob.uid, post_id: 'visible', created_at: '2026-10-04T12:00:00.000Z' });
    for (const patch of [{}, { targetId: bob.uid }, { scope: 'sound', targetId: 'sound' }, { scope: 'filter', targetId: 'filter' }, { scope: 'tagged' }, { scope: 'search', targetId: undefined, search: 'music' }, { scope: 'recent', targetId: undefined, since: '2026-10-04T00:00:00.000Z' }]) {
      const cleaned = Object.fromEntries(Object.entries(input(patch)).filter(([, value]) => value !== undefined));
      const result = await readSocialPostListPage(db, alice.uid, cleaned); assert.deepEqual(result.posts.map(row => row.id), ['visible']); assert.ok(!JSON.stringify(result).includes('do-not-emit'));
    }
    const saved = await readSocialPostListPage(db, alice.uid, { expectedOwnerUid: alice.uid, expectedProfileId: alice.profile, scope: 'saved' });
    assert.deepEqual(saved.posts.map(row => row.id), ['visible']); assert.deepEqual(saved.unavailableSavedPostIds, ['deleted', 'denied']);
    assert.equal((await read({}, bob)).posts.length, 2);
  });
  await check('every page rechecks author account, bilateral blocks, profile audience, deletion and drafts', async () => {
    const pref = db.doc(`profile_visibility/${bob.profile}`), block = db.doc('blocked_users/one');
    for (const fields of [{ posts: 'friends' }, { posts: 'only_me' }, { posts: 'unknown' }]) { await pref.set({ fields }); assert.equal((await read()).posts.length, 0); }
    await pref.set({ fields: { posts: 'friends' } }); await db.doc('friend_requests/friends').set({ sender_id: alice.uid, receiver_id: bob.profile, status: 'accepted' }); assert.equal((await read()).posts.length, 1);
    for (const pair of [[bob.uid, alice.profile], [alice.uid, bob.profile]]) { await block.set({ blocker_id: pair[0], blocked_id: pair[1] }); assert.equal((await read()).posts.length, 0); }
    await block.delete(); await pref.delete(); await db.doc('friend_requests/friends').delete();
    await db.doc(`profiles/${bob.profile}`).update({ is_private: true }); assert.equal((await read()).posts.length, 0); await db.doc(`profiles/${bob.profile}`).update({ is_private: false });
    for (const patch of [{ deleted_at: 'today' }, { is_draft: true }, { status: 'draft' }, { moderation_status: 'blocked' }, { user_id: alice.uid }]) { await seed('visible', patch); assert.equal((await read()).posts.length, 0); }
    await db.doc('posts/visible').delete(); assert.equal((await read()).posts.length, 0); await clear();
  });
  await check('profile paging preserves old pins and opaque cursor bindings including long IDs', async () => {
    await seed('old-pin', { created_at: '2025-01-01T00:00:00.000Z', is_pinned: true });
    for (let i = 0; i < 22; i++) await seed(i === 19 ? 'x'.repeat(200) : `page-${i}`, { created_at: new Date(Date.parse('2026-10-04T12:00:00.000Z') - i * 1000).toISOString(), author_id: i % 2 ? bob.uid : bob.profile });
    const first = await read({}, alice, 1000); assert.equal(first.posts[0].id, 'old-pin'); assert.ok(first.posts.some(row => row.id.length === 200)); assert.ok(first.nextCursor);
    const next = await read({ cursor: first.nextCursor }, alice, 2000); assert.equal(next.posts.length, 3); assert.equal(next.nextCursor, null);
    await assert.rejects(read({ cursor: first.nextCursor }, bob, 2000), { code: 'failed-precondition' });
    await assert.rejects(read({ cursor: first.nextCursor, targetId: alice.profile }, alice, 2000), { code: 'failed-precondition' });
    await assert.rejects(read({ cursor: first.nextCursor, contentType: 'video' }, alice, 2000), { code: 'failed-precondition' });
    await assert.rejects(read({ cursor: first.nextCursor }, alice, 601000), { code: 'failed-precondition' });
    await db.doc(`profile_visibility/${bob.profile}`).set({ fields: { posts: 'only_me' } }); assert.equal((await read({ cursor: first.nextCursor }, alice, 2000)).posts.length, 0); await db.doc(`profile_visibility/${bob.profile}`).delete(); await clear();
  });
  await check('search scans bounded candidates without treating a filtered page as completion', async () => {
    for (let i = 0; i < 102; i++) await seed(`search-${i}`, { caption: i === 101 ? 'needle caption' : 'different', created_at: new Date(Date.parse('2026-10-04T12:00:00.000Z') - i * 1000).toISOString() });
    const request = { expectedOwnerUid: alice.uid, expectedProfileId: alice.profile, scope: 'search', search: 'needle' };
    const first = await readSocialPostListPage(db, alice.uid, request); assert.deepEqual(first.posts, []); assert.ok(first.nextCursor); assert.ok(!JSON.stringify(first).includes('search-99'));
    const second = await readSocialPostListPage(db, alice.uid, { ...request, cursor: first.nextCursor }); assert.deepEqual(second.posts.map(row => row.id), ['search-101']); assert.equal(second.nextCursor, null); await clear();
  });
  await check('raw compatibility callables and anonymous previews cannot bypass audience', async () => {
    await seed('public'); await seed('private', { visibility: 'only_me' });
    assert.equal((await readPublicSocialPost(db, 'public')).id, 'public'); assert.equal(await readPublicSocialPost(db, 'private'), null);
    for (const fn of [getRankedFeed, getRecommendations]) { const result = await fn.run({ auth: { uid: alice.uid }, data: {} }); assert.deepEqual(result.posts.map(row => row.id), ['public']); }
    await assert.rejects(calculateFeedRanking.run({ auth: { uid: alice.uid }, data: { postId: 'public' } }), { code: 'permission-denied' });
    await db.doc(`profiles/${bob.profile}`).update({ is_private: true }); assert.equal(await readPublicSocialPost(db, 'public'), null); await db.doc(`profiles/${bob.profile}`).update({ is_private: false });
    await seed('public', { visibility: 'public', audience: 'friends' }); assert.equal(await readPublicSocialPost(db, 'public'), null); await seed('public', { is_draft: true }); assert.equal(await readPublicSocialPost(db, 'public'), null);
  });
  await check('raw reads are owner/staff only, including aliases and collision refusal', async () => {
    await seed('owner-uid', { author_id: bob.uid });
    const a = env.authenticatedContext(alice.uid).firestore(), b = env.authenticatedContext(bob.uid).firestore();
    await assertFails(getDoc(doc(a, 'posts/public'))); await assertFails(getDocs(collection(a, 'posts')));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'posts/public')));
    await assertSucceeds(getDoc(doc(b, 'posts/public'))); await assertSucceeds(getDoc(doc(b, 'posts/owner-uid')));
    await assertSucceeds(getDocs(query(collection(b, 'posts'), where('author_id', 'in', [bob.uid, bob.profile]))));
    await db.doc(`profiles/${bob.uid}`).set({ user_id: alice.uid, username: 'collision' });
    await assertFails(getDoc(doc(b, 'posts/public'))); await assertFails(getDoc(doc(b, 'posts/owner-uid')));
    await db.doc(`profiles/${bob.uid}`).delete();
    await assertFails(setDoc(doc(a, '_social_post_list_cursors/forged'), { owner_uid: alice.uid }));
    await assertFails(getDocs(collection(a, '_social_post_list_cursors')));
  });
  console.log(`Social post lists: ${checks} grouped checks passed.`);
} finally { await env.cleanup(); await db.terminate(); }
