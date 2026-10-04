import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const projectId = process.env.GCLOUD_PROJECT;
assert.match(projectId || '', /^demo-[a-z0-9-]+$/);
assert.notEqual(projectId, 'demo-vybe-preview', 'Use an isolated test project');
assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):\d+$/);
assert.notEqual(process.env.FIRESTORE_EMULATOR_HOST.split(':')[1], '8280', 'Never touch retained preview');
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId });
const { db } = await import('../functions/lib/_shared/admin.js');
const { runManageSharedTheme: manage, runGenerateThemeCode: generate, runUseThemeCode: redeem, manageSharedTheme, generateThemeCode, useThemeCode } = await import('../functions/lib/sharedThemes.js');
const { sendDmMessage } = await import('../functions/lib/dmSend.js');
const { themeHash } = await import('../functions/lib/_shared/sharedThemeAuthority.js');
const { normalizeSharedThemeTokens, normalizeSharedThemeLayout } = await import('../functions/lib/_shared/sharedThemeSchema.js');
const prefix = `theme-qa-${Date.now()}`;
const people = Object.fromEntries(['alice', 'bob', 'carol'].map(name => [name, { uid: `${prefix}-${name}`, profileId: `${prefix}-${name}-profile` }]));
const actor = name => ({ expectedOwnerUid: people[name].uid, expectedProfileId: people[name].profileId });
const tokens = { colorPrimary: '330 100% 60%', colorSecondary: '240 10% 12%', colorAccent: '185 100% 50%', bgMain: '240 10% 4%', bgCard: '240 10% 6%', textPrimary: '0 0% 98%', textSecondary: '240 5% 55%', mode: 'dark', borderRadius: 'medium' };
const create = (visibility, patch = {}) => ({ ...actor('alice'), action: 'create', requestId: randomUUID(), themeName: 'Synthetic theme', themeTokens: tokens, visibility, ...patch });
const call = (name, input) => manage(db, people[name].uid, input);
const read = (name, id) => call(name, { ...actor(name), action: 'read', themeId: id });
const effect = (name, action, id, requestId = randomUUID()) => call(name, { ...actor(name), action, themeId: id, requestId });
const friendshipRef = db.doc(`friend_requests/${prefix}-friends`);
const friendship = { sender_id: people.alice.profileId, receiver_id: people.bob.profileId, status: 'accepted' };
for (const person of Object.values(people)) {
  await db.doc(`profiles/${person.profileId}`).set({ user_id: person.uid, username: person.profileId });
  await db.doc(`user_auth_index/${person.uid}`).set({ profile_id: person.profileId });
}
await friendshipRef.set(friendship);
let checks = 0;
const check = async (name, fn) => { await fn(); checks++; console.log(`PASS ${name}`); };
let privateTheme, publicTheme, unlistedTheme, friendsTheme;
await check('guests, account mismatch and malformed inputs fail before any writes', async () => {
  for (const fn of [manageSharedTheme, generateThemeCode, useThemeCode]) await assert.rejects(fn.run({ data: {} }), { code: 'unauthenticated' });
  await assert.rejects(call('alice', create('public', { expectedOwnerUid: people.bob.uid })), { code: 'failed-precondition' });
  for (const patch of [{ visibility: 'anyone' }, { requestId: 'bad' }, { themeTokens: { ...tokens, colorPrimary: '1; background:url(evil)' } }, { themeTokens: { ...tokens, backgroundImage: 'javascript:alert(1)' } }, { admin: true }, { recipientProfileIds: [people.bob.profileId] }]) await assert.rejects(call('alice', create('public', patch)), { code: 'invalid-argument' });
  await assert.rejects(call('alice', create('public', { expectedProfileId: people.bob.profileId })), { code: 'failed-precondition' });
});
await check('schema strips unknown properties, validates colors, URLs and layout', async () => {
  assert.equal(normalizeSharedThemeTokens({ ...tokens, hostile: 'url(evil)' }).hostile, undefined);
  assert.throws(() => normalizeSharedThemeTokens({ ...tokens, bgMain: '400 120% 50%' }));
  assert.throws(() => normalizeSharedThemeLayout({ font_heading: 'url(evil)' }));
  assert.deepEqual(normalizeSharedThemeLayout({ widget_order: ['one', 'one'], evil: 1 }), { widget_order: ['one'] });
});
await check('private snapshots atomically save once and immutable retries reuse UUID', async () => {
  const request = create('private');
  const [first, concurrent] = await Promise.all([call('alice', request), call('alice', request)]);
  privateTheme = first;
  assert.deepEqual(concurrent, privateTheme);
  assert.match(privateTheme.theme.id, /^[a-f0-9-]{36}$/);
  assert.deepEqual(await call('alice', request), privateTheme);
  const refs = await db.collection('saved_themes').where('user_id', '==', people.alice.profileId).where('shared_theme_id', '==', privateTheme.theme.id).get();
  assert.equal(refs.size, 1);
  assert.equal(privateTheme.theme.downloads_count, 1);
  await assert.rejects(call('alice', { ...request, themeName: 'Different snapshot' }), { code: 'already-exists' });
  assert.equal((await read('bob', privateTheme.theme.id)).theme, null);
  assert.equal((await read('alice', privateTheme.theme.id)).theme.id, privateTheme.theme.id);
});
await check('public and signed-in unlisted readers get sanitized receipts without grant details', async () => {
  await db.doc(`profiles/${people.alice.profileId}`).update({ display_name: 'Synthetic Alice', avatar_url: 'javascript:alert(1)', phone: 'private-fixture', bio: 'private biography' });
  publicTheme = await call('alice', create('public'));
  unlistedTheme = await call('alice', create('unlisted'));
  for (const created of [publicTheme, unlistedTheme]) {
    const result = await read('carol', created.theme.id);
    assert.equal(result.theme.id, created.theme.id);
    assert.equal(result.ownerUid, people.carol.uid);
    assert.equal(result.theme.recipients, undefined);
    assert.equal(result.theme.owner_uid, undefined);
    assert.deepEqual(result.theme.creator, { display_name: 'Synthetic Alice', username: people.alice.profileId, avatar_url: null });
    assert.equal(result.theme.creator.phone, undefined); assert.equal(result.theme.creator.bio, undefined);
  }
});
await check('friends creation checks named canonical recipient and current friendship', async () => {
  await assert.rejects(call('alice', create('friends', { recipientProfileIds: [people.carol.profileId] })), { code: 'permission-denied' });
  await assert.rejects(call('alice', create('friends', { recipientProfileIds: [people.bob.uid] })), { code: 'permission-denied' });
  friendsTheme = await call('alice', create('friends', { recipientProfileIds: [people.bob.profileId] }));
  assert.equal((await read('bob', friendsTheme.theme.id)).theme.id, friendsTheme.theme.id);
  assert.equal((await read('carol', friendsTheme.theme.id)).theme, null);
});
await check('friend removal and either-direction blocks revoke reads immediately', async () => {
  await friendshipRef.update({ status: 'declined' });
  assert.equal((await read('bob', friendsTheme.theme.id)).theme, null);
  await friendshipRef.set(friendship);
  for (const [blocker, blocked] of [['bob', 'alice'], ['alice', 'bob']]) {
    const ref = db.doc(`blocked_users/${prefix}-block`);
    await ref.set({ blocker_id: people[blocker].uid, blocked_id: people[blocked].profileId });
    assert.equal((await read('bob', friendsTheme.theme.id)).theme, null);
    assert.equal((await read('bob', unlistedTheme.theme.id)).theme, null);
    await ref.delete();
  }
});
await check('bulk Browse admission omits nonpublic, blocked and missing candidates even for owners', async () => {
  const ids = [publicTheme.theme.id, privateTheme.theme.id, unlistedTheme.theme.id, friendsTheme.theme.id, `${prefix}-missing`];
  const bulk = name => call(name, { ...actor(name), action: 'readMany', themeIds: ids });
  const bob = await bulk('bob');
  assert.equal(bob.ownerUid, people.bob.uid); assert.equal(bob.profileId, people.bob.profileId);
  assert.deepEqual(bob.themes.map(theme => theme.id), [publicTheme.theme.id]);
  assert.deepEqual((await bulk('carol')).themes.map(theme => theme.id), [publicTheme.theme.id]);
  assert.deepEqual((await bulk('alice')).themes.map(theme => theme.id), [publicTheme.theme.id]);
  const carolTheme = await call('carol', create('public', actor('carol')));
  const block = db.doc(`blocked_users/${prefix}-bulk-block`);
  await block.set({ blocker_id: people.bob.uid, blocked_id: people.alice.profileId });
  assert.deepEqual((await bulk('bob')).themes, []);
  const mixed = await call('bob', { ...actor('bob'), action: 'readMany', themeIds: [publicTheme.theme.id, carolTheme.theme.id] });
  assert.deepEqual(mixed.themes.map(theme => theme.id), [carolTheme.theme.id]);
  await block.delete();
});
await check('bulk input forgery, ambiguous identity, bad stored settings and service failures remain errors', async () => {
  const input = { ...actor('bob'), action: 'readMany', themeIds: [publicTheme.theme.id] };
  for (const themeIds of [[], [publicTheme.theme.id, publicTheme.theme.id], Array.from({ length: 21 }, (_, i) => `theme-${i}`), ['../bad'], [null], 'theme']) {
    await assert.rejects(call('bob', { ...input, themeIds }), { code: 'invalid-argument' });
  }
  await assert.rejects(call('bob', { ...input, expectedProfileId: people.alice.profileId }), { code: 'failed-precondition' });
  await assert.rejects(call('bob', { ...input, themes: [publicTheme.theme] }), { code: 'invalid-argument' });
  const malformedId = `${prefix}-malformed-bulk`;
  await db.doc(`shared_themes/${malformedId}`).set({ ...publicTheme.theme, theme_tokens: { ...tokens, colorPrimary: 'url(evil)' } });
  await assert.rejects(call('bob', { ...input, themeIds: [publicTheme.theme.id, malformedId] }), { code: 'failed-precondition' });
  await assert.rejects(manage({ runTransaction: async () => { throw new Error('Synthetic service failure'); } }, people.bob.uid, input), /Synthetic service failure/);
});
await check('bulk callable has a separate 20-per-minute ceiling within the normal quota', async () => {
  const request = { auth: { uid: people.carol.uid }, data: { ...actor('carol'), action: 'readMany', themeIds: [`${prefix}-missing-quota`] } };
  for (let index = 0; index < 20; index++) assert.deepEqual((await manageSharedTheme.run(request)).themes, []);
  await assert.rejects(manageSharedTheme.run(request), { code: 'resource-exhausted' });
  const single = { auth: request.auth, data: { ...actor('carol'), action: 'read', themeId: publicTheme.theme.id } };
  assert.equal((await manageSharedTheme.run(single)).theme.id, publicTheme.theme.id);
  await db.doc(`_rate_limits/theme-manage:${people.carol.uid}`).update({ count: 90, reset_at: Date.now() + 60000 });
  await assert.rejects(manageSharedTheme.run(single), { code: 'resource-exhausted' });
});
await check('legacy private rows never become bearer links; missing authority fails closed', async () => {
  const id = `${prefix}-legacy`;
  await db.doc(`shared_themes/${id}`).set({ ...privateTheme.theme, creator_id: people.alice.profileId, is_public: false });
  assert.equal((await read('bob', id)).theme, null);
  assert.equal((await read('alice', id)).theme.id, id);
  await db.doc(`shared_themes/${id}`).update({ visibility: 'unlisted' });
  assert.equal((await read('bob', id)).theme, null);
});
await check('legacy UID creators and absent dates normalize without weakening identity', async () => {
  const id = `${prefix}-legacy-uid`;
  const row = { ...privateTheme.theme, creator_id: people.alice.uid, is_public: false };
  delete row.created_at;
  await db.doc(`shared_themes/${id}`).set(row);
  const result = await read('alice', id);
  assert.equal(result.theme.creator_id, people.alice.profileId); assert.equal(result.theme.created_at, '');
  assert.equal((await read('bob', id)).theme, null);
});
await check('save/like idempotency and concurrent transitions cannot double counters', async () => {
  const id = publicTheme.theme.id; const requestId = randomUUID();
  await Promise.all([effect('bob', 'save', id, requestId), effect('bob', 'save', id, requestId)]);
  await effect('bob', 'save', id);
  await Promise.all([effect('bob', 'like', id), effect('bob', 'like', id)]);
  const current = (await read('alice', id)).theme;
  assert.equal(current.downloads_count, 1); assert.equal(current.likes_count, 1);
  await assert.rejects(effect('bob', 'unsave', id, requestId), { code: 'already-exists' });
  await effect('bob', 'unlike', id); await effect('bob', 'unlike', id);
  await effect('bob', 'unsave', id); await effect('bob', 'unsave', id);
  assert.equal((await read('alice', id)).theme.likes_count, 0);
});
await check('legacy duplicate saved refs are cleared without accepting stale admission', async () => {
  const id = friendsTheme.theme.id;
  for (const suffix of ['a', 'b']) await db.doc(`saved_themes/${prefix}-${suffix}`).set({ user_id: people.bob.profileId, shared_theme_id: id });
  await effect('bob', 'unsave', id);
  assert.equal((await db.collection('saved_themes').where('user_id', '==', people.bob.profileId).where('shared_theme_id', '==', id).get()).size, 0);
  await friendshipRef.update({ status: 'declined' });
  await assert.rejects(effect('bob', 'save', id), { code: 'permission-denied' });
  await db.doc(`saved_themes/${prefix}-revoked`).set({ user_id: people.bob.profileId, shared_theme_id: id });
  await effect('bob', 'unsave', id);
  assert.equal((await db.doc(`saved_themes/${prefix}-revoked`).get()).exists, false);
  const deletedId = `${prefix}-deleted`;
  await db.doc(`theme_likes/${prefix}-deleted-like`).set({ user_id: people.bob.profileId, shared_theme_id: deletedId });
  await effect('bob', 'unlike', deletedId);
  assert.equal((await db.doc(`theme_likes/${prefix}-deleted-like`).get()).exists, false);
  await friendshipRef.set(friendship);
});
await check('only verified UID/profile aliases share saved and liked reference ownership', async () => {
  const created = await call('alice', create('public')); const id = created.theme.id;
  for (const collection of ['saved_themes', 'theme_likes']) {
    const uidRef = db.doc(`${collection}/${prefix}-alias-uid`);
    const profileRef = db.doc(`${collection}/${prefix}-alias-profile`);
    const foreignRef = db.doc(`${collection}/${prefix}-alias-foreign`);
    await uidRef.set({ user_id: people.bob.uid, shared_theme_id: id });
    await effect('bob', collection === 'saved_themes' ? 'save' : 'like', id);
    assert.equal((await db.collection(collection).where('shared_theme_id', '==', id).get()).size, 1);
    await profileRef.set({ user_id: people.bob.profileId, shared_theme_id: id });
    await foreignRef.set({ user_id: people.carol.uid, shared_theme_id: id });
    const collision = db.doc(`profiles/${people.bob.uid}`);
    await collision.set({ user_id: people.carol.uid });
    await assert.rejects(effect('bob', collection === 'saved_themes' ? 'unsave' : 'unlike', id), { code: 'failed-precondition' });
    assert.equal((await uidRef.get()).exists, true);
    await collision.delete();
    await effect('bob', collection === 'saved_themes' ? 'unsave' : 'unlike', id);
    assert.equal((await uidRef.get()).exists, false); assert.equal((await profileRef.get()).exists, false);
    assert.equal((await foreignRef.get()).exists, true);
  }
  assert.equal((await read('alice', id)).theme.downloads_count, 0);
  assert.equal((await read('alice', id)).theme.likes_count, 0);
});
let generated, generateRequest, useRequest;
await check('only owner public/unlisted export; lost code-generation response is stable', async () => {
  for (const theme of [privateTheme, friendsTheme]) await assert.rejects(generate(db, people.alice.uid, { ...actor('alice'), requestId: randomUUID(), themeId: theme.theme.id }), { code: 'permission-denied' });
  await assert.rejects(generate(db, people.bob.uid, { ...actor('bob'), requestId: randomUUID(), themeId: publicTheme.theme.id }), { code: 'permission-denied' });
  generateRequest = { ...actor('alice'), requestId: randomUUID(), themeId: unlistedTheme.theme.id };
  generated = await generate(db, people.alice.uid, generateRequest);
  assert.match(generated.code, /^[A-Z0-9]{8}$/);
  assert.deepEqual(await generate(db, people.alice.uid, generateRequest), generated);
  await assert.rejects(generate(db, people.alice.uid, { ...generateRequest, themeId: publicTheme.theme.id }), { code: 'already-exists' });
});
await check('redemption retries consume one use and immutable requests reject retargeting', async () => {
  useRequest = { ...actor('bob'), requestId: randomUUID(), code: generated.code };
  const result = await redeem(db, people.bob.uid, useRequest);
  assert.deepEqual(await redeem(db, people.bob.uid, useRequest), result);
  assert.equal((await db.doc(`_theme_codes/${generated.code}`).get()).data().uses_count, 1);
  await assert.rejects(redeem(db, people.bob.uid, { ...useRequest, code: 'ZZZZZZZZ' }), { code: 'already-exists' });
});
await check('code expiry and quotas apply while successful replay is free', async () => {
  const ref = db.doc(`_theme_codes/${generated.code}`);
  await ref.update({ uses_count: 100 });
  await redeem(db, people.bob.uid, useRequest);
  await assert.rejects(redeem(db, people.carol.uid, { ...actor('carol'), requestId: randomUUID(), code: generated.code }), { code: 'resource-exhausted' });
  await ref.update({ expires_at: new Date(Date.now() - 1).toISOString() });
  await assert.rejects(redeem(db, people.bob.uid, useRequest), { code: 'failed-precondition' });
  await ref.update({ expires_at: generated.expiresAt, uses_count: 1 });
  await ref.update({ uses_count: -1 });
  await assert.rejects(redeem(db, people.bob.uid, useRequest), { code: 'failed-precondition' });
  await assert.rejects(generate(db, people.alice.uid, generateRequest), { code: 'failed-precondition' });
  await ref.update({ uses_count: 1 });
});
await check('code replay rechecks current access and does not return saved private contents', async () => {
  const id = unlistedTheme.theme.id;
  await db.doc(`shared_themes/${id}`).update({ visibility: 'private' });
  await db.doc(`_shared_theme_authority/${id}`).update({ visibility: 'private' });
  await assert.rejects(redeem(db, people.bob.uid, useRequest), { code: 'permission-denied' });
  await assert.rejects(generate(db, people.alice.uid, generateRequest), { code: 'permission-denied' });
  await db.doc(`shared_themes/${id}`).update({ visibility: 'unlisted' });
  await db.doc(`_shared_theme_authority/${id}`).update({ visibility: 'unlisted' });
});
await check('concurrent final code admissions cannot exceed the use limit', async () => {
  const ref = db.doc(`_theme_codes/${generated.code}`);
  await ref.update({ uses_count: 99 });
  const results = await Promise.allSettled(['bob', 'carol'].map(name => redeem(db, people[name].uid, { ...actor(name), requestId: randomUUID(), code: generated.code })));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.code, 'resource-exhausted');
  assert.equal((await ref.get()).data().uses_count, 100);
  await ref.update({ uses_count: 1 });
});
await check('canonical identity changes and ambiguity never inherit old grants', async () => {
  await db.doc(`user_auth_index/${people.bob.uid}`).update({ profile_id: people.carol.profileId });
  await assert.rejects(read('bob', friendsTheme.theme.id), { code: 'failed-precondition' });
  await db.doc(`user_auth_index/${people.bob.uid}`).update({ profile_id: people.bob.profileId });
  const ambiguous = db.doc(`profiles/${people.bob.uid}`);
  await ambiguous.set({ user_id: people.carol.uid });
  await assert.rejects(read('bob', friendsTheme.theme.id), { code: 'failed-precondition' });
  await ambiguous.delete();
});
let dmInput;
await check('friend theme DM is checked, idempotent and has no media URL', async () => {
  const conversationId = [people.alice.profileId, people.bob.profileId].sort().join('_');
  dmInput = { conversationId, expectedSenderUid: people.alice.uid, otherProfileId: people.bob.profileId, content: friendsTheme.theme.id, messageType: 'shared_theme', mediaUrl: null, mediaType: null, viewMode: 'permanent', clientMessageId: `theme-${randomUUID()}` };
  const send = data => sendDmMessage.run({ auth: { uid: people.alice.uid }, data });
  const first = await send(dmInput); const retry = await send(dmInput);
  assert.equal(first.message.id, retry.message.id); assert.equal(retry.deduped, true); assert.equal(first.message.media_url, null);
  const second = await call('alice', create('friends', { recipientProfileIds: [people.bob.profileId] }));
  await assert.rejects(send({ ...dmInput, content: second.theme.id }), { code: 'already-exists' });
  for (const patch of [{ mediaUrl: 'theme name' }, { clientMessageId: 'x'.repeat(129) }, { viewMode: 'view_once' }, { mediaType: 'image' }, { expectedSenderUid: undefined }]) await assert.rejects(send({ ...dmInput, ...patch }), { code: 'invalid-argument' });
  await friendshipRef.update({ status: 'declined' });
  await assert.rejects(send(dmInput), { code: 'permission-denied' });
  await friendshipRef.set(friendship);
  await db.doc(`messages/${first.message.id}`).update({ is_deleted: true });
  await assert.rejects(send(dmInput), { code: 'failed-precondition' });
});
await check('DM cannot forward a theme or expand selected recipients into a group', async () => {
  const groupId = `${prefix}-group`;
  await db.doc(`conversations/${groupId}`).set({ is_group: true, member_ids: [people.alice.profileId, people.bob.profileId] });
  await assert.rejects(sendDmMessage.run({ auth: { uid: people.alice.uid }, data: { ...dmInput, conversationId: groupId, clientMessageId: randomUUID() } }), { code: 'permission-denied' });
  await assert.rejects(sendDmMessage.run({ auth: { uid: people.bob.uid }, data: { ...dmInput, expectedSenderUid: people.bob.uid, otherProfileId: people.alice.profileId, clientMessageId: randomUUID() } }), { code: 'permission-denied' });
});
await check('ordinary DM text retains its existing send, retry and block enforcement', async () => {
  const data = { ...dmInput, expectedSenderUid: undefined, messageType: 'text', content: 'Synthetic ordinary DM', clientMessageId: randomUUID() };
  const send = () => sendDmMessage.run({ auth: { uid: people.alice.uid }, data });
  const first = await send(); const retry = await send();
  assert.equal(first.message.id, retry.message.id); assert.equal(retry.deduped, true);
  const block = db.doc(`blocked_users/${prefix}-dm-block`);
  await block.set({ blocker_id: people.bob.profileId, blocked_id: people.alice.profileId });
  await assert.rejects(send(), { code: 'permission-denied' });
  await block.delete();
});
await check('deleted themes produce checked empty reads and cannot be recreated by retry', async () => {
  const request = create('unlisted'); const created = await call('alice', request);
  await db.doc(`shared_themes/${created.theme.id}`).delete();
  assert.deepEqual(await read('bob', created.theme.id), { theme: null, ownerUid: people.bob.uid, profileId: people.bob.profileId });
  await assert.rejects(call('alice', request), { code: 'not-found' });
  const receipt = await db.doc(`_shared_theme_receipts/${themeHash(people.alice.uid, request.requestId)}`).get();
  assert.equal(receipt.data().theme_id, created.theme.id);
});
console.log(`Shared-theme backend passed ${checks} grouped checks`);
await db.terminate();
