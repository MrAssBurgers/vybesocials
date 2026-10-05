import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const projectId = process.env.GCLOUD_PROJECT;
assert.match(projectId || '', /^demo-/); assert.notEqual(projectId, 'demo-vybe-preview');
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8387'); assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9297');
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId });
const require = createRequire(path.resolve(process.env.FIREBASE_TEST_TOOLS_ROOT || '.', 'package.json'));
const { initializeTestEnvironment, assertFails } = require('@firebase/rules-unit-testing');
const { getDoc, getDocs, setDoc, updateDoc, deleteDoc, doc, collection, setLogLevel } = require('firebase/firestore'); setLogLevel('silent');
const { db, auth } = await import('../functions/lib/_shared/admin.js');
const { ensureAccountProfileForUid } = await import('../functions/lib/_shared/accountProfileAuthority.js');
const { manageLoginStreakForUid } = await import('../functions/lib/_shared/loginStreakAuthority.js');
const { manageLoginStreak } = await import('../functions/lib/loginStreak.js');
const env = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8387, rules: await readFile('firestore.rules', 'utf8') } });
const DAY = 86400000, start = Date.parse('2026-10-10T12:00:00Z');
let groups = 0, rules = 0;
const check = async (label, task) => { await task(); groups++; console.log(`PASS ${label}`); };
const create = async (uid, migrated = false) => {
  const user = await auth.createUser({ uid }), accountCreatedAt = Date.parse(user.metadata.creationTime), profileId = migrated ? `legacy-${uid}` : uid;
  if (migrated) await db.doc(`profiles/${profileId}`).set({ user_id: uid, username: uid });
  await ensureAccountProfileForUid(db, auth, uid, { action: 'ensure', expectedOwnerUid: uid, expectedAccountCreatedAt: accountCreatedAt, requestId: randomUUID() });
  return { uid, profileId, accountCreatedAt };
};
const input = (actor, action = 'read', extra = {}) => ({ action, expectedOwnerUid: actor.uid, expectedProfileId: actor.profileId,
  expectedAccountCreatedAt: actor.accountCreatedAt, timezone: 'UTC', ...(action === 'read' ? {} : { requestId: randomUUID() }), ...extra });
