import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { seedPostPublication } from './helpers/post-publication-fixture.mjs';
const projectId = process.env.GCLOUD_PROJECT;
assert.match(projectId || '', /^demo-[a-z0-9-]+$/);
assert.notEqual(projectId, 'demo-vybe-preview', 'Do not run destructive QA in the retained interactive preview');
assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):\d+$/);
assert.match(process.env.FIREBASE_STORAGE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):\d+$/);
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId, storageBucket: `${projectId}.appspot.com` });
const { db } = await import('../functions/lib/_shared/admin.js');
const { startPartnerDevice, exchangePartnerDevice } = await import('../functions/lib/_shared/gamePartnerCore.js');
const { approveGamePartnerLink, getGamePartnerLink } = await import('../functions/lib/gamePartnerAuth.js');
const { listPartnerCaptures, readPartnerCapturePreview, checkPartnerCapturePreview } = await import('../functions/lib/_shared/gamePartnerPreview.js');
const { createPartnerCapture, putPartnerChunk, finishPartnerCapture } = await import('../functions/lib/_shared/gamePartnerUploads.js');
const { hashGameValue } = await import('../functions/lib/_shared/gameCaptureCore.js');
const { handleGamePartnerRequest } = await import('../functions/lib/gamePartnerApi.js');
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { getStorage } = require('firebase-admin/storage'); const bucket = getStorage().bucket();
const clientId = 'gallery-test-mod', uid = 'gallery-test-user';
const scopes = ['capture:write', 'capture:status', 'capture:preview'];
const bytes = Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
let checks = 0;
const check = async (name, action) => { await action(); checks++; console.log(`PASS ${name}`); };
const request = (data, owner = uid) => ({ data, auth: { uid: owner, token: {} }, rawRequest: {} });
async function link(preview = true, owner = uid) {
  const device = await startPartnerDevice(clientId, 'fixture', preview ? scopes : undefined);
  const data = { userCode: device.userCode, ...(preview ? { approvedScopes: scopes } : {}) };
  const connection = await approveGamePartnerLink.run(request(data, owner));
  await db.doc(`game_partner_devices/${hashGameValue(device.deviceCode)}`).update({ next_poll_at_ms: Date.now() - 1 });
  return { ...await exchangePartnerDevice(clientId, device.deviceCode, 'fixture'), connection, device };
}
async function http(access, path, method = 'GET', query = {}) {
  const headers = {}; let status, data;
  const response = { set(name, value) { typeof name === 'string' ? headers[name] = value : Object.assign(headers, name); return this; }, status(value) { status = value; return this; }, json(value) { data = value; }, send(value) { data = value; }, end() {} };
  await handleGamePartnerRequest({ path, method, query, ip: 'fixture', get: name => name.toLowerCase() === 'authorization' && access ? `Bearer ${access.accessToken}` : undefined }, response);
  return { status, data, headers };
}
try {
  const reset = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' }); assert.ok(reset.ok);
  await db.doc(`profiles/${uid}`).set({ user_id: uid, username: uid });
  await db.doc(`game_integrations/${clientId}`).set({ enabled: true, partner_enabled: true, publisher_verified: true, display_name: 'Gallery QA Mod', publisher_name: 'Local QA' });
  await check('media scope is visible and cannot be approved by an old consent client', async () => {
    const device = await startPartnerDevice(clientId, 'fixture', scopes);
    assert.deepEqual((await getGamePartnerLink.run(request({ userCode: device.userCode }))).scopes, scopes);
    await assert.rejects(approveGamePartnerLink.run(request({ userCode: device.userCode })), { code: 'invalid-argument' });
  });
  const access = await link();
  const capture = await createPartnerCapture(access.accessToken, { idempotencyKey: 'gallery-verified-upload', contentType: 'image/png', byteSize: bytes.length, contentSha256: hashGameValue(bytes), caption: 'A private moment', tags: ['mod'] });
  await putPartnerChunk(access.accessToken, capture.captureId, 0, bytes, hashGameValue(bytes));
  await finishPartnerCapture(access.accessToken, capture.captureId);
  const ref = db.doc(`game_captures/${capture.captureId}`), stored = (await ref.get()).data();
  await check('multi-chunk assembly and concurrent completion retain exact ordered bytes', async () => {
    const large = Buffer.alloc(8 * 1024 * 1024 + 12, 17); bytes.copy(large);
    const reserved = await createPartnerCapture(access.accessToken, { idempotencyKey: 'gallery-multiple-chunks', contentType: 'image/png', byteSize: large.length, contentSha256: hashGameValue(large), caption: 'Chunk verification', tags: [] });
    for (let index = 0; index < 2; index++) { const part = large.subarray(index * 8 * 1024 * 1024, (index + 1) * 8 * 1024 * 1024); await putPartnerChunk(access.accessToken, reserved.captureId, index, part, hashGameValue(part)); }
    const results = await Promise.all([finishPartnerCapture(access.accessToken, reserved.captureId), finishPartnerCapture(access.accessToken, reserved.captureId)]);
    assert.ok(results.every(value => value.status === 'ready'));
    const first = await readPartnerCapturePreview(access.accessToken, reserved.captureId, 0), last = await readPartnerCapturePreview(access.accessToken, reserved.captureId, 1);
    assert.deepEqual(Buffer.concat([first.bytes, last.bytes]), large); assert.equal(first.bytes.length, 8 * 1024 * 1024); assert.equal(first.sha256, last.sha256);
    await assert.rejects(readPartnerCapturePreview(access.accessToken, reserved.captureId, 2), { code: 'invalid_request' });
    await db.doc(`game_captures/${reserved.captureId}`).update({ status: 'cancelled' });
  });
  await check('actual uploaded media and gallery receipts carry no raw account or Storage path', async () => {
    const page = await listPartnerCaptures(access.accessToken); assert.equal(page.captures.length, 1); assert.equal(page.nextCursor, null);
    assert.equal(page.captures[0].captureId, capture.captureId); assert.ok(!JSON.stringify(page).includes(stored.storage_path)); assert.ok(!JSON.stringify(page).includes(uid));
    assert.deepEqual((await readPartnerCapturePreview(access.accessToken, capture.captureId)).bytes, bytes);
    const response = await http(access, `/v1/captures/${capture.captureId}/preview`); assert.equal(response.status, 200); assert.deepEqual(response.data, bytes); assert.match(response.headers['Cache-Control'], /no-store/);
    assert.equal((await http(access, `/v1/captures/${capture.captureId}/preview`, 'HEAD')).status, 204);
    assert.equal((await http(null, `/v1/captures/${capture.captureId}/preview`)).status, 401);
  });
  await check('other accounts, connections and old capture-only clients cannot read this media', async () => {
    const other = await link(true, 'gallery-other-user'), sameOwner = await link(), old = await link(false);
    for (const actor of [other, sameOwner]) { assert.deepEqual((await listPartnerCaptures(actor.accessToken)).captures, []); await assert.rejects(readPartnerCapturePreview(actor.accessToken, capture.captureId), { code: 'not_found' }); }
    await assert.rejects(readPartnerCapturePreview(old.accessToken, capture.captureId), { code: 'insufficient_scope' });
  });
  await check('bounded pagination advances through expired rows without crossing connections', async () => {
    const batch = db.batch();
    for (let i = 1; i <= 25; i++) batch.set(db.doc(`game_captures/${i.toString(16).padStart(48, '0')}`), { ...stored, status: i <= 20 ? 'expired' : 'ready' });
    await batch.commit();
    const first = await listPartnerCaptures(access.accessToken); assert.equal(first.captures.length, 0); assert.match(first.nextCursor, /^[a-f0-9]{48}$/);
    const second = await listPartnerCaptures(access.accessToken, first.nextCursor); assert.equal(second.captures.length, 6); assert.equal(second.nextCursor, null);
    await assert.rejects(listPartnerCaptures(access.accessToken, ['array-query']), /capture/i);
    assert.equal((await http(access, '/v1/captures', 'GET', { unknown: 'bad' })).status, 400);
  });
  await check('discard, expiry, publication and malformed owner binding deny preview', async () => {
    for (const patch of [{ status: 'cancelled' }, { expires_at_ms: Date.now() - 1 }, { owner_uid: 'other' }, { storage_path: 'foreign/path' }]) {
      await ref.set({ ...stored, ...patch }); await assert.rejects(checkPartnerCapturePreview(access.accessToken, capture.captureId), { code: 'not_found' });
    }
    await ref.set(stored); await seedPostPublication(db, `game_${capture.captureId}`, { game_capture_id: capture.captureId, author_id: uid }, { uid, profileId: uid });
    await assert.rejects(readPartnerCapturePreview(access.accessToken, capture.captureId), { code: 'not_found' });
    assert.equal((await listPartnerCaptures(access.accessToken, '0'.repeat(47) + 'f')).captures.find(item => item.captureId === capture.captureId).status, 'imported');
    await db.doc(`posts/game_${capture.captureId}`).delete();
  });
  await check('tampered actual Storage bytes fail checksum and missing media fails closed', async () => {
    const changed = Buffer.from(bytes); changed[11] ^= 1;
    await bucket.file(stored.storage_path).save(changed, { resumable: false, metadata: { contentType: 'image/png' } });
    await assert.rejects(readPartnerCapturePreview(access.accessToken, capture.captureId), { code: 'not_found' });
    await bucket.file(stored.storage_path).delete(); await assert.rejects(readPartnerCapturePreview(access.accessToken, capture.captureId), { code: 'not_found' });
    await bucket.file(stored.storage_path).save(bytes, { resumable: false, metadata: { contentType: 'image/png' } });
  });
  await check('revocation during actual Storage download is rechecked before delivery', async () => {
    const prototype = Object.getPrototypeOf(bucket.file(stored.storage_path)), download = prototype.download;
    prototype.download = async function (...args) { const result = await download.apply(this, args); await db.doc(`game_partner_connections/${access.connectionId}`).update({ status: 'revoked' }); return result; };
    try { await assert.rejects(readPartnerCapturePreview(access.accessToken, capture.captureId), { code: 'invalid_token' }); }
    finally { prototype.download = download; }
    await assert.rejects(listPartnerCaptures(access.accessToken), { code: 'invalid_token' });
    await assert.rejects(checkPartnerCapturePreview(access.accessToken, capture.captureId), { code: 'invalid_token' });
  });
  console.log(`Partner gallery backend: ${checks} grouped checks passed.`);
} finally { await db.terminate(); }
