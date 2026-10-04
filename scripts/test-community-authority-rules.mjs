import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const projectId = process.env.GCLOUD_PROJECT || 'demo-vybe-creators';
assert.ok(projectId.startsWith('demo-'), 'Use a demo project for fixture writes');
assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):\d+$/);
const require = createRequire(path.resolve(process.env.FIREBASE_TEST_TOOLS_ROOT || '.', 'package.json'));
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, setDoc, getDoc, getDocs, collection, query, where, updateDoc, deleteDoc } = require('firebase/firestore');
const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
const env = await initializeTestEnvironment({ projectId, firestore: { host, port: Number(port), rules: await readFile('firestore.rules', 'utf8') } });
let checks = 0;
const yes = async (label, action) => { await assertSucceeds(action()); checks++; console.log(`PASS ${label}`); };
const no = async (label, action) => { await assertFails(action()); checks++; console.log(`PASS ${label}`); };
const owner = env.authenticatedContext('community-owner').firestore();
const member = env.authenticatedContext('community-member').firestore();
const outsider = env.authenticatedContext('community-outsider').firestore();
const staff = env.authenticatedContext('community-staff', { admin: true }).firestore();
const guest = env.unauthenticatedContext().firestore();
const serverId = 'private-community';
const admission = (uid, extra = {}) => ({ auth_uid: uid, user_id: `${uid}-profile`, server_id: serverId, role: 'member', active: true, ...extra });
const seed = async (key, row) => env.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), key), row));
try {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    for (const uid of ['community-owner', 'community-member', 'community-outsider']) {
      await setDoc(doc(db, `profiles/${uid}-profile`), { user_id: uid, username: uid });
      await setDoc(doc(db, `user_auth_index/${uid}`), { profile_id: `${uid}-profile` });
    }
    await setDoc(doc(db, `servers/${serverId}`), { owner_id: 'community-owner-profile', is_public: false, name: 'Private', invite_code: 'protected' });
    await setDoc(doc(db, 'servers/public-community'), { owner_id: 'community-owner-profile', is_public: true, deleted_at: null, name: 'Public' });
    await setDoc(doc(db, 'servers/archived-community'), { owner_id: 'community-owner-profile', is_public: true, deleted_at: 'fixture' });
    await setDoc(doc(db, `community_admissions/community-member/grants/${serverId}`), admission('community-member'));
    await setDoc(doc(db, `community_rosters/${serverId}/members/community-member`), admission('community-member'));
    await setDoc(doc(db, `server_members/${serverId}_community-outsider-profile`), { server_id: serverId, user_id: 'community-outsider-profile', role: 'owner' });
    for (const [id, isPrivate] of [['public-room', false], ['private-room', true]]) {
      await setDoc(doc(db, `channels/${id}`), { server_id: serverId, is_private: isPrivate, type: 'text' });
      await setDoc(doc(db, `channel_messages/${id}-message`), { channel_id: id, server_id: serverId, author_id: 'community-member', sender_id: 'community-member-profile', content: 'Private fixture' });
    }
    await setDoc(doc(db, 'community_invites/fixture-hash'), { server_id: serverId, expires_at: 'fixture' });
  });
  await yes('public server discovery remains available', () => getDocs(query(collection(outsider, 'servers'), where('is_public', '==', true), where('deleted_at', '==', null))));
  await yes('public server metadata is readable by signed-in users', () => getDoc(doc(outsider, 'servers/public-community')));
  await no('guests cannot discover communities', () => getDoc(doc(guest, 'servers/public-community')));
  await no('archived public communities are not readable to outsiders', () => getDoc(doc(outsider, 'servers/archived-community')));
  await yes('legacy owner anchor permits recovery reads without an admission', () => getDoc(doc(owner, `servers/${serverId}`)));
  await yes('trusted admitted member can read private server metadata', () => getDoc(doc(member, `servers/${serverId}`)));
  await no('legacy self-granted owner role cannot admit an outsider', () => getDoc(doc(outsider, `servers/${serverId}`)));
  await no('private invite cannot be looked up by client query', () => getDocs(query(collection(outsider, 'servers'), where('invite_code', '==', 'protected'))));
  for (const [label, client] of [['member', member], ['owner', owner], ['outsider', outsider], ['staff browser', staff]]) {
    await no(`${label} cannot create a server outside atomic service`, () => setDoc(doc(client, 'servers/injected'), { owner_id: 'community-member-profile', is_public: true }));
    await no(`${label} cannot transfer server ownership directly`, () => updateDoc(doc(client, `servers/${serverId}`), { owner_id: 'community-outsider-profile' }));
    await no(`${label} cannot replace private visibility or invitation directly`, () => updateDoc(doc(client, `servers/${serverId}`), { is_public: true, invite_code: 'weak' }));
    await no(`${label} cannot delete server identity`, () => deleteDoc(doc(client, `servers/${serverId}`)));
    await no(`${label} cannot create a canonical legacy membership`, () => setDoc(doc(client, `server_members/${serverId}_community-member-profile`), { server_id: serverId, user_id: 'community-member-profile', role: 'admin' }));
    await no(`${label} cannot update a legacy role`, () => updateDoc(doc(client, `server_members/${serverId}_community-outsider-profile`), { role: 'admin' }));
    await no(`${label} cannot forge new admission authority`, () => setDoc(doc(client, `community_admissions/community-outsider/grants/${serverId}`), admission('community-outsider', { role: 'owner' })));
    await no(`${label} cannot change trusted role`, () => updateDoc(doc(client, `community_admissions/community-member/grants/${serverId}`), { role: 'owner' }));
    await no(`${label} cannot mutate roster projection`, () => updateDoc(doc(client, `community_rosters/${serverId}/members/community-member`), { role: 'admin' }));
    await no(`${label} cannot create a channel without service checks`, () => setDoc(doc(client, 'channels/injected'), { server_id: serverId, is_private: false, type: 'voice' }));
    await no(`${label} cannot read secret invite lookup`, () => getDoc(doc(client, 'community_invites/fixture-hash')));
    await no(`${label} cannot post around sender/permission checks`, () => setDoc(doc(client, 'channel_messages/injected'), { channel_id: 'public-room', author_id: 'community-member', sender_id: 'community-outsider-profile', content: 'Spoof' }));
  }
  await yes('member may read its own new admission', () => getDoc(doc(member, `community_admissions/community-member/grants/${serverId}`)));
  await no('outsider cannot inspect another account admission', () => getDoc(doc(outsider, `community_admissions/community-member/grants/${serverId}`)));
  await yes('member can read trusted roster', () => getDocs(collection(member, `community_rosters/${serverId}/members`)));
  await no('outsider cannot read private roster', () => getDocs(collection(outsider, `community_rosters/${serverId}/members`)));
  await no('legacy rosters are quarantined', () => getDoc(doc(member, `server_members/${serverId}_community-outsider-profile`)));
  await yes('admitted member can read ordinary channel', () => getDoc(doc(member, 'channels/public-room')));
  await yes('member can query messages by authorized channel', () => getDocs(query(collection(member, 'channel_messages'), where('channel_id', '==', 'public-room'))));
  await no('outsider cannot read private server ordinary channel', () => getDoc(doc(outsider, 'channels/public-room')));
  await no('outsider cannot read private server messages', () => getDoc(doc(outsider, 'channel_messages/public-room-message')));
  await no('member cannot read restricted channel by default', () => getDoc(doc(member, 'channels/private-room')));
  await no('member cannot read restricted channel messages', () => getDoc(doc(member, 'channel_messages/private-room-message')));
  await yes('owner can read restricted channel', () => getDoc(doc(owner, 'channels/private-room')));
  await seed('channel_permissions/private-room_member', { channel_id: 'private-room', role: 'member', can_view: true });
  await yes('explicit channel grant enables restricted channel', () => getDoc(doc(member, 'channels/private-room')));
  await yes('explicit channel grant enables message query', () => getDocs(query(collection(member, 'channel_messages'), where('channel_id', '==', 'private-room'))));
  await seed('channel_permissions/private-room_member', { channel_id: 'different', role: 'member', can_view: true });
  await no('wrong channel permission tuple cannot grant visibility', () => getDoc(doc(member, 'channels/private-room')));
  await seed('channel_permissions/private-room_member', { channel_id: 'private-room', role: 'member', can_view: false });
  await no('explicit channel denial is respected', () => getDoc(doc(member, 'channels/private-room')));
  for (const malformed of [null, 'true', 1]) {
    await seed('channel_permissions/public-room_member', { channel_id: 'public-room', role: 'member', can_view: malformed });
    await no(`malformed explicit visibility ${JSON.stringify(malformed)} fails closed`, () => getDoc(doc(member, 'channels/public-room')));
  }
  await env.withSecurityRulesDisabled(context => deleteDoc(doc(context.firestore(), 'channel_permissions/public-room_member')));
  for (const extra of [{ active: false }, { auth_uid: 'different' }, { server_id: 'different' }, { role: 'arbitrary' }]) {
    await seed(`community_admissions/community-member/grants/${serverId}`, admission('community-member', extra));
    await no(`invalid admission ${JSON.stringify(extra)} cannot read server`, () => getDoc(doc(member, `servers/${serverId}`)));
    await no(`invalid admission ${JSON.stringify(extra)} cannot read messages`, () => getDoc(doc(member, 'channel_messages/public-room-message')));
  }
  await seed(`community_admissions/community-member/grants/${serverId}`, admission('community-member', { role: 'owner' }));
  await no('owner role without immutable owner anchor cannot bypass private channel', () => getDoc(doc(member, 'channels/private-room')));
  console.log(`Community authority rules: ${checks} checks passed`);
} finally { await env.cleanup(); }
