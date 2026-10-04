import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const projectId = process.env.GCLOUD_PROJECT;
assert.match(projectId || '', /^demo-[a-z0-9-]+$/);
assert.notEqual(projectId, 'demo-vybe-preview', 'Use an isolated test project');
assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):\d+$/);
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId });
const { db } = await import('../functions/lib/_shared/admin.js');
const { runMiniAppDraftSave, saveMiniAppDraft } = await import('../functions/lib/miniAppDrafts.js');
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { Timestamp } = require('firebase-admin/firestore');
const uid = `draft-qa-${Date.now()}`;
const source = { title: 'Synthetic draft', description: '', category: 'game', html: '<button>Play</button>', css: '', javascript: '' };
const appId = `${uid}-app`;
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
  await db.doc(`mini_app_drafts/${appId}`).delete();
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
  await db.doc(`mini_app_drafts/${owner}-1`).delete();
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
console.log(`Mini-app drafts: ${checks} backend checks passed`);
await db.terminate();
