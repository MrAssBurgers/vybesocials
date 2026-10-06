import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
const projectId = process.env.GCLOUD_PROJECT;
assert.equal(projectId, 'demo-vybe-space-authority');
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8387');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9297');
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId });
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { db } = await import('../functions/lib/_shared/admin.js');
const { getAuth } = require('firebase-admin/auth');
const auth = getAuth();
const { manageSpaceAuthority: run, spaceMemberId } = await import('../functions/lib/_shared/spaceAuthority.js');
const { synchronizeSpaceAudioEffect: sync } = await import('../functions/lib/_shared/spaceAudioSync.js');
const audioCalls = [];
const audioProvider = { revoke: async plan => { audioCalls.push(['revoke', plan]); }, close: async plan => { audioCalls.push(['close', plan]); } };
const prefix = randomUUID();
async function actor(label) {
  const uid = `${prefix}-${label}`, profileId = `${uid}-profile`;
  const user = await auth.createUser({ uid });
  await db.doc(`profiles/${profileId}`).set({ user_id: uid, username: label });
  await db.doc(`user_auth_index/${uid}`).set({ profile_id: profileId });
  await db.doc(`_account_profile_bindings/${uid}`).set({ version: 1, status: 'active', owner_uid: uid, profile_id: profileId, auth_created_at_ms: Date.parse(user.metadata.creationTime), revision: 'a'.repeat(48) });
  return { uid, profileId };
}
const host = await actor('host'), listener = await actor('listener'), other = await actor('other');
const input = (who, action, details = {}) => ({ action, expectedOwnerUid: who.uid, expectedProfileId: who.profileId, ...details });
const call = (who, action, details = {}) => run(db, auth, who.uid, input(who, action, details));
const change = async (who, action, details = {}) => {
  const response = await call(who, action, { requestId: randomUUID(), ...details });
  if (response.audioEffectId) await sync(db, response.audioEffectId, audioProvider);
  return response;
};
let checks = 0;
async function check(name, fn) { await fn(); checks++; console.log(`PASS ${name}`); }
await check('rejects account substitution and privileged client fields', async () => {
  await assert.rejects(run(db, auth, host.uid, input(other, 'list')), { code: 'failed-precondition' });
  await assert.rejects(change(host, 'create', { title: 'test', host_id: other.uid }), { code: 'invalid-argument' });
});
const requestId = randomUUID();
const created = await call(host, 'create', { requestId, title: 'Synthetic room' });
const spaceId = created.space.id;
await check('create atomically creates a muted host and retries without another room', async () => {
  assert.equal(created.participant.role, 'host'); assert.equal(created.participant.is_muted, true);
  assert.equal(created.space.listener_count, 0);
  assert.deepEqual(await call(host, 'create', { requestId, title: 'Synthetic room' }), created);
  await assert.rejects(call(host, 'create', { requestId, title: 'Changed' }), { code: 'already-exists' });
  assert.equal((await db.doc(`space_participants/${created.participant.id}`).get()).data().role, 'host');
});
let joined;
await check('concurrent duplicate joins increment the listener count once', async () => {
  const details = { requestId: randomUUID(), spaceId, revision: 0, role: 'listener' };
  const [a, b] = await Promise.all([call(listener, 'join', details), call(listener, 'join', details)]);
  assert.deepEqual(a, b); joined = a.participant;
  assert.equal(a.space.listener_count, 1);
  const again = await change(listener, 'join', { spaceId, revision: joined.revision });
  assert.equal(again.space.listener_count, 1); assert.equal(again.participant.revision, joined.revision);
});
await check('audio grants require active server membership and a checked account', async () => {
  const grant = await call(listener, 'audio', { spaceId }); assert.equal(grant.canPublish, false);
  const hostGrant = await call(host, 'audio', { spaceId }); assert.equal(hostGrant.canPublish, true);
  assert.notEqual(grant.roomName, `comm_${spaceId}`);
  await assert.rejects(call(other, 'audio', { spaceId }), { code: 'permission-denied' });
  await assert.rejects(change(listener, 'mute', { spaceId, revision: joined.revision, isMuted: false }), { code: 'permission-denied' });
});
await check('raised hands preserve counts and only the host promotes participants', async () => {
  const raised = await change(listener, 'hand', { spaceId, revision: joined.revision, raised: true }); joined = raised.participant;
  assert.equal(joined.role, 'requested'); assert.equal(raised.space.listener_count, 1);
  await assert.rejects(change(other, 'role', { spaceId, revision: joined.revision, participantId: joined.id, role: 'speaker' }), { code: 'permission-denied' });
  const promoted = await change(host, 'role', { spaceId, revision: joined.revision, participantId: joined.id, role: 'speaker' }); joined = promoted.participant;
  assert.equal(promoted.space.listener_count, 1); assert.equal(joined.raised_hand, false); assert.equal(joined.is_muted, true);
  assert.equal((await call(listener, 'audio', { spaceId })).canPublish, true);
});
await check('reads return bounded room/participant projections, including the caller revision', async () => {
  const read = await call(listener, 'read', { spaceId });
  assert.equal(read.participants.length, 2); assert.equal(read.participant.revision, joined.revision);
  assert.equal(read.space.title, 'Synthetic room');
  assert.equal(read.participant.binding, undefined); assert.equal(read.participant.auth_created_at_ms, undefined);
  const list = await call(host, 'list', { status: 'live' }); assert.ok(list.spaces.some(space => space.id === spaceId));
});
await check('malformed memberships and cross-room role selections cannot grant access', async () => {
  const ref = db.doc(`_space_members/${joined.id}`), original = (await ref.get()).data();
  await ref.update({ role: 'administrator' });
  await assert.rejects(call(listener, 'audio', { spaceId }), { code: 'failed-precondition' });
  await ref.set(original);
  const second = await change(other, 'create', { title: 'Other room' });
  await assert.rejects(change(host, 'role', { spaceId, participantId: second.participant.id, revision: 1, role: 'speaker' }), { code: 'permission-denied' });
});
await check('disabled room owners cannot issue new audio grants or appear in discovery', async () => {
  await auth.updateUser(host.uid, { disabled: true });
  await assert.rejects(call(listener, 'audio', { spaceId }), { code: 'permission-denied' });
  const list = await call(listener, 'list', { status: 'live' }); assert.ok(!list.spaces.some(space => space.id === spaceId));
  await auth.updateUser(host.uid, { disabled: false });
});
await check('host departure and rejoin do not change listener counts', async () => {
  const left = await change(host, 'leave', { spaceId, revision: created.participant.revision });
  assert.equal(left.space.listener_count, 1);
  const rejoined = await change(host, 'join', { spaceId, revision: left.participant.revision });
  assert.equal(rejoined.participant.role, 'host'); assert.equal(rejoined.space.listener_count, 1);
});
await check('speaker capacity is checked atomically before promotion', async () => {
  const ref = db.doc(`_space_authority/${spaceId}`); const original = (await ref.get()).data();
  await ref.update({ max_speakers: original.speaker_count });
  const fresh = await change(other, 'join', { spaceId, revision: 0 });
  await assert.rejects(change(host, 'role', { spaceId, participantId: fresh.participant.id, revision: fresh.participant.revision, role: 'speaker' }), { code: 'resource-exhausted' });
  await change(other, 'leave', { spaceId, revision: fresh.participant.revision });
  await ref.update({ max_speakers: original.max_speakers });
});
await check('failed provider confirmation retains its job and blocks new audio grants until exact retry', async () => {
  const requestId = randomUUID();
  const result = await call(host, 'role', { requestId, spaceId, participantId: joined.id, revision: joined.revision, role: 'listener' }); joined = result.participant;
  const jobRef = db.doc(`_space_audio_effects/${result.audioEffectId}`);
  await assert.rejects(sync(db, result.audioEffectId, { ...audioProvider, revoke: async () => { throw Error('Synthetic provider outage'); } }));
  assert.equal((await jobRef.get()).data().status, 'pending');
  await assert.rejects(call(listener, 'audio', { spaceId }), { code: 'unavailable' });
  const retry = await call(host, 'role', { requestId, spaceId, participantId: joined.id, revision: joined.revision - 1, role: 'listener' });
  assert.equal(retry.audioEffectId, result.audioEffectId);
  const before = audioCalls.length; await sync(db, retry.audioEffectId, audioProvider); await sync(db, retry.audioEffectId, audioProvider);
  assert.equal(audioCalls.length, before + 1); assert.equal((await jobRef.get()).data().status, 'complete');
  const grant = await call(listener, 'audio', { spaceId }); assert.equal(grant.canPublish, false);
  assert.equal(grant.notBeforeSeconds, (await jobRef.get()).data().cutoffSeconds + 1);
});
await check('late old acknowledgement never clears a newer leave or admits a premature rejoin', async () => {
  const promoted = await call(host, 'role', { requestId: randomUUID(), spaceId, participantId: joined.id, revision: joined.revision, role: 'speaker' });
  const left = await call(listener, 'leave', { requestId: randomUUID(), spaceId, revision: promoted.participant.revision });
  await sync(db, promoted.audioEffectId, audioProvider);
  assert.equal((await db.doc(`_space_members/${joined.id}`).get()).data().audio_pending, true);
  assert.equal((await db.doc(`_space_authority/${spaceId}`).get()).data().audio_pending_count, 1);
  await assert.rejects(change(listener, 'join', { spaceId, revision: left.participant.revision }), { code: 'unavailable' });
  await sync(db, left.audioEffectId, audioProvider);
  assert.equal((await db.doc(`_space_authority/${spaceId}`).get()).data().audio_pending_count, 0);
  joined = (await change(listener, 'join', { spaceId, revision: left.participant.revision })).participant;
});
await check('stale leave cannot remove a newer participation', async () => {
  const left = await change(listener, 'leave', { spaceId, revision: joined.revision });
  assert.equal(left.space.listener_count, 0);
  await assert.rejects(call(listener, 'audio', { spaceId }), { code: 'permission-denied' });
  const rejoined = await change(listener, 'join', { spaceId, revision: left.participant.revision });
  assert.equal(rejoined.participant.role, 'listener'); assert.equal(rejoined.space.listener_count, 1);
  await assert.rejects(change(listener, 'leave', { spaceId, revision: joined.revision }), { code: 'failed-precondition' });
  joined = rejoined.participant;
});
await check('raw historical host and role rows never mint audio grants', async () => {
  const legacy = `${prefix}-legacy`;
  await db.doc(`spaces/${legacy}`).set({ id: legacy, host_id: listener.uid, status: 'live' });
  await db.doc(`space_participants/${spaceMemberId(legacy, other.uid)}`).set({ space_id: legacy, user_id: other.uid, role: 'host', left_at: null });
  await assert.rejects(call(other, 'audio', { spaceId: legacy }), { code: 'not-found' });
});
await check('ended rooms reject joins and token grants; only their host can end them', async () => {
  await assert.rejects(change(other, 'end', { spaceId, revision: created.space.revision }), { code: 'permission-denied' });
  const ended = await change(host, 'end', { spaceId, revision: created.space.revision }); assert.equal(ended.space.status, 'ended');
  await assert.rejects(call(host, 'audio', { spaceId }), { code: 'failed-precondition' });
  await assert.rejects(change(other, 'join', { spaceId, revision: 0 }), { code: 'failed-precondition' });
});
await check('account-incarnation changes and ambiguous profile owners are rejected', async () => {
  const ref = db.doc(`_account_profile_bindings/${other.uid}`); const original = (await ref.get()).data();
  await ref.update({ auth_created_at_ms: original.auth_created_at_ms + 1 });
  await assert.rejects(call(other, 'list'), { code: 'permission-denied' }); await ref.set(original);
  await db.doc(`profiles/${other.profileId}-duplicate`).set({ user_id: other.uid });
  await assert.rejects(call(other, 'list'), { code: 'failed-precondition' });
});
await check('concurrent worker deliveries claim one lease and expired claims can retry', async () => {
  const room = await change(host, 'create', { title: 'Worker lease check' });
  const member = await change(listener, 'join', { spaceId: room.space.id, revision: 0 });
  const promoted = await call(host, 'role', { requestId: randomUUID(), spaceId: room.space.id, participantId: member.participant.id, revision: member.participant.revision, role: 'speaker' });
  let entered, release;
  const started = new Promise(resolve => { entered = resolve; }), held = new Promise(resolve => { release = resolve; });
  let calls = 0;
  const slow = { ...audioProvider, revoke: async () => { calls++; entered(); await held; } };
  const running = sync(db, promoted.audioEffectId, slow); await started;
  await assert.rejects(sync(db, promoted.audioEffectId, slow), { code: 'unavailable' });
  assert.equal(calls, 1); release(); await running;
  await sync(db, promoted.audioEffectId, slow); assert.equal(calls, 1);
  const demoted = await call(host, 'role', { requestId: randomUUID(), spaceId: room.space.id, participantId: member.participant.id, revision: promoted.participant.revision, role: 'listener' });
  await db.doc(`_space_audio_effects/${demoted.audioEffectId}`).update({ lease_token: 'synthetic-abandoned', lease_until_ms: Date.now() - 1 });
  await sync(db, demoted.audioEffectId, audioProvider);
  assert.equal((await db.doc(`_space_audio_effects/${demoted.audioEffectId}`).get()).data().status, 'complete');
});
await check('closing a room reconciles pending member work without a later replay', async () => {
  const room = await change(host, 'create', { title: 'Pending close check' });
  const member = await change(listener, 'join', { spaceId: room.space.id, revision: 0 });
  const promoted = await call(host, 'role', { requestId: randomUUID(), spaceId: room.space.id, participantId: member.participant.id, revision: member.participant.revision, role: 'speaker' });
  const ended = await call(host, 'end', { requestId: randomUUID(), spaceId: room.space.id, revision: room.space.revision });
  const close = (await db.doc(`_space_audio_effects/${ended.audioEffectId}`).get()).data();
  assert.ok(close.cutoffSeconds >= (await db.doc(`_space_members/${member.participant.id}`).get()).data().audio_ready_at);
  await sync(db, ended.audioEffectId, audioProvider);
  assert.equal((await db.doc(`_space_members/${member.participant.id}`).get()).data().audio_pending, false);
  assert.equal((await db.doc(`_space_audio_effects/${promoted.audioEffectId}`).get()).data().status, 'complete');
  assert.equal((await db.doc(`_space_authority/${room.space.id}`).get()).data().audio_pending_count, 0);
  const before = audioCalls.length; await sync(db, promoted.audioEffectId, audioProvider); assert.equal(audioCalls.length, before);
});
await check('prepared callable wrappers use the room contract and reject guest/client role substitution', async () => {
  const { manageSpaces, spacesAudioToken, processSpaceAudioEffect } = await import('../functions/lib/spaces.js');
  await assert.rejects(manageSpaces.run({ data: {} }), { code: 'unauthenticated' });
  await assert.rejects(spacesAudioToken.run({ data: {} }), { code: 'unauthenticated' });
  const room = await manageSpaces.run({ auth: { uid: host.uid }, data: input(host, 'create', { requestId: randomUUID(), title: 'Callable contract check' }) });
  assert.equal(room.audioEffectId, undefined);
  await manageSpaces.run({ auth: { uid: listener.uid }, data: input(listener, 'join', { requestId: randomUUID(), spaceId: room.space.id, revision: 0 }) });
  const body = { expectedOwnerUid: listener.uid, expectedProfileId: listener.profileId, spaceId: room.space.id };
  await assert.rejects(spacesAudioToken.run({ auth: { uid: listener.uid }, data: { ...body, canPublish: true } }), { code: 'invalid-argument' });
  const names = ['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET']; const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  try {
    process.env.LIVEKIT_URL = 'wss://synthetic.livekit.cloud'; process.env.LIVEKIT_API_KEY = 'synthetic-key'; process.env.LIVEKIT_API_SECRET = 'synthetic-secret-only-for-isolated-tests';
    const issued = await spacesAudioToken.run({ auth: { uid: listener.uid }, data: body });
    const claims = JSON.parse(Buffer.from(issued.token.split('.')[1], 'base64url').toString());
    assert.equal(claims.video.canPublish, false); assert.equal(claims.video.canPublishData, false); assert.equal(claims.sub, listener.profileId);
    assert.equal(issued.role, 'listener'); assert.ok(issued.roomName.startsWith('space_v1_'));
  } finally { for (const name of names) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; } }
  assert.equal(processSpaceAudioEffect.__endpoint.eventTrigger.retry, true);
  assert.equal(processSpaceAudioEffect.__endpoint.timeoutSeconds, 480);
});
console.log(JSON.stringify({ checks, projectId, productionWrites: false, scope: 'Isolated domain, worker coordination and prepared callable contracts; live trigger delivery, UI, real provider mutation and historical restoration remain unverified.' }));
await db.terminate();
