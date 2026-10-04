import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const projectId = process.env.GCLOUD_PROJECT;
assert.match(projectId || '', /^demo-[a-z0-9-]+$/);
assert.notEqual(projectId, 'demo-vybe-preview', 'Use an isolated test project');
assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):\d+$/);
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId });
const { db } = await import('../functions/lib/_shared/admin.js');
const { runMiniAppDraftSave, saveMiniAppDraft, runMiniAppDraftDelete, deleteMiniAppDraft } = await import('../functions/lib/miniAppDrafts.js');
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { Timestamp } = require('firebase-admin/firestore');
const uid = `draft-qa-${Date.now()}`;
const source = { title: 'Synthetic draft', description: '', category: 'game', html: '<button>Play</button>', css: '', javascript: '' };
let appId = `${uid}-app`;
let checks = 0;
const input = (patch = {}) => ({ expectedOwnerUid: uid, appId, expectedSource: null, source, ...patch });
const call = data => runMiniAppDraftSave(db, uid, data);
const check = async (name, fn) => { await fn(); checks++; console.log(`PASS ${name}`); };
await check('guests, account mismatch and malformed requests cannot save', async () => {
  await assert.rejects(saveMiniAppDraft.run({ data: input() }), { code: 'unauthenticated' });
  await assert.rejects(call(input({ expectedOwnerUid: 'other' })), { code: 'failed-precondition' });
  for (const patch of [{ admin: true }, { appId: '../bad' }, { source: { ...source, owner_id: uid } }, { source: { ...source, html: 'a'.repeat(100001) } }, { expectedSource: undefined }]) {
    await assert.rejects(call(input(patch)), { code: 'invalid-argument' });
  }
});
let receipt;
await check('first save and lost-response retry consume one admission', async () => {
  receipt = await call(input());
  assert.deepEqual(await call(input()), receipt);
  assert.equal((await db.doc(`_mini_app_draft_quotas/${uid}`).get()).data().count, 1);
  assert.equal((await db.doc(`mini_apps/${appId}`).get()).exists, false);
});
await check('edits retain creation time and reject stale editors', async () => {
  const newer = { ...source, title: 'Newer edit' };
  const result = await call(input({ expectedSource: source, source: newer }));
  assert.deepEqual(result.createdAt, receipt.createdAt);
  await assert.rejects(call(input({ expectedSource: source, source: { ...source, title: 'Stale edit' } })), { code: 'aborted' });
  assert.equal((await db.doc(`mini_app_drafts/${appId}`).get()).data().title, 'Newer edit');
  await call(input({ expectedSource: newer }));
});
await check('foreign ownership cannot be overwritten even with matching source', async () => {
  const other = `${uid}-foreign`;
  await db.doc(`mini_app_drafts/${other}`).set({ ...source, owner_id: 'other', schema_version: 1, created_at: Timestamp.now(), updated_at: Timestamp.now() });
  await assert.rejects(call(input({ appId: other })), { code: 'permission-denied' });
});
await check('deleted existing drafts are not resurrected by stale edits', async () => {
  await assert.rejects(call(input({ appId: `${uid}-missing`, expectedSource: source })), { code: 'aborted' });
});
await check('simultaneous saves to one new identity keep exactly one version', async () => {
  const id = `${uid}-same-id`;
  const choices = [source, { ...source, title: 'Other editor' }];
  const results = await Promise.allSettled(choices.map(value => call(input({ appId: id, source: value }))));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.code, 'aborted');
  const winner = results.find(result => result.status === 'fulfilled').value;
  assert.equal((await db.doc(`mini_app_drafts/${id}`).get()).data().title, winner.source.title);
  assert.equal((await db.doc(`_mini_app_draft_quotas/${uid}`).get()).data().count, 2);
});
await check('concurrent first admissions share the final daily slot', async () => {
  await db.doc(`_mini_app_draft_quotas/${uid}`).update({ count: 99 });
  const results = await Promise.allSettled(['a', 'b'].map(suffix => call(input({ appId: `${uid}-race-${suffix}` }))));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.code, 'resource-exhausted');
  assert.equal((await db.doc(`_mini_app_draft_quotas/${uid}`).get()).data().count, 100);
});
await check('daily exhaustion still permits editing, and deletion cannot refund creation allowance', async () => {
  await call(input({ expectedSource: source, source: { ...source, title: 'Edit at limit' } }));
  await runMiniAppDraftDelete(db, uid, { expectedOwnerUid: uid, appId, expectedSource: { ...source, title: 'Edit at limit' } });
  await assert.rejects(call(input()), { code: 'aborted' });
  appId = `${uid}-replacement`;
  await assert.rejects(call(input()), error => error.code === 'resource-exhausted' && error.details.retryAfter > 0);
});
await check('invalid quota fails closed and expired window resets', async () => {
  await db.doc(`_mini_app_draft_quotas/${uid}`).update({ count: -1 });
  await assert.rejects(call(input()), { code: 'failed-precondition' });
  await db.doc(`_mini_app_draft_quotas/${uid}`).update({ count: 100, window_started_at_ms: Date.now() - 86400001 });
  await call(input());
  assert.equal((await db.doc(`_mini_app_draft_quotas/${uid}`).get()).data().count, 1);
});
await check('legacy libraries cannot bypass the 200 draft limit through simultaneous first calls', async () => {
  const owner = `${uid}-legacy`; const batch = db.batch();
  for (let i = 0; i < 199; i++) batch.set(db.doc(`mini_app_drafts/${owner}-${i}`), { ...source, owner_id: owner, schema_version: 1, created_at: Timestamp.now(), updated_at: Timestamp.now() });
  await batch.commit();
  const results = await Promise.allSettled(['a', 'b'].map(suffix => runMiniAppDraftSave(db, owner, input({ expectedOwnerUid: owner, appId: `${owner}-${suffix}` }))));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.code, 'resource-exhausted');
  const edit = input({ expectedOwnerUid: owner, appId: `${owner}-0`, expectedSource: source, source: { ...source, title: 'Editable when full' } });
  await runMiniAppDraftSave(db, owner, edit);
  await runMiniAppDraftDelete(db, owner, { expectedOwnerUid: owner, appId: `${owner}-1`, expectedSource: source });
  assert.equal((await db.doc(`_mini_app_draft_identities/${owner}-1`).get()).data().status, 'deleted');
  await runMiniAppDraftSave(db, owner, input({ expectedOwnerUid: owner, appId: `${owner}-replacement` }));
});
await check('malformed stored drafts are not silently repaired', async () => {
  await db.doc(`mini_app_drafts/${appId}`).update({ schema_version: 2 });
  await assert.rejects(call(input()), { code: 'failed-precondition' });
});
await check('private corrections remain available without clearing active or malformed publication holds', async () => {
  const id = `${uid}-held`; let expected = null;
  for (const hold of [{ version: 1, app_id: id, owner_uid: uid, active: true }, { active: false }]) {
    await db.doc(`_mini_app_moderation/${id}`).set(hold);
    const next = { ...source, title: expected ? 'Corrected privately' : 'New held draft' };
    await call(input({ appId: id, source: next, expectedSource: expected }));
    assert.deepEqual((await db.doc(`_mini_app_moderation/${id}`).get()).data(), hold);
    assert.equal((await db.doc(`mini_apps/${id}`).get()).exists, false);
    expected = next;
  }
});
const remove = (id, expectedSource = source, patch = {}) => runMiniAppDraftDelete(db, uid, { expectedOwnerUid: uid, appId: id, expectedSource, ...patch });
await check('deletion requires authentication, matching account and strict source', async () => {
  await assert.rejects(deleteMiniAppDraft.run({ data: {} }), { code: 'unauthenticated' });
  await assert.rejects(remove('missing', source, { expectedOwnerUid: 'other' }), { code: 'failed-precondition' });
  await assert.rejects(remove('missing', source, { extra: true }), { code: 'invalid-argument' });
  await assert.rejects(remove('../invalid'), { code: 'invalid-argument' });
  await assert.rejects(remove('missing', null), { code: 'invalid-argument' });
  await assert.rejects(remove(`${uid}-never-created`), { code: 'aborted' });
  assert.equal((await db.doc(`_mini_app_draft_identities/${uid}-never-created`).get()).exists, false);
});
await check('retirement prevents delayed creates across quota windows and preserves publication and hold', async () => {
  const id = `${uid}-retired`;
  await call(input({ appId: id }));
  const published = { ...source, owner_id: uid, status: 'published' };
  const hold = { active: true };
  await db.doc(`mini_apps/${id}`).set(published);
  await db.doc(`_mini_app_moderation/${id}`).set(hold);
  assert.deepEqual(await remove(id), { appId: id, deleted: true });
  const marker = (await db.doc(`_mini_app_draft_identities/${id}`).get()).data();
  assert.equal(marker.status, 'deleted');
  assert.equal(marker.html, undefined);
  assert.equal(marker.expires_at, undefined);
  assert.match(marker.source_fingerprint, /^[a-f0-9]{64}$/);
  assert.deepEqual(await remove(id), { appId: id, deleted: true });
  assert.deepEqual((await db.doc(`_mini_app_draft_identities/${id}`).get()).data(), marker);
  await assert.rejects(remove(id, { ...source, title: 'Wrong retry' }), { code: 'aborted' });
  await db.doc(`_mini_app_draft_quotas/${uid}`).update({ window_started_at_ms: Date.now() - 86400001 });
  const quota = (await db.doc(`_mini_app_draft_quotas/${uid}`).get()).data();
  for (const patch of [{}, { expectedSource: source }, { source: { ...source, title: 'Replay edited' } }]) {
    await assert.rejects(call(input({ appId: id, ...patch })), { code: 'aborted' });
  }
  assert.deepEqual((await db.doc(`_mini_app_draft_quotas/${uid}`).get()).data(), quota);
  assert.equal((await db.doc(`mini_app_drafts/${id}`).get()).exists, false);
  assert.deepEqual((await db.doc(`mini_apps/${id}`).get()).data(), published);
  assert.deepEqual((await db.doc(`_mini_app_moderation/${id}`).get()).data(), hold);
  await assert.rejects(runMiniAppDraftSave(db, 'foreign', input({ expectedOwnerUid: 'foreign', appId: id })), { code: 'permission-denied' });
  await assert.rejects(runMiniAppDraftDelete(db, 'foreign', { expectedOwnerUid: 'foreign', appId: id, expectedSource: source }), { code: 'permission-denied' });
});
await check('stale deletion cannot erase new source and concurrent edit versus delete has one winner', async () => {
  const id = `${uid}-delete-race`;
  await call(input({ appId: id }));
  const edited = { ...source, title: 'New source' };
  await call(input({ appId: id, expectedSource: source, source: edited }));
  await assert.rejects(remove(id), { code: 'aborted' });
  const results = await Promise.allSettled([
    remove(id, edited), call(input({ appId: id, expectedSource: edited, source })),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.code, 'aborted');
  const row = (await db.doc(`mini_app_drafts/${id}`).get()).data();
  const marker = (await db.doc(`_mini_app_draft_identities/${id}`).get()).data();
  if (row) { assert.equal(row.title, source.title); assert.equal(marker.status, 'active'); }
  else { assert.equal(marker.status, 'deleted'); await assert.rejects(call(input({ appId: id })), { code: 'aborted' }); }
});
await check('missing active drafts and malformed identities fail closed', async () => {
  const id = `${uid}-orphaned`;
  await call(input({ appId: id }));
  await db.doc(`mini_app_drafts/${id}`).delete();
  await assert.rejects(call(input({ appId: id })), { code: 'aborted' });
  await assert.rejects(remove(id), { code: 'aborted' });
  await db.doc(`_mini_app_draft_identities/${id}`).update({ status: 'deleted', deleted_at: Timestamp.now(), source_fingerprint: ['a'.repeat(64)] });
  await assert.rejects(call(input({ appId: id })), { code: 'failed-precondition' });
  await assert.rejects(remove(id), { code: 'failed-precondition' });
});
console.log(`Mini-app drafts: ${checks} backend checks passed`);
await db.terminate();
