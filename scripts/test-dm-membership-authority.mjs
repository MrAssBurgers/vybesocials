import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

// Fail closed: these destructive fixtures are for the local demo emulator only.
const projectId = process.env.GCLOUD_PROJECT || 'demo-vybe-creators';
assert.ok(projectId.startsWith('demo-'), 'Use a demo- project for emulator-only tests');
assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):\d+$/, 'Use an isolated local Firestore emulator');
const require = createRequire(path.resolve(process.env.FIREBASE_TEST_TOOLS_ROOT || '.', 'package.json'));
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, collection, setDoc, getDoc, getDocs, query, where, updateDoc, deleteDoc, arrayUnion, writeBatch } = require('firebase/firestore');
const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
const env = await initializeTestEnvironment({ projectId, firestore: { host, port: Number(port), rules: await readFile('firestore.rules', 'utf8') } });
let checks = 0;
async function allowed(label, fn) { const result = await assertSucceeds(fn()); checks++; console.log(`PASS ${label}`); return result; }
async function denied(label, fn) { await assertFails(fn()); checks++; console.log(`PASS ${label}`); }
const aliceUid = 'dm-alice';
const bobUid = 'dm-bob';
const eveUid = 'dm-eve';
const aliceProfile = 'alice-profile';
const bobProfile = 'bob-profile';
const eveProfile = 'eve-profile';
const alice = env.authenticatedContext(aliceUid).firestore();
const bob = env.authenticatedContext(bobUid).firestore();
const eve = env.authenticatedContext(eveUid).firestore();
const guest = env.unauthenticatedContext().firestore();
const parent = (cid, creator, members, extra = {}) => ({ id: cid, created_by: creator, member_ids: members, is_group: false, ...extra });
const member = (cid, owner, extra = {}) => ({ id: `${cid}_${owner}`, conversation_id: cid, user_id: owner, role: 'member', ...extra });
const memberRef = (db, cid, owner) => doc(db, 'conversation_members', `${cid}_${owner}`);
const pair = `${aliceProfile}_${bobProfile}`;
const legacy = 'legacy-random-conversation';

