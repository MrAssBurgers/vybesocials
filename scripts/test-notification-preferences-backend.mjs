import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const projectId = process.env.GCLOUD_PROJECT;
assert.match(projectId || '', /^demo-[a-z0-9-]+$/);
assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):\d+$/);
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId });
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.resolve(process.env.FIREBASE_TEST_TOOLS_ROOT || '.', 'package.json'));
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc, deleteDoc } = require('firebase/firestore');
const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
const env = await initializeTestEnvironment({ projectId, firestore: { host, port: Number(port), rules: await readFile(path.join(root, 'firestore.rules'), 'utf8') } });
const { db } = await import('../functions/lib/_shared/admin.js');
const { manageNotificationPreferencesFor, readDeliveryNotificationPreferences, notificationBooleanKeys } = await import('../functions/lib/_shared/notificationPreferenceAuthority.js');
const { manageNotificationPreferences } = await import('../functions/lib/notificationPreferences.js');
const { muteSmartPings } = await import('../functions/lib/push.js');
const { loadNotificationPreferences, isPushAllowedForType, sanitizeDmPushBody } = await import('../functions/lib/_shared/pushPreferences.js');
const uid = 'notification-alice', profileId = 'profile-notification-alice';
const base = { expectedOwnerUid: uid, expectedProfileId: profileId };
const read = () => manageNotificationPreferencesFor(db, uid, { ...base, action: 'read' });
const set = (key, value, revision, requestId) => manageNotificationPreferencesFor(db, uid, { ...base, action: 'set', key, value, revision, requestId });
let groups = 0, rules = 0;
const check = async (name, run) => { await run(); groups++; console.log(`PASS ${name}`); };
try {
  await env.clearFirestore();
  await db.doc(`profiles/${profileId}`).set({ user_id: uid, username: uid });
  await db.doc(`user_auth_index/${uid}`).set({ profile_id: profileId });
  await check('strict authentication, current identity and request contract', async () => {
    await assert.rejects(manageNotificationPreferences.run({ data: {} }), { code: 'unauthenticated' });
    await assert.rejects(manageNotificationPreferencesFor(db, uid, { ...base, action: 'read', expectedOwnerUid: 'bob' }), { code: 'failed-precondition' });
    await assert.rejects(manageNotificationPreferencesFor(db, uid, { ...base, action: 'read', forged: true }), { code: 'invalid-argument' });
    for (const [key, value, revision, id] of [['unknown', false, 'a'.repeat(64), 'x'], ['likes_enabled', 'false', 'a'.repeat(64), 'x'], ['likes_enabled', false, 'a', 'x'], ['likes_enabled', false, 'a'.repeat(64), 'x/y']]) await assert.rejects(set(key, value, revision, id), { code: 'invalid-argument' });
  });
  await check('server-confirmed defaults do not write or initialize settings', async () => {
    const state = await read(); assert.ok(notificationBooleanKeys.every(key => state.values[key] === true));
    assert.equal((await db.doc(`_notification_preferences/${uid}`).get()).exists, false);
    assert.equal((await db.collection('notification_preferences').get()).empty, true);
  });
  await check('legacy duplicates preserve opt-outs and malformed booleans suppress delivery', async () => {
    await db.doc('notification_preferences/old-uid').set({ user_id: uid, likes_enabled: false, announcements_enabled: true, dms_enabled: true });
    await db.doc('notification_preferences/old-profile').set({ user_id: profileId, likes_enabled: true, announcements_enabled: false, dms_enabled: 'true', show_message_preview: false });
    const state = await read(); assert.equal(state.legacy, true); assert.equal(state.values.likes_enabled, false); assert.equal(state.values.announcements_enabled, false); assert.equal(state.values.dms_enabled, false);
    const delivery = await loadNotificationPreferences(uid); assert.equal(isPushAllowedForType('announcement', delivery), false); assert.equal(sanitizeDmPushBody('secret text', 'dm', delivery), 'New Chat');
    assert.deepEqual(await readDeliveryNotificationPreferences(db, profileId), state.values);
  });
  await check('malformed legacy quiet hours stop delivery rather than reverting to opt-in', async () => {
    await db.doc('notification_preferences/old-profile').update({ quiet_hours_start: '25:00' }); await assert.rejects(read(), { code: 'failed-precondition' }); await assert.rejects(loadNotificationPreferences(uid), { code: 'failed-precondition' });
    await db.doc('notification_preferences/old-profile').update({ quiet_hours_start: '22:00' }); await db.doc('notification_preferences/old-uid').update({ quiet_hours_start: '21:00' }); await assert.rejects(read(), { code: 'failed-precondition' });
    await db.doc('notification_preferences/old-uid').update({ quiet_hours_start: '22:00' });
  });
  await check('single-field save is canonical, feeds delivery and preserves the notification inbox', async () => {
    await db.doc('notifications/keep-inbox').set({ user_id: profileId, type: 'announcement', title: 'Keep me' });
    const before = await read(), after = await set('likes_enabled', true, before.revision, 'first-save');
    assert.notEqual(after.revision, before.revision); assert.equal(after.values.announcements_enabled, false); assert.equal(after.values.likes_enabled, true);
    const canonical = (await db.doc(`_notification_preferences/${uid}`).get()).data(); assert.equal(canonical.owner_uid, uid); assert.equal(canonical.profile_id, profileId); assert.equal(canonical.revision, after.revision);
    await db.doc('notification_preferences/old-profile').update({ announcements_enabled: true });
    assert.equal(isPushAllowedForType('announcement', await loadNotificationPreferences(profileId)), false);
    assert.equal((await db.doc('notifications/keep-inbox').get()).data().title, 'Keep me');
  });
  await check('concurrent revisions cannot silently overwrite one another', async () => {
    const before = await read(); const results = await Promise.allSettled([set('likes_enabled', false, before.revision, 'race-one'), set('calls_enabled', false, before.revision, 'race-two')]);
    assert.equal(results.filter(row => row.status === 'fulfilled').length, 1); assert.equal(results.find(row => row.status === 'rejected').reason.code, 'aborted');
  });
  await check('lost acknowledgements are stable and never undo a later choice', async () => {
    const before = await read(); const first = await set('announcements_enabled', true, before.revision, 'lost-response');
    await set('announcements_enabled', false, first.revision, 'new-choice');
    const replay = await set('announcements_enabled', true, before.revision, 'lost-response'); assert.equal(replay.replay, true); assert.equal(replay.values.announcements_enabled, false);
    await assert.rejects(set('announcements_enabled', false, before.revision, 'lost-response'), { code: 'already-exists' });
    assert.equal((await read()).values.announcements_enabled, false);
  });
  await check('malformed canonical state, collisions and profile changes fail closed', async () => {
    const reference = db.doc(`_notification_preferences/${uid}`), original = (await reference.get()).data();
    await reference.update({ 'values.calls_enabled': 'yes' }); await assert.rejects(read(), { code: 'failed-precondition' }); await assert.rejects(loadNotificationPreferences(uid), { code: 'failed-precondition' }); await reference.set(original);
    await db.doc(`profiles/${uid}`).set({ user_id: 'different-owner' }); await assert.rejects(read(), { code: 'failed-precondition' }); await db.doc(`profiles/${uid}`).delete();
    await db.doc(`user_auth_index/${uid}`).update({ profile_id: 'wrong-profile' }); await assert.rejects(read(), { code: 'failed-precondition' }); await db.doc(`user_auth_index/${uid}`).update({ profile_id: profileId });
  });
  await check('clients cannot forge canonical settings/receipts or modify legacy preferences', async () => {
    for (const context of [env.authenticatedContext(uid), env.authenticatedContext('other'), env.authenticatedContext('admin', { admin: true }), env.unauthenticatedContext()]) {
      for (const collection of ['_notification_preferences', '_notification_preference_requests']) {
        const reference = doc(context.firestore(), collection, uid);
        for (const action of [() => getDoc(reference), () => setDoc(reference, { owner_uid: uid }), () => updateDoc(reference, { owner_uid: 'other' }), () => deleteDoc(reference)]) { await assertFails(action()); rules++; }
      }
      const legacy = doc(context.firestore(), 'notification_preferences', 'old-uid');
      for (const action of [() => setDoc(legacy, { user_id: uid }), () => updateDoc(legacy, { likes_enabled: true }), () => deleteDoc(legacy)]) { await assertFails(action()); rules++; }
    }
    await assertSucceeds(getDoc(doc(env.authenticatedContext(uid).firestore(), 'notification_preferences', 'old-uid'))); rules++;
    await assertFails(getDoc(doc(env.authenticatedContext('other').firestore(), 'notification_preferences', 'old-uid'))); rules++;
  });
  await check('one-hour mute binds the canonical legacy profile without creating a UID-shaped profile', async () => {
    const before = await read();
    const started = Date.now();
    const request = { ...base, hours: 1, revision: before.revision, requestId: 'one-hour-mute' };
    const saved = await muteSmartPings.run({ auth: { uid }, data: request });
    assert.ok(saved.values.brief_muted_until >= started + 3600000 && saved.values.brief_muted_until <= Date.now() + 3600000);
    assert.equal(saved.values.brief_pings_enabled, before.values.brief_pings_enabled);
    assert.equal((await db.doc(`profiles/${uid}`).get()).exists, false);
    assert.equal((await db.doc(`profiles/${profileId}`).get()).data().user_id, uid);
    for (const type of ['smart_ping', 'brief', 'daily_brief']) assert.equal(isPushAllowedForType(type, await loadNotificationPreferences(uid)), false);
    const replay = await muteSmartPings.run({ auth: { uid }, data: request });
    assert.equal(replay.values.brief_muted_until, saved.values.brief_muted_until); assert.equal(replay.replay, true);
    await assert.rejects(muteSmartPings.run({ auth: { uid }, data: { ...request, hours: 24 } }), { code: 'invalid-argument' });
    await assert.rejects(muteSmartPings.run({ auth: { uid }, data: { hours: 1 } }), { code: 'failed-precondition' });
  });
  await check('stale timed mute never overwrites a concurrent preference and expired replay does not extend it', async () => {
    const before = await read();
    await set('brief_pings_enabled', false, before.revision, 'permanent-opt-out');
    await assert.rejects(manageNotificationPreferencesFor(db, uid, { ...base, action: 'muteBrief', hours: 1, revision: before.revision, requestId: 'stale-mute' }), { code: 'aborted' });
    const current = await read();
    const request = { ...base, action: 'muteBrief', hours: 1, revision: current.revision, requestId: 'expired-mute' };
    const saved = await manageNotificationPreferencesFor(db, uid, request);
    await db.doc(`_notification_preferences/${uid}`).update({ 'values.brief_muted_until': Date.now() - 1000 });
    const replay = await manageNotificationPreferencesFor(db, uid, request);
    assert.equal(replay.revision, saved.revision); assert.ok(replay.values.brief_muted_until < Date.now()); assert.equal(replay.values.brief_pings_enabled, false);
    assert.equal(isPushAllowedForType('daily_brief', { ...replay.values, brief_pings_enabled: true }), true);
  });
  await check('missing old canonical mute defaults safely; malformed protected expiry stops delivery', async () => {
    const reference = db.doc(`_notification_preferences/${uid}`), original = (await reference.get()).data();
    const values = { ...original.values }; delete values.brief_muted_until;
    await reference.set({ ...original, values }); assert.equal((await read()).values.brief_muted_until, null);
    await reference.update({ 'values.brief_muted_until': 'tomorrow' }); await assert.rejects(loadNotificationPreferences(uid), { code: 'failed-precondition' });
    await reference.set(original);
  });
  console.log(`Notification preferences: ${groups} backend groups, ${rules} rules checks passed.`);
} finally { await env.cleanup(); await db.terminate(); }
