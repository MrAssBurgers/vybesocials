import assert from 'node:assert/strict';
const projectId = process.env.GCLOUD_PROJECT;
assert.match(projectId || '', /^demo-[a-z0-9-]+$/);
assert.notEqual(projectId, 'demo-vybe-preview');
assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):\d+$/);
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId });
const { db } = await import('../functions/lib/_shared/admin.js');
const { startPartnerDevice, exchangePartnerDevice } = await import('../functions/lib/_shared/gamePartnerCore.js');
const { approveGamePartnerLink, getGamePartnerLink, revokeGamePartnerConnection } = await import('../functions/lib/gamePartnerAuth.js');
const { handleGamePartnerRequest } = await import('../functions/lib/gamePartnerApi.js');
const { hashGameValue } = await import('../functions/lib/_shared/gameCaptureCore.js');
const clientId = 'feed-test-mod', uid = 'partner-feed-user', profileId = 'partner-feed-profile';
const scopes = ['capture:write', 'capture:status', 'feed:read_public'];
const call = data => ({ data, auth: { uid, token: {} }, rawRequest: {} });
let checks = 0;
const check = async (name, fn) => { await fn(); checks++; console.log(`PASS ${name}`); };
async function exchange(device) {
  await db.doc(`game_partner_devices/${hashGameValue(device.deviceCode)}`).update({ next_poll_at_ms: Date.now() - 1 });
  return exchangePartnerDevice(clientId, device.deviceCode, 'feed-fixture');
}
async function link(requestedScopes = scopes) {
  const device = await startPartnerDevice(clientId, 'feed-fixture', requestedScopes);
  await approveGamePartnerLink.run(call({ userCode: device.userCode, approvedScopes: requestedScopes }));
  return exchange(device);
}
async function http(access, query = {}) {
  let status, data; const headers = {};
  const response = { set(values) { Object.assign(headers, values); return this; }, status(value) { status = value; return this; }, json(value) { data = value; }, end() {} };
  await handleGamePartnerRequest({ path: '/v1/feed', method: 'GET', query, ip: 'feed-fixture', get: name => name === 'authorization' && access ? `Bearer ${access.accessToken}` : undefined }, response);
  return { status, data, headers };
}
try {
  const reset = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' }); assert.ok(reset.ok);
  const game = db.doc(`game_integrations/${clientId}`);
  await game.set({ enabled: true, partner_enabled: true, publisher_verified: true, display_name: 'Feed QA Mod', publisher_name: 'Local QA' });
  await db.doc(`profiles/${profileId}`).set({ user_id: uid, username: 'feed-player', is_private: false });
  await db.doc(`user_auth_index/${uid}`).set({ profile_id: profileId });
  await check('feed scope needs reviewed registry capability before issuing a code', async () => {
    await assert.rejects(startPartnerDevice(clientId, 'feed-fixture', scopes), { code: 'access_denied' });
    await game.update({ public_feed_enabled: true });
  });
  const device = await startPartnerDevice(clientId, 'feed-fixture', scopes);
  await check('feed permission is visible and old or partial consent cannot approve it', async () => {
    assert.deepEqual((await getGamePartnerLink.run(call({ userCode: device.userCode }))).scopes, scopes);
    await assert.rejects(approveGamePartnerLink.run(call({ userCode: device.userCode })), { code: 'invalid-argument' });
    await assert.rejects(approveGamePartnerLink.run(call({ userCode: device.userCode, approvedScopes: scopes.slice(0, 2) })), { code: 'invalid-argument' });
    await game.update({ public_feed_enabled: false });
    await assert.rejects(approveGamePartnerLink.run(call({ userCode: device.userCode, approvedScopes: scopes })), { code: 'failed-precondition' });
    await game.update({ public_feed_enabled: true });
    await approveGamePartnerLink.run(call({ userCode: device.userCode, approvedScopes: scopes }));
  });
  await check('capability is rechecked at token exchange', async () => {
    await game.update({ public_feed_enabled: false });
    await assert.rejects(exchange(device), { code: 'access_denied' });
    await game.update({ public_feed_enabled: true });
  });
  const access = await exchange(device);
  const base = { author_id: profileId, type: 'post', caption: 'Public synthetic moment', visibility: 'public', age_rating: 'safe', created_at: '2026-10-04T12:00:00.000Z' };
  await Promise.all(Array.from({ length: 22 }, (_, i) => db.doc(`posts/partner-feed-${i}`).set(base)));
  await db.doc('posts/partner-private').set({ ...base, visibility: 'only_me' });
  await db.doc('posts/partner-unrated').set({ ...base, age_rating: 'unrated' });
  let first;
  await check('HTTP feed returns only public safe posts and strips viewer identifiers/signals', async () => {
    first = await http(access); assert.equal(first.status, 200); assert.ok(first.data.posts.length > 0); assert.ok(first.data.nextCursor);
    assert.equal(first.headers['Cache-Control'], 'private, no-store');
    assert.equal(first.data.connectionId, access.connectionId);
    assert.equal('ownerUid' in first.data, false); assert.equal('viewerProfileId' in first.data, false);
    for (const post of first.data.posts) {
      assert.ok(post.id.startsWith('partner-feed-')); assert.equal(post.ageRating, 'safe');
      assert.equal('reactionType' in post, false); assert.equal('isBookmarked' in post, false);
    }
    assert.equal((await http(access, { cursor: first.data.nextCursor })).status, 200);
    assert.equal((await http(access, { feed: 'following' })).status, 400);
    assert.equal((await http(access, { cursor: ['a'.repeat(48)] })).status, 400);
  });
  await check('capture-only connections and unauthenticated callers cannot browse', async () => {
    const captureOnly = await link(scopes.slice(0, 2));
    assert.equal((await http(captureOnly)).status, 403);
    assert.equal((await http()).status, 401);
  });
  await check('another connection cannot reuse a feed cursor', async () => {
    const another = await link();
    const result = await http(another, { cursor: first.data.nextCursor });
    assert.equal(result.status, 409); assert.equal(result.data.error, 'feed_changed');
  });
  await check('disabling reviewed capability and revoking the connection stop access', async () => {
    await game.update({ public_feed_enabled: false }); assert.equal((await http(access)).status, 403);
    await game.update({ public_feed_enabled: true });
    await revokeGamePartnerConnection.run(call({ connectionId: access.connectionId }));
    assert.equal((await http(access)).status, 401);
    assert.equal((await http(access, { cursor: first.data.nextCursor })).status, 401);
  });
  console.log(`Partner public feed: ${checks} grouped checks passed`);
} finally { await db.terminate(); }
