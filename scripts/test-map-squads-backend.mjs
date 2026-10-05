import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const projectId = process.env.GCLOUD_PROJECT;
assert.equal(projectId, 'demo-vybe-map-squads');
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8389');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9296');
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId });
const require = createRequire(path.resolve(process.env.FIREBASE_TEST_TOOLS_ROOT || '.', 'package.json'));
const { initializeTestEnvironment, assertFails } = require('@firebase/rules-unit-testing');
const { getDoc, getDocs, setDoc, updateDoc, deleteDoc, doc, collection, setLogLevel } = require('firebase/firestore'); setLogLevel('silent');
const { db, auth } = await import('../functions/lib/_shared/admin.js');
const { ensureAccountProfileForUid } = await import('../functions/lib/_shared/accountProfileAuthority.js');
const { manageMapSquadForUid, mapSquadMembershipId } = await import('../functions/lib/_shared/mapSquadAuthority.js');
const { manageMapSquad } = await import('../functions/lib/mapSquads.js');
const env = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8389, rules: await readFile('firestore.rules', 'utf8') } });
const now = Date.parse('2026-10-12T12:00:00Z'), day = 86400000;
const revision = () => randomBytes(24).toString('hex');
let groups = 0, rules = 0;
const check = async (label, task) => { await task(); groups++; console.log(`PASS ${label}`); };
const createActor = async (uid, migrated = false) => {
  const user = await auth.createUser({ uid }), accountCreatedAt = Date.parse(user.metadata.creationTime), profileId = migrated ? `profile-${uid}` : uid;
  if (migrated) await db.doc(`profiles/${profileId}`).set({ user_id: uid, username: uid, display_name: `Test ${uid}` });
  await ensureAccountProfileForUid(db, auth, uid, { action: 'ensure', expectedOwnerUid: uid, expectedAccountCreatedAt: accountCreatedAt, requestId: randomUUID() });
  return { uid, profileId, accountCreatedAt };
};
const reads = new Set(['list', 'read', 'matchMembers', 'previewInvite']);
const input = (actor, action, details = {}) => ({ action, expectedOwnerUid: actor.uid, expectedProfileId: actor.profileId, expectedAccountCreatedAt: actor.accountCreatedAt,
  ...(!reads.has(action) ? { requestId: randomUUID() } : {}), ...details });
