import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

// Do not start an emulator here. The parent QA job supplies an isolated demo
// project and loopback endpoint; the live preview's Firestore port is excluded.
const projectId = process.env.GCLOUD_PROJECT;
assert.ok(['demo-vybe-creators', 'demo-vybe-creator-qa'].includes(projectId), 'Use the isolated creator QA project');
const endpoint = process.env.FIRESTORE_EMULATOR_HOST;
assert.match(endpoint || '', /^(127\.0\.0\.1|localhost):\d+$/, 'Loopback Firestore emulator required');
const [host, rawPort] = endpoint.split(':'); const port = Number(rawPort);
assert.ok(port > 0 && port < 65536 && port !== 8280, 'Do not use the live preview emulator');
const require = createRequire(path.resolve(process.env.FIREBASE_TEST_TOOLS_ROOT || '.', 'package.json'));
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, collection, setDoc, getDoc, getDocs, updateDoc, deleteDoc, query, where, serverTimestamp, Timestamp, writeBatch, setLogLevel } = require('firebase/firestore');
setLogLevel('silent');
const env = await initializeTestEnvironment({ projectId, firestore: { host, port, rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8') } });
const aliceUid = 'report-alice', bobUid = 'report-bob';
const alice = env.authenticatedContext(aliceUid, { admin: false }).firestore();
const bob = env.authenticatedContext(bobUid, { admin: false }).firestore();
const moderator = env.authenticatedContext('report-moderator', { admin: false }).firestore();
const admin = env.authenticatedContext('report-admin', { admin: true }).firestore();
const ownerAdmin = env.authenticatedContext(aliceUid, { admin: true }).firestore();
const guest = env.unauthenticatedContext().firestore();
const actors = [['report owner', alice], ['other account', bob], ['moderator browser', moderator], ['admin browser', admin], ['guest', guest]];
const seed = (table, id, value) => env.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), table, id), value));
let checks = 0;
async function allowed(label, run) { await assertSucceeds(run()); checks++; console.log(`PASS ${label}`); }
async function denied(label, run) { await assertFails(run()); checks++; console.log(`PASS ${label}`); }
const app = (owner = aliceUid) => ({ schema_version: 1, owner_id: owner, title: 'Synthetic app', description: 'Rules fixture', category: 'game', html: '<button>Play</button>', css: '', javascript: '', created_at: serverTimestamp(), updated_at: serverTimestamp() });
const hold = (id, extra = {}) => ({ version: 1, app_id: id, owner_uid: aliceUid, active: true, revision: 'fixture-revision', removed_at: '2026-10-03T12:00:00.000Z', removed_by_uid: 'report-admin', removed_by_profile_id: 'report-admin-profile', note: 'Synthetic moderation fixture', audit_id: 'fixture-audit', ...extra });

