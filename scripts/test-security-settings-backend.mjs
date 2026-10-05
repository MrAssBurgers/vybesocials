import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
assert.equal(process.env.GCLOUD_PROJECT, 'demo-vybe-contacts-qa');
assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):\d+$/);
assert.match(process.env.FIREBASE_AUTH_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):\d+$/);
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: process.env.GCLOUD_PROJECT });
const { db, auth } = await import('../functions/lib/_shared/admin.js');
const { manageSignInPreferences: settings } = await import('../functions/lib/_shared/signInPreferencesAuthority.js');
const { revokeAccountSessions: revoke } = await import('../functions/lib/_shared/sessionRevocationAuthority.js');
let checks = 0;
const check = async (name, fn) => { await fn(); checks++; console.log(`PASS ${name}`); };
const uid = () => `security-${randomUUID()}`;
const read = owner => settings(db, owner, { action: 'read', expectedOwnerUid: owner });
const change = (owner, before, field, value = false, requestId = randomUUID()) => ({ action: 'update', expectedOwnerUid: owner, expectedRevision: before.revision, patch: { [field]: value }, requestId });
function fixture() {
  const owner = uid(), signedIn = Math.floor(Date.now() / 1000) - 10;
  const user = { uid: owner, disabled: false, metadata: { creationTime: new Date(Date.now() - 120_000).toISOString() }, tokensValidAfterTime: new Date(Date.now() - 60_000).toISOString() };
  const provider = { calls: 0, hook: null, failRead: false,
    async getUser() { if (this.failRead) { this.failRead = false; throw Error('transient Auth read'); } return structuredClone(user); },
    async revokeRefreshTokens() { this.calls++; user.tokensValidAfterTime = new Date(Math.floor(Date.now() / 1000) * 1000).toISOString(); if (this.hook) await this.hook(); },
  };
  const request = { expectedOwnerUid: owner, expectedAuthTime: signedIn, requestId: randomUUID(), all: true, confirmation: 'all-devices' };
  const run = () => revoke(db, provider, owner, signedIn, request);
  return { owner, user, provider, request, run, signedIn };
}
async function device(owner, id = randomUUID(), extra = {}) {
  const ref = db.doc(`user_sessions/${id}`);
  await ref.set({ user_id: owner, created_at: new Date(Date.now() - 30_000).toISOString(), last_seen_at: new Date().toISOString(), revoked_at: null, trusted: true, ...extra });
  return ref;
}
try {
  await check('read is canonical, strictly typed and does not initialize settings', async () => {
    const owner = uid(), result = await read(owner);
    assert.equal(result.revision, 'missing'); assert.deepEqual(result.settings, { email_2fa_enabled: false, login_approvals_enabled: false });
    assert.deepEqual(result.capabilities, { enableEmailConfirmation: false, enableLoginApprovals: false });
    assert.equal((await db.doc(`user_2fa_settings/${owner}`).get()).exists, false);
    await assert.rejects(settings(db, owner, { action: 'read', expectedOwnerUid: 'other' }));
    await db.doc(`user_2fa_settings/${owner}`).set({ user_id: owner, email_2fa_enabled: 'false' }); await assert.rejects(read(owner));
    await db.doc(`user_2fa_settings/${owner}`).set({ user_id: 'other', email_2fa_enabled: true }); await assert.rejects(read(owner));
  });
  await check('disable changes only the selected flag and checked retries preserve concurrent preferences', async () => {
    const owner = uid(), ref = db.doc(`user_2fa_settings/${owner}`);
    await ref.set({ user_id: owner, email_2fa_enabled: true, login_approvals_enabled: true, legacy: 'preserve', backup_codes_hashed: ['opaque-legacy'] });
    const before = await read(owner), request = change(owner, before, 'email_2fa_enabled');
    const saved = await settings(db, owner, request);
    assert.equal(saved.phase, 'applied'); assert.equal(saved.settings.email_2fa_enabled, false); assert.equal(saved.settings.login_approvals_enabled, true);
    assert.notEqual(saved.revision, before.revision); assert.equal((await ref.get()).data().legacy, 'preserve');
    await ref.update({ login_approvals_enabled: false });
    const replay = await settings(db, owner, request); assert.equal(replay.settings.login_approvals_enabled, false);
    await ref.update({ email_2fa_enabled: true }); assert.equal((await settings(db, owner, request)).phase, 'superseded');
    await assert.rejects(settings(db, owner, { ...request, patch: { login_approvals_enabled: false } }));
    await ref.delete(); assert.equal((await settings(db, owner, request)).phase, 'superseded');
  });
  await check('activation, malformed patches and stale revisions fail without changing saved flags', async () => {
    const owner = uid(), before = await read(owner);
    for (const request of [change(owner, before, 'email_2fa_enabled', true), change(owner, before, 'login_approvals_enabled', true), change(owner, before, 'email_2fa_enabled', 'false'), { ...change(owner, before, 'email_2fa_enabled'), patch: { email_2fa_enabled: false, login_approvals_enabled: false } }, { ...change(owner, before, 'email_2fa_enabled'), expectedRevision: 'old' }]) await assert.rejects(settings(db, owner, request));
    assert.equal((await db.doc(`user_2fa_settings/${owner}`).get()).exists, false);
  });
  await check('concurrent setting writers cannot overwrite each other from one revision', async () => {
    const owner = uid(), before = await read(owner);
    const results = await Promise.allSettled(['email_2fa_enabled', 'login_approvals_enabled'].map(field => settings(db, owner, change(owner, before, field))));
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(results.find(result => result.status === 'rejected').reason.code, 'aborted');
  });
  await check('single-device, foreign-owner and stale-auth requests never revoke global Auth credentials', async () => {
    const f = fixture();
    for (const request of [{ sessionId: 'one' }, { ...f.request, sessionId: 'one' }, { ...f.request, all: false }, { ...f.request, expectedOwnerUid: 'other' }, { ...f.request, expectedAuthTime: f.signedIn - 1 }, { ...f.request, confirmation: 'yes' }]) await assert.rejects(revoke(db, f.provider, f.owner, f.signedIn, request));
    for (const authTime of [undefined, '123', f.signedIn - 600, Math.floor(Date.now() / 1000) + 30]) await assert.rejects(revoke(db, f.provider, f.owner, authTime, f.request));
    assert.equal(f.provider.calls, 0);
  });
  await check('global receipt confirms cutoff, marks only unchanged eligible owned rows, and replays once', async () => {
    const f = fixture(), eligible = await device(f.owner), updated = await device(f.owner), other = await device('other');
    f.provider.hook = async () => { await updated.update({ last_seen_at: 'changed-after-request' }); await device(f.owner, 'new-' + randomUUID()); };
    const result = await f.run();
    assert.equal(result.scope, 'all-refresh-tokens'); assert.equal(result.existingAccessMayContinue, true); assert.equal(result.trackedSessionsMarked, 1);
    assert.ok(Date.parse(result.revokedBefore) > f.signedIn * 1000); assert.ok((await eligible.get()).data().revoked_at);
    assert.equal((await updated.get()).data().revoked_at, null); assert.equal((await other.get()).data().revoked_at, null);
    assert.deepEqual(await f.run(), result); assert.equal(f.provider.calls, 1);
    await assert.rejects(revoke(db, f.provider, f.owner, f.signedIn + 1, f.request)); assert.equal(f.provider.calls, 1);
  });
  await check('lost Auth response reconciles the same request without repeating revocation', async () => {
    const f = fixture(); f.provider.hook = async () => { f.provider.failRead = true; throw Error('lost response after revocation'); };
    await assert.rejects(f.run(), { code: 'unavailable' });
    const result = await f.run(); assert.equal(result.ok, true); assert.equal(f.provider.calls, 1);
  });
  await check('unconfirmed Auth failure stays explicit and retries do not revoke a later sign-in', async () => {
    const f = fixture(); f.provider.revokeRefreshTokens = async () => { f.provider.calls++; throw Error('provider unavailable'); };
    await assert.rejects(f.run(), { code: 'unavailable' }); await assert.rejects(f.run(), { code: 'unavailable' }); assert.equal(f.provider.calls, 1);
    await db.doc(`_auth_session_revocations/${f.owner}_${f.request.requestId}`).update({ lease_until: Date.now() - 1 });
    await assert.rejects(f.run(), { code: 'failed-precondition' }); assert.equal(f.provider.calls, 1);
  });
  await check('concurrent identical revoke requests issue at most one Auth mutation', async () => {
    const f = fixture(); const results = await Promise.allSettled([f.run(), f.run(), f.run()]);
    assert.ok(results.some(result => result.status === 'fulfilled')); assert.equal(f.provider.calls, 1); assert.equal((await f.run()).ok, true);
  });
  await check('deleted/recreated or disabled accounts cannot redeem earlier revoke receipts', async () => {
    const f = fixture(); await f.run(); f.user.tokensValidAfterTime = 'invalid'; await assert.rejects(f.run()); f.user.metadata.creationTime = 'replacement-account';
    await assert.rejects(f.run()); f.user.disabled = true; await assert.rejects(f.run()); assert.equal(f.provider.calls, 1);
  });
  await check('tracked-device bounds reject before a global Auth mutation', async () => {
    const f = fixture(), batch = db.batch();
    for (let i = 0; i < 201; i++) batch.set(db.doc(`user_sessions/${f.owner}-${i}`), { user_id: f.owner, revoked_at: null, created_at: new Date().toISOString() });
    await batch.commit(); await assert.rejects(f.run(), { code: 'resource-exhausted' }); assert.equal(f.provider.calls, 0);
  });
  await check('real Auth emulator confirms an account-wide cutoff with the checked contract', async () => {
    const owner = uid(); await auth.createUser({ uid: owner, email: `${owner}@example.test` });
    const authTime = Math.floor(Date.now() / 1000);
    const result = await revoke(db, auth, owner, authTime, { all: true, confirmation: 'all-devices', expectedOwnerUid: owner, expectedAuthTime: authTime, requestId: randomUUID() });
    assert.equal(result.authTime, authTime);
    assert.equal(result.ok, true); assert.equal(Date.parse(result.revokedBefore), Date.parse((await auth.getUser(owner)).tokensValidAfterTime));
  });
  await check('rules deny old direct preference writes, foreign reads, and every private receipt', async () => {
    const require = createRequire(path.resolve(process.env.FIREBASE_TEST_TOOLS_ROOT, 'package.json'));
    const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
    const { getDoc, getDocs, doc, collection, setDoc, updateDoc, deleteDoc } = require('firebase/firestore');
    const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
    const env = await initializeTestEnvironment({ projectId: process.env.GCLOUD_PROJECT, firestore: { host, port: Number(port), rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8') } });
    const owner = uid(); await db.doc(`user_2fa_settings/${owner}`).set({ user_id: owner, email_2fa_enabled: true });
    const privateNames = ['_sign_in_preference_receipts', '_sign_in_preference_limits', '_auth_session_revocations', '_auth_session_revoke_limits'];
    for (const name of privateNames) await db.doc(`${name}/${owner}`).set({ owner_uid: owner });
    try {
      for (const actor of [env.authenticatedContext(owner), env.authenticatedContext('other'), env.authenticatedContext('staff', { admin: true }), env.unauthenticatedContext()]) {
        const target = doc(actor.firestore(), 'user_2fa_settings', owner);
        await assertFails(setDoc(target, { email_2fa_enabled: false })); await assertFails(updateDoc(target, { login_approvals_enabled: true })); await assertFails(deleteDoc(target));
        for (const name of privateNames) { await assertFails(getDoc(doc(actor.firestore(), name, owner))); await assertFails(getDocs(collection(actor.firestore(), name))); await assertFails(setDoc(doc(actor.firestore(), name, owner), { owner_uid: owner })); }
      }
      await assertSucceeds(getDoc(doc(env.authenticatedContext(owner).firestore(), 'user_2fa_settings', owner)));
      await assertFails(getDoc(doc(env.authenticatedContext('other').firestore(), 'user_2fa_settings', owner)));
    } finally { await env.cleanup(); }
  });
  console.log(`Security settings backend/rules: ${checks} groups passed. Isolated emulator only.`);
} finally { await db.terminate(); }
