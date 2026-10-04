import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const projectId = process.env.GCLOUD_PROJECT;
assert.match(projectId || '', /^demo-[a-z0-9-]+$/);
assert.notEqual(projectId, 'demo-vybe-preview', 'Use an isolated test project');
assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):\d+$/);
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId });
const { db } = await import('../functions/lib/_shared/admin.js');
const { runMiniAppPublish, publishMiniApp } = await import('../functions/lib/miniAppPublish.js');
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { Timestamp } = require('firebase-admin/firestore');
const uid = `publish-qa-${Date.now()}`;
const source = { title: 'Synthetic app', description: '', category: 'game', html: '<button>Play</button>', css: '', javascript: '' };
const appId = `${uid}-app`;
let sequence = 0; let checks = 0;
const input = (patch = {}) => ({ expectedOwnerUid: uid, appId, requestId: `publish-request-${++sequence}`, expectedVersion: null, source, ...patch });
const draft = (id, owner = uid, content = source) => db.doc(`mini_app_drafts/${id}`).set({ ...content, owner_id: owner, schema_version: 1, created_at: Timestamp.now(), updated_at: Timestamp.now() });
const call = data => runMiniAppPublish(db, uid, data);
const check = async (name, fn) => { await fn(); checks++; console.log(`PASS ${name}`); };
await check('guest and account mismatch cannot publish', async () => {
  await assert.rejects(publishMiniApp.run({ data: input() }), { code: 'unauthenticated' });
  await assert.rejects(call(input({ expectedOwnerUid: 'other' })), { code: 'failed-precondition' });
});
await check('missing and foreign drafts cannot publish', async () => {
  await assert.rejects(call(input()), { code: 'permission-denied' });
  await draft(appId, 'other');
  await assert.rejects(call(input()), { code: 'permission-denied' });
  await draft(appId);
});
await check('unknown fields and stale source are rejected', async () => {
  await assert.rejects(call(input({ source: { ...source, admin: true } })), { code: 'invalid-argument' });
  await assert.rejects(call(input({ source: { ...source, title: 'Not saved' } })), { code: 'aborted' });
});
const originalRequest = input(); let receipt;
await check('publication and lost-response replay count once', async () => {
  receipt = await call(originalRequest);
  assert.deepEqual(await call(originalRequest), receipt);
  assert.equal((await db.doc(`_mini_app_publish_quotas/${uid}`).get()).data().count, 1);
  assert.equal((await db.doc(`mini_apps/${appId}`).get()).data().title, source.title);
});
let unchangedRequest;
await check('identical publication records one operation without changing source, dates or change allowance', async () => {
  unchangedRequest = input({ expectedVersion: receipt.publicationRevision });
  const before = (await db.doc(`mini_apps/${appId}`).get()).data();
  assert.deepEqual(await call(unchangedRequest), receipt);
  assert.deepEqual(await call(unchangedRequest), receipt);
  assert.deepEqual((await db.doc(`mini_apps/${appId}`).get()).data(), before);
  assert.equal((await db.doc(`_mini_app_publish_quotas/${uid}`).get()).data().count, 1);
  assert.equal((await db.doc(`_mini_app_publish_quotas/${uid}`).get()).data().operation_count, 2);
});
await check('newer versions reject stale requests and preserve original creation time', async () => {
  const before = (await db.doc(`mini_apps/${appId}`).get()).data();
  const next = { ...source, title: 'Updated saved source' }; await draft(appId, uid, next);
  await assert.rejects(call({ ...unchangedRequest, source: next }), { code: 'aborted' });
  await assert.rejects(call(input({ source: next })), { code: 'aborted' });
  receipt = await call(input({ source: next, expectedVersion: receipt.publicationRevision }));
  assert.deepEqual((await db.doc(`mini_apps/${appId}`).get()).data().created_at, before.created_at);
  await assert.rejects(call(originalRequest), { code: 'aborted' });
  await assert.rejects(call(unchangedRequest), { code: 'aborted' });
});
await check('replaying after unpublish cannot recreate a snapshot', async () => {
  await db.doc(`mini_apps/${appId}`).delete();
  await assert.rejects(call(originalRequest), { code: 'aborted' });
  await assert.rejects(call({ ...unchangedRequest, expectedVersion: null }), { code: 'aborted' });
  assert.equal((await db.doc(`mini_apps/${appId}`).get()).exists, false);
  await draft(appId);
});
await check('active and malformed moderation holds block publication', async () => {
  for (const hold of [{ active: false }, { version: 1, app_id: appId, owner_uid: uid, active: true }]) {
    await db.doc(`_mini_app_moderation/${appId}`).set(hold);
    await assert.rejects(call(input()), { code: 'permission-denied' });
  }
  await db.doc(`_mini_app_moderation/${appId}`).set({ version: 1, app_id: appId, owner_uid: uid, active: false });
  receipt = await call(input());
});
await check('concurrent changes cannot exceed daily limit', async () => {
  await db.doc(`_mini_app_publish_quotas/${uid}`).update({ count: 99, operation_count: 99 });
  const ids = [`${uid}-race-a`, `${uid}-race-b`]; await Promise.all(ids.map(id => draft(id)));
  const results = await Promise.allSettled(ids.map(id => call(input({ appId: id }))));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.code, 'resource-exhausted');
  assert.equal((await db.doc(`_mini_app_publish_quotas/${uid}`).get()).data().count, 100);
});
await check('malformed quota fails closed and expired window resets', async () => {
  const id = `${uid}-window`; await draft(id);
  await db.doc(`_mini_app_publish_quotas/${uid}`).update({ count: -1 });
  await assert.rejects(call(input({ appId: id })), { code: 'failed-precondition' });
  await db.doc(`_mini_app_publish_quotas/${uid}`).update({ count: 100, window_started_at_ms: Date.now() - 86400001 });
  await call(input({ appId: id }));
  assert.equal((await db.doc(`_mini_app_publish_quotas/${uid}`).get()).data().count, 1);
});
await check('concurrent first publications respect existing live-app limit', async () => {
  const owner = `${uid}-live`; const batch = db.batch();
  for (let i = 0; i < 99; i++) batch.set(db.doc(`mini_apps/${owner}-${i}`), { ...source, owner_id: owner, status: 'published' });
  await batch.commit();
  const ids = [`${owner}-a`, `${owner}-b`]; await Promise.all(ids.map(id => draft(id, owner)));
  const results = await Promise.allSettled(ids.map(id => runMiniAppPublish(db, owner, input({ expectedOwnerUid: owner, appId: id }))));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.code, 'resource-exhausted');
});
await check('concurrent unchanged requests share the last operation slot, and matching retries remain free', async () => {
  const id = `${uid}-operations`; await draft(id);
  const first = await call(input({ appId: id }));
  await db.doc(`_mini_app_publish_quotas/${uid}`).update({ count: 100, operation_count: 199 });
  const requests = ['a', 'b'].map(suffix => input({ appId: id, expectedVersion: first.publicationRevision, requestId: `unchanged-race-request-${suffix}` }));
  const results = await Promise.allSettled(requests.map(call));
  const winner = results.findIndex(result => result.status === 'fulfilled');
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.code, 'resource-exhausted');
  const quota = (await db.doc(`_mini_app_publish_quotas/${uid}`).get()).data();
  assert.equal(quota.count, 100); assert.equal(quota.operation_count, 200);
  assert.deepEqual(await call(requests[winner]), first);
  assert.deepEqual((await db.doc(`_mini_app_publish_quotas/${uid}`).get()).data(), quota);
  await db.doc(`_mini_app_publish_quotas/${uid}`).update({ window_started_at_ms: Date.now() - 86400001 });
  assert.deepEqual(await call(requests[1 - winner]), first);
  const reset = (await db.doc(`_mini_app_publish_quotas/${uid}`).get()).data();
  assert.equal(reset.count, 0); assert.equal(reset.operation_count, 1);
});
await check('legacy quota rows migrate and malformed operation counters reject new requests', async () => {
  const id = `${uid}-legacy-quota`; await draft(id);
  await db.doc(`_mini_app_publish_quotas/${uid}`).set({ version: 1, owner_uid: uid, count: 2, revision: 2, window_started_at_ms: Date.now() });
  const first = await call(input({ appId: id }));
  assert.equal((await db.doc(`_mini_app_publish_quotas/${uid}`).get()).data().operation_count, 3);
  for (const invalid of [-1, 2, 3.5, '4', Number.MAX_SAFE_INTEGER + 1]) {
    await db.doc(`_mini_app_publish_quotas/${uid}`).update({ operation_count: invalid });
    await assert.rejects(call(input({ appId: id, expectedVersion: first.publicationRevision })), { code: 'failed-precondition' });
  }
});
console.log(`Mini-app publishing: ${checks} backend checks passed`);
await db.terminate();
