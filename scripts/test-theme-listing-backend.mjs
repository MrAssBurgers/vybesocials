import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const projectId = process.env.GCLOUD_PROJECT;
assert.match(projectId || '', /^demo-[a-z0-9-]+$/); assert.notEqual(projectId, 'demo-vybe-preview');
assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):\d+$/);
assert.notEqual(process.env.FIRESTORE_EMULATOR_HOST.split(':')[1], '8280');
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId });
const { db } = await import('../functions/lib/_shared/admin.js');
const { runManageSharedTheme: run, manageSharedTheme } = await import('../functions/lib/sharedThemes.js');
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { Timestamp } = require('firebase-admin/firestore');
const prefix = `listing-${Date.now()}`;
const people = Object.fromEntries(['alice', 'bob', 'carol'].map(name => [name, { uid: `${prefix}-${name}`, profileId: `${prefix}-${name}-profile` }]));
const input = (name, action, extra = {}) => ({ expectedOwnerUid: people[name].uid, expectedProfileId: people[name].profileId, action, ...extra });
const call = (name, action, extra) => run(db, people[name].uid, input(name, action, extra));
const tokens = { colorPrimary: '330 100% 60%', colorSecondary: '240 10% 12%', colorAccent: '185 100% 50%', bgMain: '240 10% 4%', bgCard: '240 10% 6%', textPrimary: '0 0% 98%', textSecondary: '240 5% 55%', mode: 'dark', borderRadius: 'medium' };
const id = index => `${prefix}-theme-${String(index).padStart(3, '0')}`;
const publicCount = 135;
const source = index => ({ creator_id: people.alice.profileId, theme_name: index >= 100 ? `Ocean ${index}` : `Violet ${index}`, theme_tokens: tokens, is_public: true, likes_count: 1000 - index, downloads_count: 0, created_at: '2026-10-01T00:00:00.000Z' });
const batch = db.batch();
for (const person of Object.values(people)) {
  batch.set(db.doc(`profiles/${person.profileId}`), { user_id: person.uid, username: person.profileId, phone: 'PRIVATE' });
  batch.set(db.doc(`user_auth_index/${person.uid}`), { profile_id: person.profileId });
}
for (let index = 0; index < publicCount; index++) batch.set(db.doc(`shared_themes/${id(index)}`), source(index));
await batch.commit();
let checks = 0;
const check = async (name, fn) => { await fn(); checks++; console.log(`PASS ${name}`); };
let first;
await check('public listing pages rank deterministically without duplicates or truncating the final page', async () => {
  let cursor; const all = []; let pages = 0;
  do {
    const page = await call('bob', 'list', cursor ? { cursor } : {});
    first ||= page;
    assert.equal(page.ownerUid, people.bob.uid); assert.equal(page.profileId, people.bob.profileId);
    assert.ok(page.themes.length <= 50); all.push(...page.themes); cursor = page.nextCursor; pages++;
  } while (cursor);
  assert.equal(pages, 3); assert.deepEqual(all.map(theme => theme.id), Array.from({ length: publicCount }, (_, index) => id(index)));
  assert.equal(new Set(all.map(theme => theme.id)).size, publicCount);
  assert.equal(all[0].creator.phone, undefined);
});
await check('search pages keep continuation through empty pages until later matching results', async () => {
  const a = await call('bob', 'list', { search: 'Ocean' }); assert.deepEqual(a.themes, []); assert.ok(a.nextCursor);
  const b = await call('bob', 'list', { search: ' ocean ', cursor: a.nextCursor }); assert.deepEqual(b.themes, []); assert.ok(b.nextCursor);
  const c = await call('bob', 'list', { search: 'OCEAN', cursor: b.nextCursor }); assert.equal(c.themes.length, 35); assert.equal(c.nextCursor, null);
  await assert.rejects(call('bob', 'list', { search: 'Violet', cursor: a.nextCursor }), { code: 'failed-precondition' });
});
await check('opaque cursors are private, expiring and bound to current identity and listing scope', async () => {
  assert.match(first.nextCursor, /^[a-f0-9]{48}$/);
  const ref = db.doc(`_shared_theme_cursors/${first.nextCursor}`); const stored = (await ref.get()).data();
  assert.equal(stored.uid, people.bob.uid); assert.equal(stored.id, id(49));
  assert.ok(stored.expireAt instanceof Timestamp); assert.ok(stored.expireAt.toMillis() > Date.now());
  await assert.rejects(call('carol', 'list', { cursor: first.nextCursor }), { code: 'failed-precondition' });
  await assert.rejects(call('bob', 'listSaved', { cursor: first.nextCursor }), { code: 'failed-precondition' });
  for (const cursor of ['../forged', '', {}, '0'.repeat(48)]) await assert.rejects(call('bob', 'list', { cursor }));
  await ref.update({ expireAt: Timestamp.fromMillis(Date.now() - 1) });
  await assert.rejects(call('bob', 'list', { cursor: first.nextCursor }), { code: 'failed-precondition' });
});
await check('resuming rechecks current bilateral blocks, public status and deletion rather than cursor snapshots', async () => {
  const page = await call('bob', 'list');
  const block = db.doc(`blocked_users/${prefix}-block`);
  await block.set({ blocker_id: people.alice.uid, blocked_id: people.bob.profileId });
  const blocked = await call('bob', 'list', { cursor: page.nextCursor }); assert.deepEqual(blocked.themes, []); assert.ok(blocked.nextCursor);
  await block.delete();
  await db.doc(`shared_themes/${id(49)}`).delete();
  await db.doc(`shared_themes/${id(55)}`).update({ is_public: false });
  const current = await call('bob', 'list', { cursor: page.nextCursor });
  assert.equal(current.themes[0].id, id(50)); assert.ok(current.themes.every(theme => theme.id !== id(55)));
  await db.doc(`shared_themes/${id(49)}`).set(source(49)); await db.doc(`shared_themes/${id(55)}`).update({ is_public: true });
});
await check('malformed stored themes and identity errors are failures, never fake empty pages', async () => {
  await assert.rejects(run(db, people.bob.uid, input('bob', 'list', { expectedProfileId: people.alice.profileId })), { code: 'failed-precondition' });
  await assert.rejects(call('bob', 'list', { search: 'x'.repeat(81) }), { code: 'invalid-argument' });
  await assert.rejects(call('bob', 'list', { themeIds: [id(0)] }), { code: 'invalid-argument' });
  await db.doc(`shared_themes/${id(0)}`).update({ theme_tokens: {} });
  await assert.rejects(call('bob', 'list'), { code: 'failed-precondition' });
  await db.doc(`shared_themes/${id(0)}`).update({ theme_tokens: tokens });
});
await check('saved-reference pages preserve all UID/profile rows and unavailable references', async () => {
  const seeds = db.batch();
  for (let index = 0; index < publicCount; index++) seeds.set(db.doc(`saved_themes/${prefix}-save-${String(index).padStart(3, '0')}`), {
    user_id: index % 2 ? people.bob.uid : people.bob.profileId, shared_theme_id: id(index), created_at: index % 3 ? '2026-10-02T00:00:00.000Z' : '',
  });
  seeds.set(db.doc(`saved_themes/${prefix}-save-duplicate`), { user_id: people.bob.uid, shared_theme_id: id(0) });
  seeds.set(db.doc(`saved_themes/${prefix}-save-missing`), { user_id: people.bob.uid, shared_theme_id: `${prefix}-missing` });
  seeds.set(db.doc(`saved_themes/${prefix}-save-malformed`), { user_id: people.bob.profileId, shared_theme_id: '../bad' });
  seeds.set(db.doc(`shared_themes/${prefix}-private`), { ...source(0), is_public: false });
  seeds.set(db.doc(`saved_themes/${prefix}-save-private`), { user_id: people.bob.uid, shared_theme_id: `${prefix}-private` });
  seeds.set(db.doc(`saved_themes/${prefix}-foreign`), { user_id: people.carol.uid, shared_theme_id: id(0) });
  await seeds.commit();
  let cursor; const all = []; let pages = 0;
  do {
    const page = await call('bob', 'listSaved', cursor ? { cursor } : {});
    assert.ok(page.references.length <= 50); assert.equal(page.ownerUid, people.bob.uid);
    all.push(...page.references); cursor = page.nextCursor; pages++;
  } while (cursor);
  assert.equal(pages, 3); assert.equal(all.length, 139); assert.equal(new Set(all.map(row => row.savedId)).size, 139);
  assert.equal(all.filter(row => row.theme).length, 136); assert.equal(all.filter(row => !row.theme).length, 3);
  assert.ok(all.every(row => row.savedId !== `${prefix}-foreign`));
});
await check('saved-page continuation never reuses old access grants or another account cursor', async () => {
  const firstSaved = await call('bob', 'listSaved'); assert.equal(firstSaved.references.length, 50);
  await assert.rejects(call('carol', 'listSaved', { cursor: firstSaved.nextCursor }), { code: 'failed-precondition' });
  const block = db.doc(`blocked_users/${prefix}-saved-block`);
  await block.set({ blocker_id: people.bob.uid, blocked_id: people.alice.profileId });
  const next = await call('bob', 'listSaved', { cursor: firstSaved.nextCursor }); assert.ok(next.references.every(row => row.theme === null));
  await block.delete();
});
await check('public listing shares bounded bulk quota while saved pages use one primary admission each', async () => {
  await db.doc(`_rate_limits/theme-bulk:${people.bob.uid}`).set({ count: 20, reset_at: Date.now() + 60000 });
  await assert.rejects(manageSharedTheme.run({ auth: { uid: people.bob.uid }, data: input('bob', 'list') }), { code: 'resource-exhausted' });
  const saved = await manageSharedTheme.run({ auth: { uid: people.bob.uid }, data: input('bob', 'listSaved') });
  assert.equal(saved.references.length, 50);
});
console.log(`Theme listing backend passed ${checks} grouped checks`);
await db.terminate();
