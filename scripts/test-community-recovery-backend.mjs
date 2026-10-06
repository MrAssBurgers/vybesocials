import assert from 'node:assert/strict';

const projectId = process.env.GCLOUD_PROJECT;
assert.match(projectId || '', /^demo-[a-z0-9-]+$/);
assert.notEqual(projectId, 'demo-vybe-preview');
assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):\d+$/);
assert.notEqual(process.env.FIRESTORE_EMULATOR_HOST.split(':')[1], '8280');
const { db } = await import('../functions/lib/_shared/admin.js');
const { communityCreate, communityJoin, communityInvite, communityManage, communitySendMessage } = await import('../functions/lib/community.js');
const call = (fn, uid, data) => fn.run({ auth: uid ? { uid, token: {} } : undefined, data });
let checks = 0;
const check = async (name, run) => { await run(); checks++; console.log(`PASS ${name}`); };
const owner = 'recovery-owner', member = 'recovery-member', outsider = 'recovery-outsider';
try {
  const reset = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' });
  assert.ok(reset.ok);
  for (const uid of [owner, member, outsider]) {
    await db.doc(`profiles/profile-${uid}`).set({ user_id: uid, username: uid });
    await db.doc(`user_auth_index/${uid}`).set({ profile_id: `profile-${uid}` });
  }
  await check('every hub callable rejects guests', async () => {
    for (const fn of [communityCreate, communityJoin, communityInvite, communityManage, communitySendMessage]) await assert.rejects(call(fn, null, {}), { code: 'unauthenticated' });
  });
  const legacy = 'legacy-hub';
  await db.doc(`servers/${legacy}`).set({ owner_id: `profile-${owner}`, name: 'Retained hub', is_public: false, member_count: 12 });
  await db.doc(`channels/legacy-room`).set({ server_id: legacy, type: 'text', is_private: false, position: 0 });
  await db.doc(`channel_messages/retained-message`).set({ channel_id: 'legacy-room', content: 'Retained synthetic history', created_at: '2026-10-01T00:00:00Z' });
  await db.doc(`server_members/${legacy}_${member}`).set({ server_id: legacy, user_id: member, role: 'admin' });
  await check('existing owner can find their original hub; legacy mutable member roles do not grant access', async () => {
    const result = await call(communityManage, owner, { action: 'listMine' });
    assert.equal(result.servers[0].id, legacy); assert.equal(result.servers[0].requiresRecovery, true);
    assert.deepEqual((await call(communityManage, member, { action: 'listMine' })).servers, []);
    await assert.rejects(call(communityManage, member, { action: 'listChannels', serverId: legacy }), { code: 'permission-denied' });
  });
  await check('owner recovery preserves rooms and history and rejects outsiders', async () => {
    await assert.rejects(call(communityManage, outsider, { action: 'recoverOwner', serverId: legacy }), { code: 'permission-denied' });
    await call(communityManage, owner, { action: 'recoverOwner', serverId: legacy });
    assert.equal((await db.doc('channel_messages/retained-message').get()).data().content, 'Retained synthetic history');
    assert.equal((await db.collection('channels').where('server_id', '==', legacy).get()).size, 1);
    assert.equal((await call(communityManage, owner, { action: 'listMine' })).servers[0].requiresRecovery, false);
  });
  let publicHub;
  await check('concurrent creation retries create one hub and its default rooms', async () => {
    const input = { name: 'Synthetic public hub', isPublic: true, requestId: 'fixture-create-retry' };
    const results = await Promise.all([call(communityCreate, owner, input), call(communityCreate, owner, input)]);
    assert.equal(results[0].server.id, results[1].server.id); publicHub = results[0].server;
    assert.equal((await db.collection('channels').where('server_id', '==', publicHub.id).get()).size, 5);
    await assert.rejects(call(communityCreate, owner, { ...input, name: 'Changed' }), { code: 'already-exists' });
  });
  await check('public rejoin is idempotent and private join requires a current invitation', async () => {
    await call(communityJoin, member, { serverId: publicHub.id });
    assert.equal((await call(communityJoin, member, { serverId: publicHub.id })).alreadyMember, true);
    assert.equal((await db.doc(`servers/${publicHub.id}`).get()).data().member_count, 2);
    await assert.rejects(call(communityJoin, member, { serverId: legacy }), { code: 'not-found' });
    const invite = await call(communityInvite, owner, { action: 'regenerate', serverId: legacy });
    await call(communityJoin, member, { inviteCode: invite.inviteCode });
    assert.equal((await db.doc(`community_admissions/${member}/grants/${legacy}`).get()).data().role, 'member');
  });
  await check('checked message retry preserves one original message and rejects changed content', async () => {
    const input = { channelId: 'legacy-room', content: 'Synthetic message', clientMessageId: 'retry-message' };
    const first = await call(communitySendMessage, member, input);
    assert.deepEqual(await call(communitySendMessage, member, input), first);
    await assert.rejects(call(communitySendMessage, member, { ...input, content: 'Changed' }), { code: 'already-exists' });
    await assert.rejects(call(communitySendMessage, outsider, input), { code: 'permission-denied' });
  });
  await check('leaving revokes subsequent channel access and sends', async () => {
    await call(communityManage, member, { action: 'leave', serverId: legacy });
    await assert.rejects(call(communityManage, member, { action: 'listChannels', serverId: legacy }), { code: 'permission-denied' });
    await assert.rejects(call(communitySendMessage, member, { channelId: 'legacy-room', content: 'After leave' }), { code: 'permission-denied' });
    assert.equal((await db.doc('channel_messages/retained-message').get()).exists, true);
  });
  console.log(`Community recovery backend: ${checks} groups passed (isolated Firestore; no production writes)`);
} finally { await db.terminate(); }