try {
  await env.clearFirestore();
  await seed('profiles', 'report-alice-profile', { user_id: aliceUid });
  await seed('user_auth_index', aliceUid, { profile_id: 'report-alice-profile' });
  await seed('profiles', bobUid, { user_id: bobUid });
  await seed('user_roles', 'report-moderator_moderator', { user_id: 'report-moderator', role: 'moderator', enabled: true });

  const report = { schema_version: 1, reporter_id: 'report-alice-profile', reporter_uid: aliceUid, reported_user_id: bobUid, content_type: 'mini_app', content_id: 'held-app', reason: 'Synthetic concern', status: 'pending', created_at: '2026-10-03T12:00:00.000Z' };
  await seed('reports', 'canonical-report', report);
  await seed('reports', 'legacy-report', { reporter_id: 'report-alice-profile', reason: 'Retained unverified legacy report', status: 'actioned' });
  for (const [label, client] of actors) {
    await denied(`${label} cannot directly read a canonical report`, () => getDoc(doc(client, 'reports', 'canonical-report')));
    await denied(`${label} cannot directly read retained legacy reports`, () => getDoc(doc(client, 'reports', 'legacy-report')));
    await denied(`${label} cannot query the report queue or pending count`, () => getDocs(query(collection(client, 'reports'), where('status', '==', 'pending'))));
    await denied(`${label} cannot forge report identity or staff fields on creation`, () => setDoc(doc(client, 'reports', 'forged-report'), { ...report, reporter_uid: bobUid, status: 'actioned', verified: true, mini_app_owner_uid: aliceUid, reviewed_by: 'report-admin' }));
    await denied(`${label} cannot submit even an otherwise ordinary report directly`, () => setDoc(doc(client, 'reports', 'ordinary-report'), report));
    await denied(`${label} cannot replace a report`, () => setDoc(doc(client, 'reports', 'canonical-report'), { ...report, status: 'dismissed' }));
    await denied(`${label} cannot forge review status, target or attribution`, () => updateDoc(doc(client, 'reports', 'canonical-report'), { status: 'actioned', reporter_uid: bobUid, content_id: 'other-app', reviewed_by: 'report-admin' }));
    await denied(`${label} cannot erase report evidence`, () => deleteDoc(doc(client, 'reports', 'canonical-report')));
  }

  const privateTables = ['_report_authority', '_report_requests', '_report_audit', '_report_quotas', '_message_report_evidence', '_mini_app_moderation', 'report_notification_deliveries', 'admin_alerts'];
  for (const table of privateTables) {
    await seed(table, 'protected', { version: 1, user_id: aliceUid, owner_uid: aliceUid, report_id: 'canonical-report', active: true, status: 'pending', read: false });
    for (const [label, client] of actors) {
      await denied(`${label} cannot read ${table}`, () => getDoc(doc(client, table, 'protected')));
      await denied(`${label} cannot list ${table}`, () => getDocs(collection(client, table)));
      await denied(`${label} cannot forge or preallocate ${table}`, () => setDoc(doc(client, table, 'forged'), { user_id: aliceUid, active: false, status: 'sent', count: 0 }));
      await denied(`${label} cannot edit ${table}`, () => updateDoc(doc(client, table, 'protected'), { active: false, status: 'sent', read: true, count: 0 }));
      await denied(`${label} cannot delete ${table}`, () => deleteDoc(doc(client, table, 'protected')));
    }
  }

  const id = 'held-app'; const draft = doc(alice, 'mini_app_drafts', id); const published = doc(alice, 'mini_apps', id);
  await allowed('owner can create an ordinary private draft', () => setDoc(draft, app()));
  await denied('absent hold still requires checked publication', () => setDoc(published, { ...app(), status: 'published' }));
  await seed('mini_apps', id, { ...app(), status: 'published', created_at: Timestamp.fromMillis(1), updated_at: Timestamp.fromMillis(1) });
  await denied('public updates require checked publication', () => updateDoc(published, { title: 'Before hold', updated_at: serverTimestamp() }));
  await allowed('unrelated public gallery reads remain available', () => getDocs(query(collection(bob, 'mini_apps'), where('status', '==', 'published'))));
  for (const [label, client] of [['other account', bob], ['moderator', moderator], ['admin claim', admin], ['guest', guest]]) {
    await denied(`${label} cannot directly remove another creator's app`, () => deleteDoc(doc(client, 'mini_apps', id)));
  }
  await seed('_mini_app_moderation', id, hold(id));
  for (const [label, client] of [['owner', alice], ['owner with admin claim', ownerAdmin]]) {
    await denied(`${label} cannot edit the public snapshot during an active hold`, () => updateDoc(doc(client, 'mini_apps', id), { html: '<p>Evade review</p>', updated_at: serverTimestamp() }));
  }
  await allowed('active hold does not prevent owner draft editing', () => updateDoc(draft, { html: '<p>Private correction</p>', updated_at: serverTimestamp() }));
  await allowed('active hold does not prevent owner draft reads', () => getDoc(draft));
  await denied('active hold does not expose private source to staff', () => getDoc(doc(admin, 'mini_app_drafts', id)));
  await allowed('owner may unpublish while held without releasing the hold', () => deleteDoc(published));
  await allowed('missing public snapshot remains detectable after removal', () => getDoc(published));
  for (const [label, client] of [['owner', alice], ['owner with admin claim', ownerAdmin]]) {
    await denied(`${label} cannot recreate a held public snapshot`, () => setDoc(doc(client, 'mini_apps', id), { ...app(), status: 'published' }));
    await denied(`${label} cannot atomically erase a hold and republish`, () => {
      const batch = writeBatch(client);
      batch.delete(doc(client, '_mini_app_moderation', id));
      batch.set(doc(client, 'mini_apps', id), { ...app(), status: 'published' });
      return batch.commit();
    });
  }
  await allowed('owner can delete a held private draft', () => deleteDoc(draft));
  await allowed('owner can recreate a private draft while hold persists', () => setDoc(draft, app()));
  await denied('draft deletion and recreation does not erase the public hold', () => setDoc(published, { ...app(), status: 'published' }));
  await seed('_mini_app_moderation', id, hold(id, { active: false, revision: 'release-revision', released_at: '2026-10-03T12:05:00.000Z', released_by_uid: 'report-admin', release_note: 'Synthetic release' }));
  await allowed('server release itself does not recreate the public snapshot', async () => { assert.equal((await getDoc(published)).exists(), false); });
  await denied('server release still requires checked publication', () => setDoc(published, { ...app(), status: 'published' }));
  await seed('mini_apps', id, { ...app(), status: 'published', created_at: Timestamp.fromMillis(1), updated_at: Timestamp.fromMillis(1) });
  await denied('released public updates require checked publication', () => updateDoc(published, { title: 'Released app', updated_at: serverTimestamp() }));
  await denied('release does not permit another user to overwrite ownership', () => updateDoc(doc(bob, 'mini_apps', id), { owner_id: bobUid, updated_at: serverTimestamp() }));
  await allowed('owner with admin claim still has ordinary owner unpublish control', () => deleteDoc(doc(ownerAdmin, 'mini_apps', id)));

  const malformed = [
    {}, { active: false }, { version: 1, app_id: 'malformed', owner_uid: aliceUid },
    { active: null }, { active: 0 }, { active: 'false' }, { active: true },
    { active: false, version: 0 }, { active: false, version: '1' },
    { active: false, app_id: 'another-app' }, { active: false, owner_uid: bobUid },
  ];
  for (let index = 0; index < malformed.length; index++) {
    const malformedId = `malformed-${index}`;
    await seed('mini_app_drafts', malformedId, { ...app(), created_at: Timestamp.fromMillis(1), updated_at: Timestamp.fromMillis(1) });
    const data = index < 3 ? malformed[index] : hold(malformedId, malformed[index]);
    await seed('_mini_app_moderation', malformedId, data);
    await denied(`malformed hold ${index} cannot authorize publication`, () => setDoc(doc(alice, 'mini_apps', malformedId), { ...app(), status: 'published' }));
    await seed('mini_apps', malformedId, { ...app(), status: 'published', created_at: Timestamp.fromMillis(1), updated_at: Timestamp.fromMillis(1) });
    await denied(`malformed hold ${index} cannot authorize public edits`, () => updateDoc(doc(alice, 'mini_apps', malformedId), { title: 'Not released', updated_at: serverTimestamp() }));
    await allowed(`malformed hold ${index} leaves private correction editable`, () => updateDoc(doc(alice, 'mini_app_drafts', malformedId), { description: 'Private fix', updated_at: serverTimestamp() }));
  }
  await allowed('another creator can still save an unrelated private app', async () => {
    await setDoc(doc(bob, 'mini_app_drafts', 'unrelated'), app(bobUid));

  });
  await allowed('ordinary profile editing remains available', () => updateDoc(doc(alice, 'profiles', 'report-alice-profile'), { bio: 'Unaffected profile edit' }));
  await denied('another account still cannot edit that profile', () => updateDoc(doc(bob, 'profiles', 'report-alice-profile'), { bio: 'Not owner' }));
  console.log(`Report authority rules: ${checks} checks passed`);
} finally { await env.cleanup(); }
