import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

// Never run these fixture writes against a real Firebase project or remote host.
const projectId = process.env.GCLOUD_PROJECT || 'demo-vybe-creators';
assert.ok(projectId.startsWith('demo-'), 'Use a demo- project for emulator-only tests');
assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):\d+$/, 'Use an isolated local Firestore emulator');
const require = createRequire(path.resolve(process.env.FIREBASE_TEST_TOOLS_ROOT || '.', 'package.json'));
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, collection, setDoc, getDoc, getDocs, query, where, updateDoc, deleteDoc, runTransaction, writeBatch } = require('firebase/firestore');
const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
const env = await initializeTestEnvironment({ projectId, firestore: { host, port: Number(port), rules: await readFile('firestore.rules', 'utf8') } });
let checks = 0;
async function allowed(label, fn) { await assertSucceeds(fn()); checks++; console.log(`PASS ${label}`); }
async function denied(label, fn) { await assertFails(fn()); checks++; console.log(`PASS ${label}`); }
const uid = 'theme-alice';
const otherUid = 'theme-bob';
const profileId = 'theme-alice-profile';
const otherProfileId = 'theme-bob-profile';
const alice = env.authenticatedContext(uid).firestore();
const bob = env.authenticatedContext(otherUid).firestore();
const guest = env.unauthenticatedContext().firestore();
const staff = env.authenticatedContext('theme-admin', { admin: true }).firestore();
const theme = owner => ({ user_id: owner, theme_name: 'My theme', theme_tokens: { colorPrimary: '200 80% 50%' }, is_active: true });
const shared = (owner, isPublic = false) => ({ creator_id: owner, theme_name: 'Shared fixture', theme_tokens: { colorPrimary: '200 80% 50%' }, is_public: isPublic });
const background = (owner, active) => ({ user_id: owner, image_url: 'https://example.test/fixture.png', storage_path: `${owner}/fixture.png`, name: 'Library fixture', is_active: active });