const call = (actor, body = input(actor), now = start, authority = auth) => manageLoginStreakForUid(db, authority, actor.uid, body, now);
const track = (actor, offset = 0, extra = {}) => call(actor, input(actor, 'track', extra), start + offset * DAY);
const deny = async task => { await assertFails(task); rules++; };
try {
  await env.clearFirestore();
  const alice = await create('streak-alice', true);
  await check('strict actor, calendar, action and parameter binding', async () => {
    await assert.rejects(manageLoginStreak.run({ data: {} }), { code: 'unauthenticated' });
    for (const extra of [{ expectedOwnerUid: 'other' }, { expectedProfileId: 'other' }, { expectedAccountCreatedAt: alice.accountCreatedAt + 1000 }]) await assert.rejects(call(alice, input(alice, 'read', extra)), { code: 'failed-precondition' });
    for (const extra of [{ timezone: 'Bad/Zone' }, { current_streak: 999 }, { premium: true }, { now: 0 }, { requestId: randomUUID() }]) await assert.rejects(call(alice, input(alice, 'read', extra)), { code: 'invalid-argument' });
    await assert.rejects(call(alice, input(alice, 'restore')), { code: 'invalid-argument' });
    await assert.rejects(call(alice, input(alice, 'track', { requestId: 'invalid' })), { code: 'invalid-argument' });
  });
  await check('fresh read is truthful and does not create state or fabricate a login', async () => {
    const result = await call(alice); assert.equal(result.revision, null); assert.equal(result.streak, 0); assert.equal(result.needsLoginToday, true);
    assert.equal(result.restore.access, 'launch-free'); assert.equal(result.restore.eligible, false);
    assert.equal((await db.doc(`_login_streak_state/${alice.uid}`).get()).exists, false);
  });
  let first;
  await check('concurrent exact request commits once; different requests cannot increment the same day', async () => {
    const body = input(alice, 'track'); const results = await Promise.all([call(alice, body), call(alice, body), call(alice, body)]);
    first = results[0]; assert.equal(first.streak, 1); assert.equal(first.currentStreakVerified, true);
    assert.equal(new Set(results.map(row => row.revision)).size, 1); assert.equal(results.filter(row => !row.replayed).length, 1);
    const sameDay = await track(alice); assert.equal(sameDay.streak, 1); assert.equal(sameDay.isNewDay, false); assert.equal(sameDay.revision, first.revision);
    await assert.rejects(call(alice, { ...body, timezone: 'Asia/Tokyo' }), { code: 'already-exists' });
  });
  await check('concurrent next-day logins increment once and old receipts cannot reapply later', async () => {
    const oldBody = input(alice, 'track'); await call(alice, oldBody);
    const results = await Promise.all([track(alice, 1), track(alice, 1), track(alice, 1)]);
    assert.ok(results.every(row => row.streak === 2)); assert.equal(results.filter(row => row.isNewDay).length, 1);
    await assert.rejects(call(alice, oldBody, start + DAY), { code: 'aborted' });
    assert.equal((await call(alice, input(alice), start + DAY)).streak, 2);
  });
  await check('one missed day retains the actual previous run across track and restores today exactly once', async () => {
    await track(alice, 2);
    const broken = await call(alice, input(alice), start + 4 * DAY); assert.equal(broken.streak, 0); assert.equal(broken.restore.previousStreak, 3); assert.equal(broken.restore.eligible, true);
    const reset = await track(alice, 4); assert.equal(reset.streak, 1); assert.equal(reset.streakBroken, true); assert.equal(reset.restore.previousStreak, 3);
    const body = input(alice, 'restore', { expectedRevision: reset.revision }); const restored = await call(alice, body, start + 4 * DAY);
    assert.equal(restored.streak, 4); assert.equal(restored.restored, true); assert.equal(restored.restore.eligible, false);
    const retry = await call(alice, body, start + 4 * DAY); assert.equal(retry.replayed, true); assert.equal(retry.restored, true); assert.equal(retry.streak, 4);
    assert.equal((await track(alice, 4)).streak, 4);
    await assert.rejects(call(alice, input(alice, 'restore', { expectedRevision: reset.revision }), start + 4 * DAY), { code: 'aborted' });
    assert.equal((await track(alice, 5)).streak, 5);
    await assert.rejects(call(alice, body, start + 5 * DAY), { code: 'aborted' });
  });
  await check('restore also works before daily track and does not add a fabricated missed-day login', async () => {
    const actor = await create('streak-restore-first'); await track(actor); const prior = await track(actor, 1);
    const result = await call(actor, input(actor, 'restore', { expectedRevision: prior.revision }), start + 3 * DAY);
    assert.equal(result.streak, 3); assert.equal(result.restored, true); assert.equal((await track(actor, 3)).streak, 3);
  });
  await check('multiple missed days and an expired same-day restore window do not revive a record', async () => {
    const actor = await create('streak-window'); await track(actor); await track(actor, 1);
    const broken = await track(actor, 3); assert.equal(broken.restore.eligible, true);
    const expiry = Date.parse(broken.restore.availableUntil);
    const expired = await call(actor, input(actor), expiry); assert.equal(expired.restore.eligible, false); assert.equal(expired.restore.reason, 'expired');
    await assert.rejects(call(actor, input(actor, 'restore', { expectedRevision: broken.revision }), expiry), { code: 'failed-precondition' });
    const gap = await track(actor, 7); assert.equal(gap.restore.reason, 'missed-multiple-days'); assert.equal(gap.restore.previousStreak, null);
    await assert.rejects(call(actor, input(actor, 'restore', { expectedRevision: gap.revision }), start + 7 * DAY), { code: 'failed-precondition' });
  });
  await check('legacy current and longest remain displayed and untouched, without becoming restore evidence', async () => {
    const actor = await create('streak-historical', true);
    const row = { user_id: actor.profileId, profile_id: actor.profileId, current_streak: 10, longest_streak: 100, last_login_date: '2026-10-10', marker: 'preserve' };
    await db.doc('login_streaks/imported-historical').set(row);
    const read = await call(actor); assert.equal(read.streak, 10); assert.equal(read.longestStreak, 100); assert.equal(read.currentStreakVerified, false); assert.equal(read.revision, null);
    const today = await track(actor); assert.equal(today.streak, 10); assert.equal(today.isNewDay, false); assert.equal(today.currentStreakVerified, false);
    assert.equal((await track(actor, 1)).streak, 11);
    const broken = await track(actor, 3); assert.equal(broken.streak, 1); assert.equal(broken.currentStreakVerified, true); assert.equal(broken.longestStreak, 100);
    assert.equal(broken.restore.reason, 'legacy-unverified'); assert.equal(broken.restore.previousStreak, null);
    await assert.rejects(call(actor, input(actor, 'restore', { expectedRevision: broken.revision }), start + 3 * DAY), { code: 'failed-precondition' });
    assert.deepEqual((await db.doc('login_streaks/imported-historical').get()).data(), row);
    await track(actor, 4); const verifiedBreak = await track(actor, 6); assert.equal(verifiedBreak.restore.previousStreak, 2);
    assert.equal((await call(actor, input(actor, 'restore', { expectedRevision: verifiedBreak.revision }), start + 6 * DAY)).streak, 3);
  });
  await check('ambiguous, future and malformed historical rows are retained rather than selected or overwritten', async () => {
    for (const kind of ['duplicate', 'future', 'malformed']) {
      const actor = await create(`streak-${kind}`), row = { user_id: actor.uid, current_streak: kind === 'malformed' ? -99 : 7, longest_streak: 99, last_login_date: kind === 'future' ? '2099-01-01' : '2026-10-10' };
      await db.doc(`login_streaks/${actor.uid}`).set(row);
      if (kind === 'duplicate') await db.doc(`login_streaks/second-${actor.uid}`).set(row);
      const result = await track(actor); assert.equal(result.streak, 1); assert.equal(result.legacyHistory.status, kind === 'duplicate' ? 'ambiguous' : 'invalid');
      assert.deepEqual((await db.doc(`login_streaks/${actor.uid}`).get()).data(), row);
    }
  });
  await check('changing device timezone cannot award a second day or move the persisted deadline', async () => {
    const actor = await create('streak-traveler'), now = Date.parse('2026-10-10T03:30:00Z');
    const first = await call(actor, input(actor, 'track', { timezone: 'America/New_York' }), now); assert.equal(first.currentDay, '2026-10-09');
    const moved = await call(actor, input(actor, 'track', { timezone: 'Pacific/Kiritimati' }), now + 1000);
    assert.equal(moved.streak, 1); assert.equal(moved.currentDay, first.currentDay); assert.equal(moved.expiresAt, first.expiresAt); assert.equal(moved.timezoneChanged, true);
    assert.equal((await call(actor, input(actor, 'track', { timezone: 'Pacific/Kiritimati' }), Date.parse('2026-10-10T04:00:00Z'))).streak, 2);
  });
  await check('DST spring/autumn and year boundary use server civil dates, not elapsed 24-hour guesses', async () => {
    for (const [name, before, next, later, expires] of [
      ['spring', '2026-03-08T04:30:00Z', '2026-03-08T05:00:00Z', '2026-03-09T03:30:00Z', '2026-03-10T04:00:00.000Z'],
      ['autumn', '2026-11-01T03:30:00Z', '2026-11-01T04:00:00Z', '2026-11-02T04:30:00Z', '2026-11-03T05:00:00.000Z'],
    ]) {
      const actor = await create(`streak-${name}`), body = () => input(actor, 'track', { timezone: 'America/New_York' });
      await call(actor, body(), Date.parse(before)); const result = await call(actor, body(), Date.parse(next));
      assert.equal(result.streak, 2); assert.equal(result.expiresAt, expires); assert.equal((await call(actor, body(), Date.parse(later))).streak, 2);
    }
    const actor = await create('streak-new-year'); await call(actor, input(actor, 'track'), Date.parse('2026-12-31T23:59:59Z'));
    assert.equal((await call(actor, input(actor, 'track'), Date.parse('2027-01-01T00:00:00Z'))).streak, 2);
  });
  await check('retired, foreign and changed account bindings cannot read or mutate streaks', async () => {
    const actor = await create('streak-retired'); await track(actor);
    const binding = (await db.doc(`_account_profile_bindings/${actor.uid}`).get()).data();
    for (const replacement of [{ ...binding, status: 'retired' }, { ...binding, auth_created_at_ms: binding.auth_created_at_ms + 1000 }, { ...binding, revision: 'b'.repeat(48) }]) {
      await db.doc(`_account_profile_bindings/${actor.uid}`).set(replacement); await assert.rejects(call(actor), { code: 'failed-precondition' });
    }
    await db.doc(`_account_profile_bindings/${actor.uid}`).set(binding);
    await db.doc(`user_auth_index/${actor.uid}`).update({ profile_id: alice.profileId }); await assert.rejects(call(actor), { code: 'failed-precondition' });
    const collider = await create('streak-collision', true); await db.doc(`profiles/${collider.uid}`).set({ user_id: 'someone-else' });
    await assert.rejects(track(collider), { code: 'failed-precondition' });
  });
  await check('late account incarnation changes and broken protected data never report a successful reset', async () => {
    const actor = await create('streak-late'); let reads = 0;
    const changedAuth = { getUser: async uid => { const user = await auth.getUser(uid); return ++reads === 1 ? user : { ...user, metadata: { creationTime: new Date(actor.accountCreatedAt + 1000).toUTCString() } }; } };
    await assert.rejects(call(actor, input(actor, 'track'), start, changedAuth), { code: 'failed-precondition' });
    assert.equal((await db.doc(`_login_streak_state/${actor.uid}`).get()).exists, false);
    await track(actor); await db.doc(`_login_streak_state/${actor.uid}`).update({ current: -5 });
    await assert.rejects(track(actor, 1), { code: 'failed-precondition' }); assert.equal((await db.doc(`_login_streak_state/${actor.uid}`).get()).data().current, -5);
  });
  await check('malformed protected retry data cannot fabricate events or rewrite the current run', async () => {
    const actor = await create('streak-malformed-receipt'), body = input(actor, 'track');
    const result = await call(actor, body);
    const receiptRef = db.doc(`_login_streak_receipts/${createHash('sha256').update(JSON.stringify([actor.uid, body.requestId])).digest('hex')}`);
    const receipt = (await receiptRef.get()).data();
    for (const replacement of [{ ...receipt, version: 2 }, { ...receipt, event: {} }, { ...receipt, event: { ...receipt.event, restored: 'true' } },
      { ...receipt, event: { ...receipt.event, streak: 999 } }]) {
      await receiptRef.set(replacement); await assert.rejects(call(actor, body), { code: 'aborted' });
      const current = await call(actor); assert.equal(current.streak, 1); assert.equal(current.revision, result.revision);
    }
    await receiptRef.set(receipt); assert.equal((await call(actor, body)).replayed, true);
  });
  await check('legacy and checked state/receipts deny all direct clients, including owners and admin claims', async () => {
    for (const client of [env.authenticatedContext(alice.uid).firestore(), env.authenticatedContext('other').firestore(), env.authenticatedContext(alice.uid, { admin: true }).firestore(), env.unauthenticatedContext().firestore()]) {
      for (const name of ['login_streaks', '_login_streak_state', '_login_streak_receipts']) {
        const ref = doc(client, name, alice.uid);
        await deny(getDoc(ref)); await deny(getDocs(collection(client, name))); await deny(setDoc(ref, { user_id: alice.uid, profile_id: alice.profileId, current_streak: 999 }));
        await deny(updateDoc(ref, { current_streak: 999 })); await deny(deleteDoc(ref));
      }
    }
  });
  console.log(`Login streak: ${groups} backend groups and ${rules} Rules checks passed.`);
} finally { await env.cleanup(); await db.terminate(); }
