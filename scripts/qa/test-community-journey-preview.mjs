import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';

// Fail before loading any SDK. These fixed addresses are the isolated preview.
assert.equal(process.env.GCLOUD_PROJECT, 'demo-vybe-preview');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9199');
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8280');
assert.equal(process.env.FIREBASE_STORAGE_EMULATOR_HOST, '127.0.0.1:9399');
assert.equal(process.env.FUNCTIONS_EMULATOR_HOST, '127.0.0.1:5101');
const { initializeApp, deleteApp } = await import('firebase/app');
const { getAuth, connectAuthEmulator, signInWithEmailAndPassword } = await import('firebase/auth');
const { getFunctions, connectFunctionsEmulator, httpsCallable } = await import('firebase/functions');
const { getFirestore, connectFirestoreEmulator, getDocFromServer, doc } = await import('firebase/firestore');
const apps = [], checks = [];
const owner = name => `preview-${name}`, profile = name => `preview-profile-${name}`;
async function player(name) {
  assert.ok(['alice', 'bob', 'guest'].includes(name));
  const app = initializeApp({ apiKey: 'demo-local-only', projectId: 'demo-vybe-preview', appId: `demo-community-${name}` }, `community-journey-${name}-${randomUUID()}`);
  apps.push(app);
  const auth = getAuth(app); connectAuthEmulator(auth, 'http://127.0.0.1:9199', { disableWarnings: true });
  const functions = getFunctions(app, 'us-central1'); connectFunctionsEmulator(functions, '127.0.0.1', 5101);
  const firestore = getFirestore(app); connectFirestoreEmulator(firestore, '127.0.0.1', 8280);
  if (name !== 'guest') {
    await signInWithEmailAndPassword(auth, `${name}@vybe.test`, 'Vybe-local-preview-only-2026!');
    assert.equal(auth.currentUser.uid, owner(name));
  }
  return { firestore, call: async (fn, data) => (await httpsCallable(functions, fn)({ expectedOwnerUid: owner(name), expectedProfileId: profile(name), ...data })).data };
}
const rejected = (action, code) => assert.rejects(action, error => String(error.code || '').replace(/^functions\//, '') === code);
let serverId, publicServerId, textChannelId, memberJoined = false, publicMemberJoined = false, permissionChanged = false;
let alice, bob;
try {
  alice = await player('alice'); bob = await player('bob'); const guest = await player('guest');
  await rejected(() => guest.call('communityManage', { action: 'listMine' }), 'unauthenticated');
  await rejected(() => alice.call('communityManage', { action: 'listMine', expectedOwnerUid: owner('bob') }), 'failed-precondition');
  await rejected(() => alice.call('communityManage', { action: 'listMine', expectedProfileId: profile('bob') }), 'failed-precondition');
  checks.push('actual HTTP rejects a guest, a mismatched expected account and a mismatched profile');

  const create = { name: 'Local community journey QA', description: 'Synthetic demo accounts only.', isPublic: false, requestId: 'preview-community-journey-v1' };
  const first = await alice.call('communityCreate', create), replay = await alice.call('communityCreate', create);
  serverId = first.server.id; assert.equal(replay.server.id, serverId);
  assert.equal(first.server.owner_id, profile('alice'));
  const mine = await alice.call('communityManage', { action: 'listMine' });
  assert.ok(mine.servers.some(server => server.id === serverId && server.myRole === 'owner'));
  checks.push('authenticated creation/replay retains one owned community and its list entry');

  // Converge only this fixture's prior membership after an interrupted run.
  const prior = await bob.call('communityManage', { action: 'listMine' });
  if (prior.servers.some(server => server.id === serverId)) await bob.call('communityManage', { action: 'leave', serverId });
  assert.ok(!(await alice.call('communityManage', { action: 'discover', search: create.name })).servers.some(server => server.id === serverId));
  await rejected(() => bob.call('communityJoin', { serverId }), 'not-found');
  checks.push('private discovery/direct-ID join does not expose or admit the nonmember');

  const previousInvite = await alice.call('communityInvite', { action: 'regenerate', serverId });
  const invitation = await alice.call('communityInvite', { action: 'regenerate', serverId });
  await rejected(() => bob.call('communityJoin', { inviteCode: previousInvite.inviteCode }), 'not-found');
  const joined = await bob.call('communityJoin', { inviteCode: invitation.inviteCode }); memberJoined = true;
  assert.equal(joined.server.id, serverId);
  assert.equal((await bob.call('communityJoin', { inviteCode: invitation.inviteCode })).alreadyMember, true);
  assert.equal((await getDocFromServer(doc(alice.firestore, 'servers', serverId))).data().member_count, 2);
  assert.ok((await bob.call('communityManage', { action: 'listMine' })).servers.some(server => server.id === serverId && server.myRole === 'member'));
  await rejected(() => bob.call('communityInvite', { action: 'regenerate', serverId }), 'permission-denied');
  checks.push('current invitation admits once, old invitation is rejected, and a member cannot regenerate it');

  const ownerChannels = await alice.call('communityManage', { action: 'listChannels', serverId });
  textChannelId = ownerChannels.channels.find(channel => channel.type === 'text' && !channel.is_private)?.id;
  assert.ok(textChannelId);
  let privateChannel = ownerChannels.channels.find(channel => channel.name === 'journey-private' && channel.is_private);
  if (!privateChannel) privateChannel = (await alice.call('communityManage', { action: 'createChannel', serverId, name: 'journey-private', type: 'text', isPrivate: true })).channel;
  const memberChannels = await bob.call('communityManage', { action: 'listChannels', serverId });
  assert.ok(memberChannels.channels.some(channel => channel.id === textChannelId));
  assert.ok(!memberChannels.channels.some(channel => channel.id === privateChannel.id));
  await rejected(() => bob.call('communitySendMessage', { channelId: privateChannel.id, content: 'must stay denied', clientMessageId: randomUUID() }), 'permission-denied');
  checks.push('real channel creation/listing excludes private owner channels from the member');

  const messageInput = { channelId: textChannelId, content: 'Synthetic community journey message', clientMessageId: randomUUID() };
  const sent = await bob.call('communitySendMessage', messageInput);
  const repeated = await bob.call('communitySendMessage', messageInput);
  assert.equal(sent.message.id, repeated.message.id);
  assert.equal((await getDocFromServer(doc(bob.firestore, 'channel_messages', sent.message.id))).data().content, messageInput.content);
  await rejected(() => bob.call('communitySendMessage', { ...messageInput, content: 'changed replay' }), 'already-exists');
  assert.equal((await getDocFromServer(doc(alice.firestore, 'channel_messages', sent.message.id))).data().content, messageInput.content);
  checks.push('member text send, physical read and identical replay preserve one unchanged message');

  await alice.call('communityManage', { action: 'setPermission', serverId, channelId: textChannelId, role: 'member', field: 'can_send', value: false }); permissionChanged = true;
  await rejected(() => bob.call('communitySendMessage', { ...messageInput, clientMessageId: randomUUID() }), 'permission-denied');
  await alice.call('communityManage', { action: 'setPermission', serverId, channelId: textChannelId, role: 'member', field: 'can_send', value: true }); permissionChanged = false;
  const resumed = await bob.call('communitySendMessage', { ...messageInput, clientMessageId: randomUUID(), content: 'Synthetic permission restored message' });
  assert.equal(resumed.message.content, 'Synthetic permission restored message');
  checks.push('owner permission changes deny and then restore actual member sends');

  await bob.call('communityManage', { action: 'leave', serverId }); memberJoined = false;
  assert.ok(!(await bob.call('communityManage', { action: 'listMine' })).servers.some(server => server.id === serverId));
  await rejected(() => getDocFromServer(doc(bob.firestore, 'channel_messages', sent.message.id)), 'permission-denied');
  await rejected(() => bob.call('communitySendMessage', { ...messageInput, clientMessageId: randomUUID() }), 'permission-denied');
  assert.equal((await getDocFromServer(doc(alice.firestore, 'servers', serverId))).data().member_count, 1);
  assert.equal((await getDocFromServer(doc(alice.firestore, 'channel_messages', sent.message.id))).exists(), true);
  checks.push('leaving revokes the same message read and new sends while preserving the owner and history');

  const publicName = 'Local public community journey QA';
  publicServerId = (await alice.call('communityCreate', { name: publicName, isPublic: true, requestId: 'preview-public-community-journey-v1' })).server.id;
  const discovered = (await bob.call('communityManage', { action: 'discover', search: publicName })).servers.find(server => server.id === publicServerId);
  assert.ok(discovered); assert.equal(Object.hasOwn(discovered, 'invite_code'), false); assert.equal(Object.hasOwn(discovered, 'invite_hash'), false);
  await bob.call('communityJoin', { serverId: publicServerId }); publicMemberJoined = true;
  assert.equal((await bob.call('communityJoin', { serverId: publicServerId })).alreadyMember, true);
  assert.equal((await getDocFromServer(doc(alice.firestore, 'servers', publicServerId))).data().member_count, 2);
  await bob.call('communityManage', { action: 'leave', serverId: publicServerId }); publicMemberJoined = false;
  assert.equal((await getDocFromServer(doc(alice.firestore, 'servers', publicServerId))).data().member_count, 1);
  checks.push('public discovery hides invitation secrets and direct-ID join/replay/leave update membership once');

  const result = { checkedAt: new Date().toISOString(), project: 'demo-vybe-preview', passed: checks.length, checks, serverId, publicServerId, textChannelId, messageId: sent.message.id, scope: 'Actual local Firebase Auth/HTTP callables and SDK Firestore rules. No forged admissions, cloud policy/provider changes or production data. Not browser UI, voice or physical-device proof.' };
  const output = new URL('../../work/local-preview/community-journey/', import.meta.url);
  await mkdir(output, { recursive: true }); await writeFile(new URL('latest.json', output), JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result,null,2));
} finally {
  try {
    if (permissionChanged) await alice.call('communityManage', { action: 'setPermission', serverId, channelId: textChannelId, role: 'member', field: 'can_send', value: true });
    if (memberJoined) await bob.call('communityManage', { action: 'leave', serverId });
    if (publicMemberJoined) await bob.call('communityManage', { action: 'leave', serverId: publicServerId });
  } finally { await Promise.all(apps.map(app => deleteApp(app))); }
}