try {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    for (const [uid, profileId] of [[aliceUid, aliceProfile], [bobUid, bobProfile], [eveUid, eveProfile]]) {
      await setDoc(doc(db, 'profiles', profileId), { user_id: uid });
      await setDoc(doc(db, 'user_auth_index', uid), { profile_id: profileId });
    }
    await setDoc(doc(db, 'conversations', pair), parent(pair, aliceProfile, [aliceProfile, bobProfile]));
    await setDoc(doc(db, 'messages', 'pair-secret'), { conversation_id: pair, sender_id: bobProfile, content: 'isolated fixture' });
    await setDoc(doc(db, 'conversations', pair, 'messages', 'nested-secret'), { sender_id: bobProfile, content: 'isolated fixture' });
    await setDoc(doc(db, 'conversations', legacy), { id: legacy, created_by: bobProfile });
    await setDoc(doc(db, 'conversation_members', 'legacy-alice-row'), member(legacy, aliceProfile, { id: 'legacy-alice-row', role: 'admin' }));
    await setDoc(doc(db, 'messages', 'legacy-secret'), { conversation_id: legacy, sender_id: bobProfile });
    await setDoc(doc(db, 'conversation_members', 'deleted-group-alice-row'), member('deleted-group', aliceProfile, { id: 'deleted-group-alice-row' }));
    await setDoc(doc(db, 'messages', 'orphan-secret'), { conversation_id: 'deleted-group', sender_id: bobProfile });
    // Imported malformed composite rows cannot grant access merely by path.
    await setDoc(memberRef(db, pair, eveUid), member('unrelated-chat', eveUid));
    await setDoc(memberRef(db, pair, eveProfile), member(pair, bobProfile));
    await setDoc(doc(db, 'conversations', pair, 'members', eveUid), { user_id: bobUid });
    await setDoc(doc(db, 'conversations', pair, 'members', eveProfile), { user_id: eveProfile, conversation_id: 'unrelated-chat' });
    await setDoc(doc(db, 'conversations', 'nested-only'), { id: 'nested-only', created_by: bobUid });
    await setDoc(doc(db, 'conversations', 'nested-only', 'members', aliceProfile), { user_id: aliceProfile, joined_at: 'fixture' });
    await setDoc(doc(db, 'messages', 'nested-only-secret'), { conversation_id: 'nested-only', sender_id: bobUid });
    await setDoc(doc(db, 'calls', 'forged-old-call'), { caller_id: eveUid, receiver_id: bobUid, conversation_id: pair, status: 'ringing' });
  });

  await allowed('legacy profile listed in parent can read conversation', () => getDoc(doc(alice, 'conversations', pair)));
  await allowed('other participant can read flat messages', () => getDoc(doc(bob, 'messages', 'pair-secret')));
  await denied('outsider cannot read parent despite malformed composite/nested paths', () => getDoc(doc(eve, 'conversations', pair)));
  await denied('outsider cannot read flat message', () => getDoc(doc(eve, 'messages', 'pair-secret')));
  await denied('outsider cannot read nested message', () => getDoc(doc(eve, 'conversations', pair, 'messages', 'nested-secret')));
  await denied('outsider cannot append itself to known parent', () => updateDoc(doc(eve, 'conversations', pair), { member_ids: arrayUnion(eveUid) }));
  await denied('outsider cannot replace parent members with itself', () => updateDoc(doc(eve, 'conversations', pair), { member_ids: [eveProfile] }));
  await denied('outsider cannot claim parent creator field', () => updateDoc(doc(eve, 'conversations', pair), { created_by: eveUid, member_ids: [eveUid] }));
  await denied('member cannot transfer conversation creator', () => updateDoc(doc(alice, 'conversations', pair), { created_by: bobProfile }));
  await denied('member cannot reclassify a DM using is_group to bypass direct blocks', () => updateDoc(doc(alice, 'conversations', pair), { is_group: true }));
  await denied('member cannot add legacy group type to bypass direct blocks', () => updateDoc(doc(alice, 'conversations', pair), { type: 'group' }));
  await denied('member cannot add an unrelated third party', () => updateDoc(doc(alice, 'conversations', pair), { member_ids: arrayUnion(eveProfile) }));
  await denied('repair cannot remove another participant', () => updateDoc(doc(alice, 'conversations', pair), { member_ids: [aliceProfile] }));
  await allowed('member repairs its auth UID alias', () => updateDoc(doc(alice, 'conversations', pair), { member_ids: arrayUnion(aliceUid) }));
  await allowed('member may still update ordinary chat metadata', () => updateDoc(doc(alice, 'conversations', pair), { updated_at: 'fixture' }));
  await denied('guest cannot create self membership', () => setDoc(memberRef(guest, pair, 'guest'), member(pair, 'guest')));
  await denied('outsider cannot create arbitrary-ID membership in victim chat', () => setDoc(doc(eve, 'conversation_members', 'forged-random-row'), member(pair, eveUid, { id: 'forged-random-row' })));
  await denied('outsider cannot self seed in another chat without existing authority', () => setDoc(memberRef(eve, legacy, eveUid), member(legacy, eveUid)));
  await denied('outsider cannot seed nested membership', () => setDoc(doc(eve, 'conversations', legacy, 'members', eveUid), { user_id: eveUid }));
  await denied('outsider cannot batch seed membership and append parent', () => {
    const batch = writeBatch(eve);
    batch.set(memberRef(eve, legacy, eveUid), member(legacy, eveUid));
    batch.update(doc(eve, 'conversations', legacy), { member_ids: [eveUid] });
    return batch.commit();
  });
  await allowed('participant creates own canonical profile membership', () => setDoc(memberRef(alice, pair, aliceProfile), member(pair, aliceProfile)));
  await allowed('participant creates own canonical auth membership', () => setDoc(memberRef(alice, pair, aliceUid), member(pair, aliceUid)));
  await allowed('participant backfills peer already listed in parent', () => setDoc(memberRef(alice, pair, bobProfile), member(pair, bobProfile)));
  await denied('participant cannot backfill unlisted outsider', () => setDoc(memberRef(alice, legacy, eveUid), member(legacy, eveUid)));
  await denied('participant cannot create composite with mismatched stored owner', () => setDoc(doc(alice, 'conversation_members', `${pair}_wrong`), member(pair, aliceUid)));
  await denied('participant cannot promote its role on create', () => setDoc(memberRef(bob, pair, bobUid), member(pair, bobUid, { role: 'admin' })));
  await allowed('owner can update membership read/mute preferences', () => updateDoc(memberRef(alice, pair, aliceProfile), { is_muted: true, last_read_at: 'fixture' }));
  for (const [field, value] of [['conversation_id', legacy], ['user_id', eveUid], ['role', 'admin'], ['id', 'replacement'], ['legacy_membership_id', 'legacy-alice-row']]) {
    await denied(`existing membership cannot rewrite ${field}`, () => updateDoc(memberRef(alice, pair, aliceProfile), { [field]: value }));
  }
  await denied('owner cannot retarget malformed membership to victim chat', () => updateDoc(memberRef(eve, pair, eveUid), { conversation_id: pair }));
  await denied('owner cannot exploit malformed nested membership by rewriting owner', () => updateDoc(doc(eve, 'conversations', pair, 'members', eveUid), { user_id: eveUid }));
  await allowed('owner can query its migrated membership rows', () => getDocs(query(collection(alice, 'conversation_members'), where('user_id', '==', aliceProfile))));
  await denied('random legacy row alone does not authorize parent before repair', () => getDoc(doc(alice, 'conversations', legacy)));
  await denied('proof from another account rejected', () => setDoc(memberRef(eve, legacy, eveUid), member(legacy, eveUid, { legacy_membership_id: 'legacy-alice-row', role: 'admin' })));
  await denied('proof from another conversation rejected', () => setDoc(memberRef(alice, 'unrelated-chat', aliceUid), member('unrelated-chat', aliceUid, { legacy_membership_id: 'legacy-alice-row', role: 'admin' })));
  await denied('proof cannot escalate imported role', () => setDoc(memberRef(alice, 'deleted-group', aliceUid), member('deleted-group', aliceUid, { legacy_membership_id: 'deleted-group-alice-row', role: 'admin' })));
  await denied('nonexistent legacy proof rejected', () => setDoc(memberRef(alice, 'unknown-chat', aliceUid), member('unknown-chat', aliceUid, { legacy_membership_id: 'missing-row' })));
  await allowed('own legacy profile row proves canonical profile repair', () => setDoc(memberRef(alice, legacy, aliceProfile), member(legacy, aliceProfile, { legacy_membership_id: 'legacy-alice-row', role: 'admin' })));
  await allowed('own legacy profile row proves auth UID alias repair', () => setDoc(memberRef(alice, legacy, aliceUid), member(legacy, aliceUid, { legacy_membership_id: 'legacy-alice-row', role: 'admin' })));
  await allowed('repaired legacy participant can load parent', () => getDoc(doc(alice, 'conversations', legacy)));
  await allowed('repaired legacy participant can read messages', () => getDoc(doc(alice, 'messages', 'legacy-secret')));
  await allowed('repaired legacy participant can merge only own aliases', () => updateDoc(doc(alice, 'conversations', legacy), { member_ids: [aliceProfile, aliceUid] }));
  await denied('legacy DM without is_group cannot acquire a group flag', () => updateDoc(doc(alice, 'conversations', legacy), { is_group: true }));
  await denied('legacy DM without type cannot acquire group type', () => updateDoc(doc(alice, 'conversations', legacy), { type: 'group' }));
  await denied('legacy repair does not grant creator ownership', () => updateDoc(doc(alice, 'conversations', legacy), { created_by: aliceProfile }));
  await allowed('nested profile-only membership authorizes messages', () => getDoc(doc(alice, 'messages', 'nested-only-secret')));
  await allowed('nested member can repair own flat auth alias', () => setDoc(memberRef(alice, 'nested-only', aliceUid), member('nested-only', aliceUid)));
  await allowed('existing participant can seed its nested alias', () => setDoc(doc(alice, 'conversations', pair, 'members', aliceUid), { user_id: aliceUid }));
  await allowed('nested owner can edit ordinary read state', () => updateDoc(doc(alice, 'conversations', pair, 'members', aliceUid), { last_read_at: 'fixture' }));
  await denied('nested membership role is immutable', () => updateDoc(doc(alice, 'conversations', pair, 'members', aliceUid), { role: 'admin' }));
  await denied('nested membership conversation identity is immutable', () => updateDoc(doc(alice, 'conversations', pair, 'members', aliceUid), { conversation_id: legacy }));
  await denied('member cannot seed nested outsider', () => setDoc(doc(alice, 'conversations', pair, 'members', 'new-outsider'), { user_id: 'new-outsider' }));

  const authPair = `${aliceUid}_${bobUid}`;
  await allowed('caller can create a new own deterministic UID pair', () => setDoc(doc(alice, 'conversations', authPair), parent(authPair, aliceUid, [aliceUid, bobUid])));
  await denied('outsider cannot create somebody else deterministic pair', () => setDoc(doc(eve, 'conversations', `${bobProfile}_${aliceProfile}`), parent(`${bobProfile}_${aliceProfile}`, eveUid, [bobProfile, aliceProfile, eveUid])));
  await denied('own deterministic pair cannot smuggle a third party', () => setDoc(doc(alice, 'conversations', `${bobUid}_${aliceUid}`), parent(`${bobUid}_${aliceUid}`, aliceUid, [bobUid, aliceUid, eveUid])));
  await denied('random conversation creation cannot claim an orphan history', () => setDoc(doc(eve, 'conversations', 'deleted-group'), parent('deleted-group', eveUid, [eveUid])));
  await denied('historical group member cannot recreate deleted parent as creator', () => setDoc(doc(alice, 'conversations', 'deleted-group'), parent('deleted-group', aliceProfile, [aliceProfile, bobProfile], { is_group: true })));
  await denied('historical group member cannot recreate parent disguised as a DM', () => setDoc(doc(alice, 'conversations', 'deleted-group'), parent('deleted-group', aliceProfile, [aliceProfile, bobProfile])));
  await denied('deterministic path cannot be used for client group creation', () => setDoc(doc(alice, 'conversations', `${aliceProfile}_${eveProfile}`), parent(`${aliceProfile}_${eveProfile}`, aliceProfile, [aliceProfile, eveProfile], { is_group: true })));
  await allowed('historical member can recover own read alias without claiming deleted parent', () => setDoc(memberRef(alice, 'deleted-group', aliceUid), member('deleted-group', aliceUid, { legacy_membership_id: 'deleted-group-alice-row' })));
  await allowed('historical member retains access to own orphaned conversation messages', () => getDoc(doc(alice, 'messages', 'orphan-secret')));
  await denied('outsider still cannot read orphaned messages', () => getDoc(doc(eve, 'messages', 'orphan-secret')));
  await allowed('owner can delete a migrated legacy row', () => deleteDoc(doc(alice, 'conversation_members', 'deleted-group-alice-row')));
  await allowed('owner can delete own canonical membership', () => deleteDoc(memberRef(alice, 'deleted-group', aliceUid)));
  await denied('deleted proofs cannot resurrect membership', () => setDoc(memberRef(alice, 'deleted-group', aliceUid), member('deleted-group', aliceUid, { legacy_membership_id: 'deleted-group-alice-row' })));
  await denied('removing all membership proofs revokes orphan message reads', () => getDoc(doc(alice, 'messages', 'orphan-secret')));
  await denied('other participant cannot delete another flat membership', () => deleteDoc(memberRef(bob, pair, aliceProfile)));
  await allowed('owner can delete own nested membership', () => deleteDoc(doc(alice, 'conversations', pair, 'members', aliceUid)));
  await denied('guest cannot create deterministic conversation', () => setDoc(doc(guest, 'conversations', 'guest_other'), parent('guest_other', 'guest', ['guest', 'other'])));

  const call = { caller_id: aliceProfile, receiver_id: bobProfile, conversation_id: pair, status: 'ringing', participant_ids: [aliceProfile, bobProfile] };
  await denied('outsider cannot attach its call to a private conversation', () => setDoc(doc(eve, 'calls', 'outsider-call'), { ...call, caller_id: eveUid }));
  await denied('previous forged call cannot be updated by its outsider caller', () => updateDoc(doc(eve, 'calls', 'forged-old-call'), { status: 'accepted' }));
  await allowed('established member can create a conversation call', () => setDoc(doc(alice, 'calls', 'member-call'), call));
  await allowed('receiver member can accept the call', () => updateDoc(doc(bob, 'calls', 'member-call'), { status: 'accepted', started_at: 'fixture' }));
  await allowed('caller member can switch call mode', () => updateDoc(doc(alice, 'calls', 'member-call'), { call_mode: 'persistent' }));
  for (const [field, value] of [['conversation_id', legacy], ['caller_id', bobProfile], ['receiver_id', eveUid], ['participant_ids', [eveUid]]]) {
    await denied(`call update cannot change ${field}`, () => updateDoc(doc(alice, 'calls', 'member-call'), { [field]: value }));
  }
  await allowed('legacy standalone caller can create an unattached call', () => setDoc(doc(eve, 'calls', 'standalone-call'), { caller_id: eveUid, receiver_id: bobUid, status: 'ringing' }));
  await allowed('legacy standalone receiver can decline call', () => updateDoc(doc(bob, 'calls', 'standalone-call'), { status: 'declined' }));
  await denied('standalone call cannot later attach to a private conversation', () => updateDoc(doc(eve, 'calls', 'standalone-call'), { conversation_id: pair }));
  await denied('unrelated account cannot edit standalone call', () => updateDoc(doc(alice, 'calls', 'standalone-call'), { status: 'accepted' }));
  console.log(`DM membership authority: ${checks} checks passed`);
} finally {
  await env.cleanup();
}
