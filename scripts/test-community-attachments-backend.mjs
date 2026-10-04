import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const projectId = process.env.GCLOUD_PROJECT;
assert.match(projectId || '', /^demo-[a-z0-9-]+$/);
assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):\d+$/);
assert.match(process.env.FIREBASE_STORAGE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):\d+$/);
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId, storageBucket: `${projectId}.appspot.com` });
const { db, auth } = await import('../functions/lib/_shared/admin.js');
const { communityAttachment, handleCommunityAttachmentBytes } = await import('../functions/lib/communityAttachment.js');
const { readCommunityAttachment, communityByteRange, uploadCommunityAttachment } = await import('../functions/lib/_shared/communityAttachments.js');
const { communitySendMessage } = await import('../functions/lib/community.js');
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { getStorage } = require('firebase-admin/storage'); const bucket = getStorage().bucket();
const alice = 'attachment-qa-alice', bob = 'attachment-qa-bob', serverId = 'attachment-qa-server', channelId = 'attachment-qa-channel';
const bytes = Buffer.from('synthetic-private-attachment'); let checks = 0, serial = 0;
const call = (uid, data) => communityAttachment.run({ auth: uid ? { uid, token: {} } : undefined, data });
const reserve = (patch = {}, uid = alice) => call(uid, { action: 'reserve', expectedOwnerUid: uid, requestId: `attachment-fixture-${++serial}`, channelId, byteSize: bytes.length, contentType: 'image/png', content: 'Synthetic private attachment', ...patch });
const finish = (record, uid = alice) => call(uid, { action: 'finalize', expectedOwnerUid: uid, assetId: record.assetId });
const upload = (record, body = bytes, type = record.contentType) => uploadCommunityAttachment(record.ownerUid, record.assetId, body, type);
const proof = async record => (await db.doc(`_community_attachments/${record.assetId}`).get()).data();
const grant = (uid, role = 'member') => db.doc(`community_admissions/${uid}/grants/${serverId}`).set({ auth_uid: uid, server_id: serverId, user_id: `profile-${uid}`, active: true, role });
const check = async (name, run) => { await run(); checks++; console.log(`PASS ${name}`); };
let record;
try {
  const reset = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' }); assert.ok(reset.ok);
  for (const uid of [alice, bob, 'attachment-qa-stranger']) { await db.doc(`profiles/profile-${uid}`).set({ user_id: uid, username: uid }); await db.doc(`user_auth_index/${uid}`).set({ profile_id: `profile-${uid}` }); }
  await db.doc(`servers/${serverId}`).set({ owner_id: `profile-${alice}`, is_public: false, authority_version: 2 });
  await db.doc(`channels/${channelId}`).set({ server_id: serverId, type: 'text', is_private: false }); await grant(bob);
  await check('unauthenticated, mismatched account and nonmembers cannot reserve', async () => {
    await assert.rejects(reserve({}, null), { code: 'unauthenticated' });
    await assert.rejects(reserve({ expectedOwnerUid: bob }), { code: 'failed-precondition' });
    await assert.rejects(reserve({}, 'attachment-qa-stranger'), { code: 'permission-denied' });
  });
  await check('strict UID/profile collision cannot borrow community ownership', async () => {
    await db.doc(`profiles/${alice}`).set({ user_id: bob });
    await assert.rejects(reserve(), { code: 'failed-precondition' }); await db.doc(`profiles/${alice}`).delete();
  });
  await check('same request reserves once and changed inputs cannot reuse it', async () => {
    const requestId = 'attachment-concurrent-reserve';
    const results = await Promise.all([reserve({ requestId }), reserve({ requestId }), reserve({ requestId })]); record = results[0];
    assert.equal(new Set(results.map(row => row.assetId)).size, 1); assert.equal((await db.doc(`_community_attachment_limits/${alice}`).get()).data().count, 1);
    await assert.rejects(reserve({ requestId, content: 'Changed' }), { code: 'already-exists' });
    assert.equal((await finish(record)).uploadRequired, true); assert.equal((await db.doc(`channel_messages/${record.messageId}`).get()).exists, false);
  });
  await check('concurrent identical uploads select one token-free immutable candidate', async () => {
    const uploaded = await Promise.all([upload(record), upload(record), upload(record)]);
    assert.equal(new Set(uploaded.map(value => value.objectPath)).size, 1); assert.ok(uploaded.every(value => value.status === 'uploaded'));
    const stored = await proof(record), [metadata] = await bucket.file(stored.object_path).getMetadata();
    assert.equal(stored.status, 'uploaded'); assert.match(stored.object_path, /\/sealed_[a-f0-9]{32}$/);
    assert.equal(String(metadata.generation), stored.generation); assert.ok(!metadata.metadata?.firebaseStorageDownloadTokens); assert.match(stored.content_sha256, /^[a-f0-9]{64}$/);
    const tokenUrl = `http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST}/v0/b/${bucket.name}/o/${encodeURIComponent(stored.object_path)}?alt=media&token=arbitrary-token`;
    assert.notEqual((await fetch(tokenUrl)).status, 200);
    assert.equal((await upload(record)).objectPath, stored.object_path);
    const changed = Buffer.from(bytes); changed[0] = changed[0] ^ 1;
    await assert.rejects(upload(record, changed), { code: 'already-exists' });
    await assert.rejects(upload(record, bytes, 'video/mp4'), { code: 'already-exists' });
    assert.equal((await db.doc(`channel_messages/${record.messageId}`).get()).exists, false);
  });
  await check('concurrent finalize publishes one selected generation with no media URL', async () => {
    const results = await Promise.all([finish(record), finish(record)]); assert.equal(results[0].message.id, results[1].message.id);
    const stored = await proof(record); assert.equal(stored.status, 'ready');
    assert.equal(results[0].message.media_url, null); assert.equal(results[0].message.attachment_id, record.assetId);
  });
  await check('competing changed payloads cannot replace the first selected bytes', async () => {
    const pending = await reserve(), changed = Buffer.from(bytes); changed[0] ^= 1;
    const results = await Promise.allSettled([upload(pending), upload(pending, changed)]);
    assert.equal(results.filter(value => value.status === 'fulfilled').length, 1);
    assert.equal(results.find(value => value.status === 'rejected').reason.code, 'already-exists');
    const winner = results[0].status === 'fulfilled' ? bytes : changed;
    await finish(pending); assert.deepEqual((await readCommunityAttachment(bob, pending.messageId)).bytes, winner);
    assert.equal((await bucket.getFiles({ prefix: `community-private/${alice}/${pending.assetId}/` }))[0].length, 1);
  });
  await check('current admitted member reads exact full and ranged bytes', async () => {
    assert.deepEqual((await readCommunityAttachment(bob, record.messageId)).bytes, bytes);
    assert.deepEqual((await readCommunityAttachment(bob, record.messageId, 'bytes=2-7')).bytes, bytes.subarray(2, 8));
    assert.deepEqual((await readCommunityAttachment(bob, record.messageId, 'bytes=-3')).bytes, bytes.subarray(bytes.length - 3));
    assert.equal((await readCommunityAttachment(bob, record.messageId, undefined, true)).bytes, null);
    for (const range of ['bytes=0-1,3-5', 'bytes=9-2', 'bytes=-0', 'bytes=999999-', 'bytes=1e2-200', 'items=0-1']) assert.throws(() => communityByteRange(range, bytes.length), { code: 'out-of-range' });
  });
  await check('membership, channel permission and deletion revoke subsequent reads', async () => {
    await db.doc(`community_admissions/${bob}/grants/${serverId}`).delete(); await assert.rejects(readCommunityAttachment(bob, record.messageId), { code: 'permission-denied' }); await grant(bob);
    await db.doc(`channel_permissions/${channelId}_member`).set({ channel_id: channelId, role: 'member', can_view: false });
    await assert.rejects(readCommunityAttachment(bob, record.messageId), { code: 'permission-denied' }); await db.doc(`channel_permissions/${channelId}_member`).delete();
    await db.doc(`channels/${channelId}`).update({ deleted_at: new Date().toISOString() }); await assert.rejects(readCommunityAttachment(bob, record.messageId), { code: 'not-found' });
    await db.doc(`channels/${channelId}`).update({ deleted_at: null });
  });
  await check('forged message/proof tuple and changed object generation never serve bytes', async () => {
    const messageRef = db.doc(`channel_messages/${record.messageId}`); await messageRef.update({ author_id: bob }); await assert.rejects(readCommunityAttachment(alice, record.messageId)); await messageRef.update({ author_id: alice });
    const other = await reserve(); await upload(other); await finish(other);
    await bucket.file((await proof(other)).object_path).save(Buffer.from('new-generation'), { resumable: false, metadata: { contentType: 'image/png' } }); await assert.rejects(readCommunityAttachment(bob, other.messageId));
  });
  await check('revoked permission before upload never selects bytes', async () => {
    const pending = await reserve({}, bob); await db.doc(`community_admissions/${bob}/grants/${serverId}`).delete();
    await assert.rejects(upload(pending), { code: 'permission-denied' }); assert.equal((await proof(pending)).status, 'uploading'); await grant(bob);
  });
  await check('removal during the object upload refuses selection and removes the unselected candidate', async () => {
    const pending = await reserve({}, bob), prototype = Object.getPrototypeOf(bucket.file('unused'));
    const original = prototype.save;
    prototype.save = async function (...args) {
      const result = await original.apply(this, args);
      if (this.name.startsWith(`community-private/${bob}/${pending.assetId}/`)) await db.doc(`community_admissions/${bob}/grants/${serverId}`).delete();
      return result;
    };
    try { await assert.rejects(upload(pending), { code: 'permission-denied' }); }
    finally { prototype.save = original; await grant(bob); }
    assert.equal((await proof(pending)).status, 'uploading');
    assert.equal((await bucket.getFiles({ prefix: `community-private/${bob}/${pending.assetId}/` }))[0].length, 0);
  });
  await check('a lost commit acknowledgement retains the selected object and recovers without another upload', async () => {
    const pending = await reserve(), original = db.runTransaction; let injected = false;
    db.runTransaction = async function (callback, ...options) {
      const value = await original.call(this, callback, ...options);
      if (!injected && value?.asset_id === pending.assetId && value?.status === 'uploaded') {
        injected = true; throw new Error('Synthetic lost commit acknowledgement');
      }
      return value;
    };
    try { await assert.rejects(upload(pending), /lost commit acknowledgement/); }
    finally { db.runTransaction = original; }
    const stored = await proof(pending); assert.equal(stored.status, 'uploaded');
    assert.equal((await bucket.getFiles({ prefix: `community-private/${alice}/${pending.assetId}/` }))[0].length, 1);
    assert.equal((await upload(pending)).objectPath, stored.object_path); await finish(pending);
    assert.deepEqual((await readCommunityAttachment(bob, pending.messageId)).bytes, bytes);
  });
  await check('a candidate with unsafe metadata is removed before any selection or message', async () => {
    const pending = await reserve(), prototype = Object.getPrototypeOf(bucket.file('unused')), original = prototype.save;
    prototype.save = async function (...args) {
      const result = await original.apply(this, args);
      if (this.name.startsWith(`community-private/${alice}/${pending.assetId}/`)) await this.setMetadata({ contentType: 'text/html' });
      return result;
    };
    try { await assert.rejects(upload(pending), { code: 'failed-precondition' }); }
    finally { prototype.save = original; }
    assert.equal((await proof(pending)).status, 'uploading');
    assert.equal((await bucket.getFiles({ prefix: `community-private/${alice}/${pending.assetId}/` }))[0].length, 0);
    assert.equal((await db.doc(`channel_messages/${pending.messageId}`).get()).exists, false);
  });
  await check('removal while bytes are being read prevents delivering the completed buffer', async () => {
    const prototype = Object.getPrototypeOf(bucket.file('unused')), original = prototype.download;
    prototype.download = async function (...args) {
      const result = await original.apply(this, args);
      await db.doc(`community_admissions/${bob}/grants/${serverId}`).delete(); return result;
    };
    try { await assert.rejects(readCommunityAttachment(bob, record.messageId), { code: 'permission-denied' }); }
    finally { prototype.download = original; await grant(bob); }
  });
  await check('removal between upload and finalize refuses publication', async () => {
    const pending = await reserve({}, bob); await upload(pending); await db.doc(`community_admissions/${bob}/grants/${serverId}`).delete();
    await assert.rejects(finish(pending, bob), { code: 'permission-denied' }); assert.equal((await db.doc(`channel_messages/${pending.messageId}`).get()).exists, false); await grant(bob);
  });
  await check('expired reservation, wrong metadata, foreign finalize and invalid MIME are denied', async () => {
    const pending = await reserve(); await upload(pending); await db.doc(`_community_attachments/${pending.assetId}`).update({ expires_at_ms: Date.now() - 1 }); await assert.rejects(finish(pending));
    const wrong = await reserve(); await upload(wrong); await bucket.file((await proof(wrong)).object_path).setMetadata({ contentType: 'text/html' }); await assert.rejects(finish(wrong));
    await assert.rejects(finish(record, bob)); await assert.rejects(reserve({ contentType: 'image/svg+xml' }), { code: 'invalid-argument' }); await assert.rejects(reserve({ byteSize: 20 * 1024 * 1024 + 1 }), { code: 'invalid-argument' });
  });
  await check('retained publication proof prevents resurrection after soft or hard deletion', async () => {
    await db.doc(`channel_messages/${record.messageId}`).update({ is_deleted: true }); await assert.rejects(finish(record), { code: 'failed-precondition' }); await assert.rejects(readCommunityAttachment(bob, record.messageId));
    await db.doc(`channel_messages/${record.messageId}`).delete(); await assert.rejects(finish(record), { code: 'failed-precondition' }); assert.equal((await db.doc(`_community_attachments/${record.assetId}`).get()).data().status, 'ready');
  });
  await check('legacy URL sender path refuses new shared attachments', async () => {
    await assert.rejects(communitySendMessage.run({ auth: { uid: alice, token: {} }, data: { channelId, content: 'Legacy', mediaUrl: `gs://${bucket.name}/media/${alice}/photo.png`, mediaType: 'image' } }), { code: 'failed-precondition' });
  });
  await check('HTTP transport requires headers, rejects query credentials and sends private response headers', async () => {
    const live = await reserve(); await upload(live); await finish(live);
    const original = auth.verifyIdToken; auth.verifyIdToken = async token => { assert.equal(token, 'synthetic-token'); return { uid: bob }; };
    const http = async (patch = {}) => {
      const result = { headers: {}, statusCode: 0, body: null };
      const headers = { authorization: 'Bearer synthetic-token', 'x-vybe-owner': bob, range: 'bytes=0-2', ...patch.headers };
      await handleCommunityAttachmentBytes({ method: 'GET', path: `/${live.messageId}`, query: {}, ...patch, get: name => headers[name.toLowerCase()] },
        { set: (values, value) => typeof values === 'string' ? result.headers[values] = value : Object.assign(result.headers, values), status: status => { result.statusCode = status; return { json: body => { result.body = body; }, end: body => { result.body = body; } }; } }); return result;
    };
    try {
      const good = await http(); assert.equal(good.statusCode, 206); assert.deepEqual(good.body, bytes.subarray(0, 3)); assert.equal(good.headers['Cache-Control'], 'private, no-store'); assert.equal(good.headers['X-Content-Type-Options'], 'nosniff');
      assert.equal((await http({ headers: { authorization: '' } })).statusCode, 401); assert.equal((await http({ headers: { 'x-vybe-owner': alice } })).statusCode, 403);
      const pending = await reserve({}, bob);
      const put = await http({ method: 'PUT', path: `/uploads/${pending.assetId}`, rawBody: bytes, headers: { 'content-type': 'image/png' } });
      assert.equal(put.statusCode, 200); assert.equal(put.body.status, 'uploaded'); assert.equal((await proof(pending)).object_path, put.body.objectPath);
      assert.equal((await http({ method: 'PUT', path: `/uploads/${pending.assetId}`, rawBody: Buffer.from('wrong'), headers: { 'content-type': 'image/png' } })).statusCode, 409);
      assert.equal((await http({ method: 'PUT', path: `/uploads/${pending.assetId}`, rawBody: Buffer.alloc(20 * 1024 * 1024 + 1), headers: { 'content-type': 'image/png' } })).statusCode, 400);
      assert.equal((await http({ method: 'PUT', path: `/uploads/${pending.assetId}`, rawBody: bytes, headers: { 'content-type': 'image/svg+xml' } })).statusCode, 400);
      assert.equal((await http({ query: { token: 'forbidden' } })).statusCode, 400); assert.equal((await http({ headers: { range: 'bytes=0-1,4-5' } })).statusCode, 416);
    } finally { auth.verifyIdToken = original; }
  });
  await check('daily quota blocks new reservations without consuming a retained request again', async () => {
    await db.doc(`_community_attachment_limits/${alice}`).update({ count: 30 }); await assert.rejects(reserve(), { code: 'resource-exhausted' });
    assert.equal((await reserve({ requestId: 'attachment-concurrent-reserve' })).assetId, record.assetId);
  });
  console.log(`Community attachment backend: ${checks} grouped checks passed.`);
} finally { await db.terminate(); }