const call = (actor, body, clock = now, authority = auth) => manageMapSquadForUid(db, authority, actor.uid, body, clock);
const read = (actor, squadId, extra = {}) => call(actor, input(actor, 'read', { squadId, ...extra }));
const createSquad = (actor, name = 'Test crew') => call(actor, input(actor, 'create', { name, emoji: '🗺️' }));
const invite = async (actor, squadId) => {
  const current = await read(actor, squadId);
  const body = input(actor, 'createInvite', { squadId, expectedRevision: current.squad.revision });
  return { body, result: await call(actor, body) };
};
const join = (actor, secret) => call(actor, input(actor, 'join', { token: secret }));
const allList = async actor => {
  const rows = []; let cursor = null, pages = 0;
  do { const page = await call(actor, input(actor, 'list', { ...(cursor ? { cursor } : {}) })); assert.ok(page.items.length <= 20); rows.push(...page.items); cursor = page.nextCursor; assert.ok(++pages < 20); } while (cursor);
  return rows;
};
const memberPath = (actor, squadId) => `_map_squad_members/${mapSquadMembershipId(squadId, actor.uid, actor.accountCreatedAt)}`;
const deny = async operation => { await assertFails(operation); rules++; };
try {
  await env.clearFirestore();
  const alice = await createActor('squad-alice', true), bob = await createActor('squad-bob', true), carol = await createActor('squad-carol'), stranger = await createActor('squad-stranger');
  await check('strict callable identity, action, incarnation and bounded input validation', async () => {
    await assert.rejects(manageMapSquad.run({ data: {} }), { code: 'unauthenticated' });
    for (const data of [{ expectedOwnerUid: bob.uid }, { expectedProfileId: bob.profileId }, { expectedAccountCreatedAt: alice.accountCreatedAt + 1000 }]) await assert.rejects(call(alice, input(alice, 'list', data)), { code: 'failed-precondition' });
    for (const data of [{ role: 'owner' }, { latitude: 1 }, { requestId: randomUUID() }, { cursor: 'bad' }]) await assert.rejects(call(alice, input(alice, 'list', data)), { code: 'invalid-argument' });
    for (const data of [{ name: ' ' }, { name: 'x'.repeat(41) }, { name: 'a\nb' }, { emoji: 'not-emoji' }, { requestId: 'bad' }]) await assert.rejects(call(alice, input(alice, 'create', { name: 'Crew', emoji: '🗺️', ...data })), { code: 'invalid-argument' });
    await assert.rejects(call(alice, input(alice, 'matchMembers', { squadId: 'x', candidateProfileIds: ['same', 'same'] })), { code: 'invalid-argument' });
    await assert.rejects(call(alice, input(alice, 'matchMembers', { squadId: 'x', candidateProfileIds: Array.from({ length: 101 }, (_, n) => `p${n}`) })), { code: 'invalid-argument' });
    await assert.rejects(call(alice, input(alice, 'join', { token: 'guess' })), { code: 'invalid-argument' });
  });
  let squad, creationBody;
  await check('atomic creation and exact concurrent retry create one squad and one owner membership', async () => {
    creationBody = input(alice, 'create', { name: 'Alice crew', emoji: '🔥' });
    const replies = await Promise.all([call(alice, creationBody), call(alice, creationBody)]); squad = replies[0].squad;
    assert.equal(new Set(replies.map(row => row.squadId)).size, 1); assert.equal(squad.member_count, 1); assert.equal(squad.membership.role, 'owner');
    const detail = await read(alice, squad.id); assert.equal(detail.squad.id, squad.id); assert.equal(detail.members.length, 1); assert.equal(detail.members[0].profile_id, alice.profileId);
    assert.equal(detail.validUntil - detail.serverTime, 15000); assert.equal((await db.collection('_map_squads').get()).size, 1);
    await assert.rejects(call(alice, { ...creationBody, name: 'Changed' }), { code: 'already-exists' });
  });
  await check('strangers cannot list/read/match private squad metadata without membership', async () => {
    assert.deepEqual((await call(stranger, input(stranger, 'list'))).items, []);
    assert.equal((await read(stranger, squad.id)).squad, null);
    assert.deepEqual((await call(stranger, input(stranger, 'matchMembers', { squadId: squad.id, candidateProfileIds: [alice.profileId] }))).matchedProfileIds, []);
    assert.equal((await read(stranger, 'missing')).squad, null);
  });
  let invitation;
  await check('owner-only invitation is stable for retries and deliberate bearer preview has no roster', async () => {
    invitation = await invite(alice, squad.id);
    const replay = await call(alice, invitation.body);
    assert.deepEqual(replay.invite, invitation.result.invite); assert.match(replay.invite.token, /^[a-f0-9]{64}$/); assert.equal(replay.invite.expiresAt, now + day);
    const preview = await call(bob, input(bob, 'previewInvite', { token: replay.invite.token }));
    assert.equal(preview.invite.squad.id, squad.id); assert.equal('members' in preview.invite, false); assert.equal('membership' in preview.invite.squad, false);
    await assert.rejects(call(bob, input(bob, 'createInvite', { squadId: squad.id, expectedRevision: squad.revision })), { code: 'permission-denied' });
    await assert.rejects(call(bob, input(bob, 'join', { token: 'a'.repeat(64) })), { code: 'permission-denied' });
  });
  let bobJoinBody;
  await check('a non-friend explicitly joins via invitation; concurrent joins count once', async () => {
    bobJoinBody = input(bob, 'join', { token: invitation.result.invite.token });
    const replies = await Promise.all([call(bob, bobJoinBody), call(bob, input(bob, 'join', { token: invitation.result.invite.token }))]);
    assert.ok(replies.every(row => row.status === 'active')); assert.equal((await read(alice, squad.id)).squad.member_count, 2);
    assert.equal((await db.collection('_map_squad_members').where('squad_id', '==', squad.id).get()).size, 2);
    assert.equal((await allList(bob))[0].id, squad.id);
    await assert.rejects(call(alice, input(alice, 'leave', { squadId: squad.id, expectedMembershipRevision: squad.membership.revision })), { code: 'failed-precondition' });
  });
  await check('leave/rejoin transitions and old receipts report current membership without reapplying', async () => {
    const before = await read(bob, squad.id), body = input(bob, 'leave', { squadId: squad.id, expectedMembershipRevision: before.squad.membership.revision });
    await assert.rejects(call(bob, { ...body, requestId: randomUUID(), expectedMembershipRevision: revision() }), { code: 'aborted' });
    const left = await call(bob, body); assert.equal(left.status, 'left'); assert.equal(left.squad, null);
    assert.equal((await read(alice, squad.id)).squad.member_count, 1);
    assert.equal((await call(bob, bobJoinBody)).status, 'left'); assert.equal((await read(alice, squad.id)).squad.member_count, 1);
    await join(bob, invitation.result.invite.token);
    assert.equal((await call(bob, body)).status, 'active'); assert.equal((await read(alice, squad.id)).squad.member_count, 2);
  });
  await check('two-way owner blocks deny all admission but the member can still leave', async () => {
    const before = await read(bob, squad.id);
    await db.doc('blocked_users/squad-owner-block').set({ blocker_id: alice.profileId, blocked_id: bob.profileId });
    assert.equal((await read(bob, squad.id)).squad, null);
    assert.equal((await call(bob, input(bob, 'previewInvite', { token: invitation.result.invite.token }))).invite, null);
    assert.deepEqual((await call(bob, input(bob, 'list'))).items, []);
    assert.deepEqual((await call(alice, input(alice, 'matchMembers', { squadId: squad.id, candidateProfileIds: [bob.profileId] }))).matchedProfileIds, []);
    assert.equal((await read(alice, squad.id)).members.some(row => row.profile_id === bob.profileId), false);
    await assert.rejects(join(bob, invitation.result.invite.token), { code: 'permission-denied' });
    assert.equal((await call(bob, input(bob, 'leave', { squadId: squad.id, expectedMembershipRevision: before.squad.membership.revision }))).status, 'left');
    await db.doc('blocked_users/squad-owner-block').delete(); await join(bob, invitation.result.invite.token);
    await db.doc('blocked_users/squad-reverse-block').set({ blocker_id: bob.uid, blocked_id: alice.uid });
    assert.equal((await read(bob, squad.id)).squad, null); await db.doc('blocked_users/squad-reverse-block').delete();
  });
  await check('roster and member matching omit identities blocked between participants without granting location', async () => {
    await join(carol, invitation.result.invite.token);
    await db.doc('blocked_users/squad-member-block').set({ blocker_id: bob.uid, blocked_id: carol.profileId });
    assert.equal((await read(bob, squad.id)).squad.member_count, 3);
    assert.equal((await read(bob, squad.id)).members.some(row => row.profile_id === carol.profileId), false);
    assert.deepEqual((await call(bob, input(bob, 'matchMembers', { squadId: squad.id, candidateProfileIds: [alice.profileId, carol.profileId, stranger.profileId, alice.uid] }))).matchedProfileIds, [alice.profileId]);
    await db.doc('blocked_users/squad-member-block').delete();
    for (const path of ['user_live_locations', '_location_grants', '_location_requests', 'notifications']) assert.equal((await db.collection(path).get()).size, 0);
  });
  await check('expired invite preview/join and replay never mint a replacement token', async () => {
    const replay = await call(alice, invitation.body, now + day + 1);
    assert.equal(replay.invite?.token, invitation.result.invite.token); assert.equal(replay.invite?.active, false);
    assert.equal((await call(stranger, input(stranger, 'previewInvite', { token: replay.invite.token }), now + day + 1)).invite, null);
    await assert.rejects(call(stranger, input(stranger, 'join', { token: replay.invite.token }), now + day + 1), { code: 'permission-denied' });
    assert.equal((await db.collection('_map_squad_invites').get()).size, 1);
  });
  await check('invitation expiry caps preview and a delayed join cannot commit past its deadline', async () => {
    const preview = await call(stranger, input(stranger, 'previewInvite', { token: invitation.result.invite.token }), now + day - 5000);
    assert.equal(preview.validUntil, now + day);
    let actorChecks = 0;
    const delayed = { getUser: async uid => {
      const user = await auth.getUser(uid);
      if (uid === stranger.uid && ++actorChecks >= 3) await new Promise(resolve => setTimeout(resolve, 30));
      return user;
    } };
    await assert.rejects(call(stranger, input(stranger, 'join', { token: invitation.result.invite.token }), now + day - 10, delayed), { code: 'permission-denied' });
    assert.equal((await db.doc(memberPath(stranger, squad.id)).get()).exists, false);
  });
  await check('owner-only archive uses current revision, revokes tokens, and retries cannot resurrect', async () => {
    const created = await createSquad(alice, 'Archive me'), issued = await invite(alice, created.squadId); await join(bob, issued.result.invite.token);
    const current = await read(alice, created.squadId), archive = input(alice, 'archive', { squadId: created.squadId, expectedRevision: current.squad.revision });
    await assert.rejects(call(alice, { ...archive, requestId: randomUUID(), expectedRevision: created.squad.revision }), { code: 'aborted' });
    await assert.rejects(call(bob, input(bob, 'archive', { squadId: created.squadId, expectedRevision: current.squad.revision })), { code: 'permission-denied' });
    const archived = await call(alice, archive); assert.equal(archived.status, 'archived'); assert.equal(archived.membership, null); assert.equal(archived.squad, null);
    const replay = await call(alice, archive); assert.equal(replay.status, 'archived'); assert.equal(replay.membership, null);
    assert.equal((await call(alice, issued.body)).invite, null); assert.equal((await read(bob, created.squadId)).squad, null);
    assert.equal((await call(stranger, input(stranger, 'previewInvite', { token: issued.result.invite.token }))).invite, null);
    await assert.rejects(join(stranger, issued.result.invite.token), { code: 'permission-denied' });
  });
  await check('deleted/recreated source paths cannot revive copied state, memberships, tokens or receipt success', async () => {
    const body = input(alice, 'create', { name: 'Deleted source', emoji: '✨' }), created = await call(alice, body), issued = await invite(alice, created.squadId);
    const ref = db.doc(`_map_squads/${created.squadId}`), source = (await ref.get()).data(); await ref.delete();
    assert.equal((await call(alice, body)).status, 'unavailable'); assert.equal((await ref.get()).exists, false);
    await ref.set(source);
    assert.equal((await read(alice, created.squadId)).squad, null); assert.equal((await call(alice, body)).status, 'unavailable');
    await assert.rejects(join(stranger, issued.result.invite.token), { code: 'permission-denied' });
    assert.equal((await call(alice, issued.body)).invite, null);
  });
  await check('legacy owner metadata requires exact reviewed source and recreates one new squad without old members', async () => {
    const ref = db.doc('map_group_maps/legacy-crew'), row = { owner_id: alice.profileId, name: 'Legacy crew', emoji: '💜', color: '#112233', created_at: new Date(now - day).toISOString() };
    await ref.set(row); await db.doc('map_group_members/forged-legacy-owner').set({ group_id: ref.id, user_id: bob.profileId, role: 'owner' });
    const legacy = (await read(alice, ref.id)).squad; assert.equal(legacy.legacy, true); assert.equal(legacy.membership, null); assert.equal(legacy.member_count, 0);
    assert.equal((await read(bob, ref.id)).squad, null); assert.equal((await allList(bob)).some(item => item.id === ref.id), false);
    const body = input(alice, 'recreate', { legacySquadId: ref.id, expectedRevision: legacy.revision });
    await ref.update({ name: 'Changed legacy' }); await assert.rejects(call(alice, body), { code: 'aborted' });
    await ref.set(row); const fresh = (await read(alice, ref.id)).squad;
    const requests = [input(alice, 'recreate', { legacySquadId: ref.id, expectedRevision: fresh.revision }), input(alice, 'recreate', { legacySquadId: ref.id, expectedRevision: fresh.revision })];
    const replies = await Promise.all(requests.map(request => call(alice, request)));
    assert.equal(replies[0].squadId, replies[1].squadId); assert.notEqual(replies[0].squadId, ref.id); assert.equal(replies[0].squad.member_count, 1);
    assert.deepEqual((await ref.get()).data(), row); assert.equal((await db.doc('map_group_members/forged-legacy-owner').get()).exists, true);
    assert.equal((await allList(alice)).some(item => item.id === ref.id), false); assert.equal((await read(alice, replies[0].squadId)).members.length, 1);
    await assert.rejects(call(bob, input(bob, 'recreate', { legacySquadId: ref.id, expectedRevision: fresh.revision })), { code: 'aborted' });
  });
  await check('a copied legacy source at the same path still needs a new explicit version review', async () => {
    const ref = db.doc('map_group_maps/legacy-replaced'), row = { owner_id: alice.uid, name: 'Old snapshot', emoji: '🔥', color: '#222222', created_at: new Date(now).toISOString() };
    await ref.set(row); const old = await read(alice, ref.id); await ref.delete(); await ref.set(row);
    await assert.rejects(call(alice, input(alice, 'recreate', { legacySquadId: ref.id, expectedRevision: old.squad.revision })), { code: 'aborted' });
  });
  await check('malformed protected member role never returns a false successful join', async () => {
    const ref = db.doc(memberPath(bob, squad.id)), before = (await ref.get()).data();
    await ref.update({ role: 'owner' });
    await assert.rejects(join(bob, invitation.result.invite.token), { code: 'failed-precondition' });
    assert.equal((await read(bob, squad.id)).squad, null); await ref.set(before);
  });
  await check('current disabled owner and late Auth incarnation changes deny admission before return or write', async () => {
    await auth.updateUser(alice.uid, { disabled: true }); assert.equal((await read(bob, squad.id)).squad, null); await auth.updateUser(alice.uid, { disabled: false });
    let checks = 0;
    const late = { getUser: async uid => { const user = await auth.getUser(uid); if (uid === alice.uid && ++checks > 1) return { ...user, disabled: true }; return user; } };
    await assert.rejects(call(stranger, input(stranger, 'join', { token: invitation.result.invite.token }), now, late), { code: 'failed-precondition' });
    assert.equal((await db.doc(memberPath(stranger, squad.id)).get()).exists, false);
    const outage = { getUser: async uid => { if (uid === alice.uid) throw Object.assign(new Error('test outage'), { code: 'auth/internal-error' }); return auth.getUser(uid); } };
    await assert.rejects(call(bob, input(bob, 'read', { squadId: squad.id }), now, outage), { code: 'unavailable' });
    let memberChecks = 0;
    const retiredMember = { getUser: async uid => { const user = await auth.getUser(uid); if (uid === carol.uid && ++memberChecks > 1) return { ...user, metadata: { ...user.metadata, creationTime: new Date(carol.accountCreatedAt + 1000).toISOString() } }; return user; } };
    await assert.rejects(call(bob, input(bob, 'matchMembers', { squadId: squad.id, candidateProfileIds: [carol.profileId] }), now, retiredMember), { code: 'failed-precondition' });
  });
  await check('retired bindings and profile/UID collisions cannot inherit squad roles', async () => {
    const ref = db.doc(`_account_profile_bindings/${carol.uid}`), before = (await ref.get()).data(); await ref.update({ status: 'retired' });
    assert.equal((await read(bob, squad.id)).members.some(row => row.profile_id === carol.profileId), false);
    await assert.rejects(read(carol, squad.id), { code: 'failed-precondition' }); await ref.set(before);
    await db.doc(`profiles/${alice.uid}`).set({ user_id: 'someone-else', username: 'collision' });
    assert.equal((await read(bob, squad.id)).squad, null); await db.doc(`profiles/${alice.uid}`).delete();
  });
  await check('rosters paginate beyond50 and matching covers admitted contacts outside the first page', async () => {
    const created = await createSquad(alice, 'Large fixture squad'), group = (await db.doc(`_map_squads/${created.squadId}`).get()).data();
    const actors = [];
    for (let n = 0; n < 55; n++) {
      const actor = await createActor(`squad-large-${n}`), binding = (await db.doc(`_account_profile_bindings/${actor.uid}`).get()).data(); actors.push(actor);
      await db.doc(memberPath(actor, created.squadId)).set({ version: 1, squad_id: created.squadId, generation: group.generation, owner_uid: actor.uid, profile_id: actor.profileId,
        account_created_at_ms: actor.accountCreatedAt, binding_revision: binding.revision, role: 'member', status: 'active', revision: revision(), joined_at: new Date(now).toISOString() });
    }
    await db.doc(`_map_squads/${created.squadId}`).update({ member_count: 56, revision: revision() });
    let cursor = null, firstCursor, ids = [], pages = 0;
    do { const page = await read(alice, created.squadId, cursor ? { cursor } : {}); assert.equal(page.squad.member_count, 56); assert.ok(page.members.length <= 20); ids.push(...page.members.map(row => row.profile_id)); cursor = page.nextCursor; firstCursor ||= cursor; pages++; } while (cursor);
    assert.equal(pages, 3); assert.equal(ids.length, 56); assert.equal(new Set(ids).size, 56);
    const match = await call(alice, input(alice, 'matchMembers', { squadId: created.squadId, candidateProfileIds: actors.map(actor => actor.profileId) }));
    assert.equal(match.matchedProfileIds.length, 55);
    await assert.rejects(call(bob, input(bob, 'read', { squadId: created.squadId, cursor: firstCursor })), { code: 'failed-precondition' });
    await assert.rejects(read(alice, squad.id, { cursor: firstCursor }), { code: 'failed-precondition' });
    await assert.rejects(call(alice, input(alice, 'read', { squadId: created.squadId, cursor: firstCursor }), now + 600001), { code: 'failed-precondition' });
  });
  await check('owned and joined squad lists page completely with legacy rows and no global count scan', async () => {
    const owner = await createActor('squad-list-owner');
    for (let n = 0; n < 23; n++) await createSquad(owner, `Current ${n}`);
    for (let n = 0; n < 23; n++) await db.doc(`map_group_maps/legacy-list-${n}`).set({ owner_id: owner.profileId, name: `Legacy ${n}`, emoji: '🗺️', color: '#888888', created_at: new Date(now).toISOString() });
    const items = await allList(owner); assert.equal(items.length, 46); assert.equal(new Set(items.map(item => item.id)).size, 46); assert.equal(items.filter(item => !item.legacy).length, 23);
    for (const item of items.filter(item => !item.legacy)) assert.equal(item.member_count, 1);
    const first = await call(owner, input(owner, 'list')); await assert.rejects(call(alice, input(alice, 'list', { cursor: first.nextCursor })), { code: 'failed-precondition' });
    await assert.rejects(call(owner, input(owner, 'list', { cursor: first.nextCursor }), now + 600001), { code: 'failed-precondition' });
  });
  await check('raw old and protected squad namespaces deny every direct client operation', async () => {
    const namespaces = ['map_group_maps', 'map_group_members', '_map_squads', '_map_squad_members', '_map_squad_invites', '_map_squad_receipts', '_map_squad_cursors', '_map_squad_recreations'];
    for (const namespace of namespaces) {
      await db.doc(`${namespace}/rules-target`).set({ owner_id: alice.profileId, user_id: alice.profileId, role: 'owner' });
      for (const viewer of [env.authenticatedContext(alice.uid).firestore(), env.authenticatedContext(bob.uid).firestore(), env.authenticatedContext('staff', { admin: true }).firestore(), env.unauthenticatedContext().firestore()]) {
        const target = doc(viewer, namespace, 'rules-target');
        await deny(getDoc(target)); await deny(getDocs(collection(viewer, namespace))); await deny(setDoc(doc(viewer, namespace, 'rules-new'), { owner_id: alice.profileId, user_id: alice.profileId }));
        await deny(updateDoc(target, { role: 'owner' })); await deny(deleteDoc(target));
      }
    }
  });
  console.log(`PASS ${groups} squad backend groups + ${rules} Firestore rule checks`);
} finally { await env.cleanup(); }