try {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'profiles', profileId), { user_id: uid });
    await setDoc(doc(db, 'profiles', otherProfileId), { user_id: otherUid });
    await setDoc(doc(db, 'user_auth_index', uid), { profile_id: profileId });
    await setDoc(doc(db, 'user_auth_index', otherUid), { profile_id: otherProfileId });
    await setDoc(doc(db, 'user_themes', 'legacy-random-theme-id'), theme(profileId));
  });

  await denied('attacker cannot preallocate another auth UID theme document', () => setDoc(doc(bob, 'user_themes', uid), theme(otherUid)));
  await denied('attacker cannot preallocate another legacy profile theme document', () => setDoc(doc(bob, 'user_themes', profileId), theme(otherUid)));
  await allowed('owner creates canonical auth UID theme', () => setDoc(doc(alice, 'user_themes', uid), theme(uid)));
  await allowed('owner creates canonical legacy profile theme', () => setDoc(doc(alice, 'user_themes', profileId), theme(profileId)));
  await denied('new noncanonical theme documents are rejected', () => setDoc(doc(alice, 'user_themes', 'new-random-theme-id'), theme(uid)));
  await denied('forged theme owner rejected on create', () => setDoc(doc(bob, 'user_themes', 'forged-owner'), theme(uid)));
  await denied('signed-out clients cannot create account themes', () => setDoc(doc(guest, 'user_themes', 'guest'), theme('guest')));

  for (const [id, owner] of [[uid, uid], [profileId, profileId], ['legacy-random-theme-id', profileId]]) {
    await allowed(`owner reads theme ${id}`, () => getDoc(doc(alice, 'user_themes', id)));
    await allowed(`owner updates existing theme ${id}`, () => updateDoc(doc(alice, 'user_themes', id), { theme_name: 'Updated' }));
    await denied(`other account cannot read theme ${id}`, () => getDoc(doc(bob, 'user_themes', id)));
    await denied(`guest cannot read theme ${id}`, () => getDoc(doc(guest, 'user_themes', id)));
    await denied(`other account cannot overwrite and claim theme ${id}`, () => setDoc(doc(bob, 'user_themes', id), theme(otherUid)));
    await denied(`owner cannot transfer theme ${id}`, () => updateDoc(doc(alice, 'user_themes', id), { user_id: otherUid }));
    await denied(`owner cannot replace theme ${id} without ownership field`, () => setDoc(doc(alice, 'user_themes', id), { theme_name: 'Missing owner' }));
    await denied(`other account cannot delete theme ${id}`, () => deleteDoc(doc(bob, 'user_themes', id)));
    await allowed(`owner query supports theme owner ${owner}`, () => getDocs(query(collection(alice, 'user_themes'), where('user_id', '==', owner))));
  }
  await denied('even same-account owner alias changes are rejected', () => updateDoc(doc(alice, 'user_themes', uid), { user_id: profileId }));
  await allowed('owner can delete an existing migrated theme', () => deleteDoc(doc(alice, 'user_themes', 'legacy-random-theme-id')));

  for (const [label, owner] of [['auth UID', uid], ['legacy profile', profileId]]) {
    const publicId = `shared-public-${owner}`;
    const privateId = `shared-private-${owner}`;
    await denied(`${label} public theme creation needs server authority`, () => setDoc(doc(alice, 'shared_themes', publicId), shared(owner, true)));
    await denied(`${label} private snapshot creation needs server authority`, () => setDoc(doc(alice, 'shared_themes', privateId), shared(owner)));
    await env.withSecurityRulesDisabled(async context => {
      await setDoc(doc(context.firestore(), 'shared_themes', publicId), shared(owner, true));
      await setDoc(doc(context.firestore(), 'shared_themes', privateId), shared(owner));
    });
    await allowed(`${label} private snapshot stays readable by owner`, () => getDoc(doc(alice, 'shared_themes', privateId)));
    await allowed(`${label} public theme stays readable by another signed-in account`, () => getDoc(doc(bob, 'shared_themes', publicId)));
    await denied(`${label} private snapshot is not readable by another account`, () => getDoc(doc(bob, 'shared_themes', privateId)));
    await denied(`${label} snapshot cannot be overwritten by another account`, () => setDoc(doc(bob, 'shared_themes', privateId), shared(otherUid)));
    await allowed(`${label} owner can rename shared theme`, () => updateDoc(doc(alice, 'shared_themes', publicId), { theme_name: 'Renamed' }));
    await denied(`${label} owner cannot attribute theme to another auth UID`, () => updateDoc(doc(alice, 'shared_themes', publicId), { creator_id: otherUid }));
    await denied(`${label} owner cannot attribute theme to another legacy profile`, () => updateDoc(doc(alice, 'shared_themes', publicId), { creator_id: otherProfileId }));
    await denied(`${label} staff cannot desynchronize immutable theme audience`, () => updateDoc(doc(staff, 'shared_themes', publicId), { is_public: false }));
    await denied(`${label} staff cannot transfer theme authorship`, () => updateDoc(doc(staff, 'shared_themes', publicId), { creator_id: otherUid }));
    await allowed(`${label} staff can remove shared theme`, () => deleteDoc(doc(staff, 'shared_themes', publicId)));

    const activeId = `active-${owner}`;
    const inactiveId = `inactive-${owner}`;
    await allowed(`${label} owner can create active cover`, () => setDoc(doc(alice, 'user_backgrounds', activeId), background(owner, true)));
    await allowed(`${label} owner can create inactive library image`, () => setDoc(doc(alice, 'user_backgrounds', inactiveId), background(owner, false)));
    await allowed(`${label} owner reads inactive library image`, () => getDoc(doc(alice, 'user_backgrounds', inactiveId)));
    await allowed(`${label} owner lists complete library`, () => getDocs(query(collection(alice, 'user_backgrounds'), where('user_id', '==', owner))));
    await allowed(`${label} active cover can still be read by another user`, () => getDoc(doc(bob, 'user_backgrounds', activeId)));
    await allowed(`${label} existing profile-cover query still works`, () => getDocs(query(collection(bob, 'user_backgrounds'), where('user_id', '==', owner), where('is_active', '==', true))));
    await denied(`${label} other account cannot read inactive library image`, () => getDoc(doc(bob, 'user_backgrounds', inactiveId)));
    await denied(`${label} other account cannot query entire library`, () => getDocs(query(collection(bob, 'user_backgrounds'), where('user_id', '==', owner))));
    await denied(`${label} guest cannot read active cover`, () => getDoc(doc(guest, 'user_backgrounds', activeId)));
    await allowed(`${label} owner can rename library image`, () => updateDoc(doc(alice, 'user_backgrounds', inactiveId), { name: 'Renamed' }));
    await denied(`${label} owner cannot inject background into another auth UID`, () => updateDoc(doc(alice, 'user_backgrounds', inactiveId), { user_id: otherUid, is_active: true }));
    await denied(`${label} owner cannot inject background into another legacy profile`, () => updateDoc(doc(alice, 'user_backgrounds', inactiveId), { user_id: otherProfileId, is_active: true }));
    await denied(`${label} other account cannot take over background`, () => setDoc(doc(bob, 'user_backgrounds', inactiveId), background(otherUid, true)));
    await allowed(`${label} admin can inspect private image for moderation`, () => getDoc(doc(staff, 'user_backgrounds', inactiveId)));
    await denied(`${label} admin cannot transfer background ownership`, () => updateDoc(doc(staff, 'user_backgrounds', inactiveId), { user_id: otherUid }));
    await allowed(`${label} owner deactivates public cover`, () => updateDoc(doc(alice, 'user_backgrounds', activeId), { is_active: false }));
    await denied(`${label} deactivated cover becomes private immediately`, () => getDoc(doc(bob, 'user_backgrounds', activeId)));
    await allowed(`${label} owner can remove library image`, () => deleteDoc(doc(alice, 'user_backgrounds', inactiveId)));
  }
  await denied('unfiltered background-library enumeration rejected', () => getDocs(collection(bob, 'user_backgrounds')));
  await denied('background with forged auth UID rejected on create', () => setDoc(doc(bob, 'user_backgrounds', 'forged-auth'), background(uid, false)));
  await denied('background with forged legacy profile rejected on create', () => setDoc(doc(bob, 'user_backgrounds', 'forged-profile'), background(profileId, false)));

  const pointer = doc(alice, 'profiles', uid, 'settings', 'background');
  const legacyPointer = doc(alice, 'profiles', profileId, 'settings', 'background');
  await allowed('owner may read absent private activation pointer for the first transaction', () => getDoc(pointer));
  await denied('outsider cannot preallocate another UID activation pointer', () => setDoc(doc(bob, pointer.path), { active_background_id: 'foreign' }));
  await allowed('owner may initialize canonical UID activation pointer', () => setDoc(pointer, { active_background_id: null }));
  await allowed('owner may read canonical activation pointer', () => getDoc(pointer));
  await allowed('legacy alias remains an owned private settings path', () => setDoc(legacyPointer, { active_background_id: null }));
  await denied('outsider cannot read UID activation pointer', () => getDoc(doc(bob, pointer.path)));
  await denied('outsider cannot read legacy profile activation pointer', () => getDoc(doc(bob, legacyPointer.path)));
  await denied('guest cannot read activation pointer', () => getDoc(doc(guest, pointer.path)));
  await allowed('activation transaction can update both owned aliases and create a new selected row', () => runTransaction(alice, async tx => {
    await tx.get(pointer);
    const oldUid = doc(alice, 'user_backgrounds', `active-${uid}`);
    const oldProfile = doc(alice, 'user_backgrounds', `active-${profileId}`);
    await tx.get(oldUid); await tx.get(oldProfile);
    tx.update(oldUid, { is_active: false }); tx.update(oldProfile, { is_active: false });
    tx.set(doc(alice, 'user_backgrounds', 'atomic-new-background'), background(profileId, true));
    tx.set(pointer, { active_background_id: 'atomic-new-background' });
  }));
  await denied('another account cannot replace pointer and create its own row as one transaction', () => {
    const batch = writeBatch(bob);
    batch.set(doc(bob, pointer.path), { active_background_id: 'bob-forged-pointer-row' });
    batch.set(doc(bob, 'user_backgrounds', 'bob-forged-pointer-row'), background(otherUid, true));
    return batch.commit();
  });
  assert.equal((await getDoc(pointer)).data().active_background_id, 'atomic-new-background'); checks++;
  console.log('PASS rejected pointer takeover preserves the previous selection');
  await denied('outsider cannot delete activation pointer', () => deleteDoc(doc(bob, pointer.path)));
  await allowed('owner may clear the private pointer', () => setDoc(pointer, { active_background_id: null }));
  console.log(`Customization rules: ${checks} checks passed`);
} finally { await env.cleanup(); }
