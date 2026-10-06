import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
assert.equal(process.env.GCLOUD_PROJECT, 'demo-vybe-parental-qa');
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:9494');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9497');
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: process.env.GCLOUD_PROJECT });
const require = createRequire(path.resolve('../qa-tools/package.json'));
const { initializeTestEnvironment, assertFails } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc, deleteDoc } = require('firebase/firestore');
const { db, auth } = await import('../functions/lib/_shared/admin.js');
const { prepareParentalRecovery, applyReviewedParentalRecovery } = await import('../functions/lib/_shared/parentalRecoveryAuthority.js');
const api = await import('../functions/lib/parental.js');
const env = await initializeTestEnvironment({ projectId: process.env.GCLOUD_PROJECT, firestore: { host: '127.0.0.1', port: 9494,
  rules: await readFile('security/safety-settings-authority-candidate.rules', 'utf8') } });
const uid = 'parental-recovery-qa-owner', profileId = 'parental-recovery-qa-profile', reviewer = 'parental-recovery-qa-reviewer';
const salt = '0123456789abcdef0123456789abcdef', sourceRef = db.doc('parental_controls/parental-recovery-qa-legacy');
let created, checks = 0, rulesChecks = 0;
const request = data => ({ auth: { uid, token: { auth_time: Math.floor(Date.now() / 1000) } }, data: { expectedOwnerUid: uid, expectedProfileId: profileId, expectedAccountCreatedAt: created, ...data } });
const check = async (name, run) => { await run(); checks++; console.log('PASS ' + name); };
const original = { user_id: profileId, is_active: true, content_filter_level: 'protected', max_screen_time_minutes: 120, allowed_features: ['feed'],
  pin_salt: salt, pin_hash: createHash('sha256').update(salt + ':1234').digest('hex'), pin_algo: 'sha256-v1', pin_failures: 3, pin_lock_until: 0, created_at: '2020-01-01', private_note: 'preserve' };
const prepare = () => prepareParentalRecovery(db, auth, uid, profileId, sourceRef.id, 'synthetic-independent-history-review');
const apply = plan => applyReviewedParentalRecovery(db, auth, plan, reviewer, plan.review_case);
const clearControls = async () => { const docs = await db.collection('parental_controls').get(); await Promise.all(docs.docs.map(doc => doc.ref.delete())); await sourceRef.set(original); };
try {
  await env.clearFirestore();
  // Clean only our fixed alias fixture if a previous demo run was interrupted.
  try { await auth.deleteUser(profileId); } catch (error) { if (error.code !== 'auth/user-not-found') throw error; }
  for (const userId of [uid, reviewer]) { try { await auth.deleteUser(userId); } catch (error) { if (error.code !== 'auth/user-not-found') throw error; } await auth.createUser({ uid: userId }); }
  await auth.setCustomUserClaims(reviewer, { admin: true }); created = Date.parse((await auth.getUser(uid)).metadata.creationTime);
  await db.doc(`profiles/${profileId}`).set({ user_id: uid });
  await db.doc(`_account_profile_bindings/${uid}`).set({ version: 1, owner_uid: uid, profile_id: profileId, auth_created_at_ms: created, status: 'active', revision: 'a'.repeat(48) });
  await clearControls();
  await check('unreviewed historical source remains blocked by the actual safe reader', async () => {
    await assert.rejects(api.getParentalControlsSafe.run(request({})), { code: 'failed-precondition' }); assert.deepEqual((await sourceRef.get()).data(), original);
  });
  let plan, competingPlan;
  await check('preparation performs no Firebase writes and exposes no PIN material', async () => {
    const before = (await sourceRef.get()).updateTime.toMillis(); plan = await prepare(); assert.equal(plan.status, 'review-required');
    assert.doesNotMatch(JSON.stringify(plan), /pin_hash|pin_salt|private_note/); assert.equal((await sourceRef.get()).updateTime.toMillis(), before);
  });
  await check('unprivileged reviewer cannot bind, reset or archive controls', async () => {
    await auth.setCustomUserClaims(reviewer, { admin: false }); await assert.rejects(apply(plan), { code: 'permission-denied' });
    assert.equal((await db.doc(`parental_controls/${uid}`).get()).exists, false); await auth.setCustomUserClaims(reviewer, { admin: true });
  });
  await check('real transaction preserves and archives source while normal PIN unlock resumes', async () => {
    assert.deepEqual(await apply(plan), { ok: true, replayed: false }); assert.equal((await sourceRef.get()).exists, false);
    const current = (await db.doc(`parental_controls/${uid}`).get()).data(); assert.equal(current.pin_hash, original.pin_hash); assert.equal(current.pin_failures, 3); assert.equal(current.created_at, original.created_at); assert.equal(current.private_note, original.private_note);
    const archive = await db.collection('_parental_controls_archive').get(); assert.equal(archive.size, 1); assert.deepEqual(archive.docs[0].data().source_row, original);
    assert.equal((await api.getParentalControlsSafe.run(request({}))).controls.has_pin, true); assert.equal((await api.verifyParentalPin.run(request({ pin: '1234' }))).ok, true);
  });
  await check('lost-result replay does not reset attempts or repeat migration', async () => {
    await db.doc(`parental_controls/${uid}`).update({ pin_failures: 5, pin_lock_until: Date.now() + 60000 }); const before = (await db.doc(`parental_controls/${uid}`).get()).data();
    assert.deepEqual(await apply(plan), { ok: true, replayed: true }); assert.deepEqual((await db.doc(`parental_controls/${uid}`).get()).data(), before);
  });
  await check('source changes stale a prepared plan without partially writing a target', async () => {
    await clearControls(); const stale = await prepare(); await sourceRef.update({ max_screen_time_minutes: 60 });
    await assert.rejects(apply(stale), { code: 'failed-precondition' }); assert.equal((await db.doc(`parental_controls/${uid}`).get()).exists, false); assert.equal((await sourceRef.get()).data().max_screen_time_minutes, 60);
  });
  await check('competing identical approvals converge on one durable receipt', async () => {
    await clearControls(); const shared = await prepare(); competingPlan = shared; const results = await Promise.all([apply(shared), apply(shared)]);
    assert.equal(results.filter(result => result.replayed).length, 1); assert.equal((await sourceRef.get()).exists, false);
  });
  await check('a later control change cannot be overwritten by approval replay', async () => {
    const next = await db.doc(`parental_controls/${uid}`).get(); const saved = next.data();
    await next.ref.update({ content_filter_level: 'moderate' }); const receipts = await db.collection('_parental_recovery_receipts').get(); assert.ok(receipts.size >= 2);
    await assert.rejects(apply(competingPlan), { code: 'failed-precondition' }); assert.equal((await next.ref.get()).data().content_filter_level, 'moderate'); assert.equal((await next.ref.get()).data().pin_hash, saved.pin_hash);
  });
  await check('actual operator CLI prepares private output then applies and replays the reviewed case', async () => {
    await clearControls(); const file = path.resolve('work', `parental-review-cli-${randomUUID()}.json`);
    const run = promisify(execFile); const base = ['scripts/review-parental-recovery.mjs', '--project=demo-vybe-parental-qa'];
    const prepared = await run(process.execPath, [...base, '--action=prepare', `--uid=${uid}`, `--profile-id=${profileId}`, `--source-id=${sourceRef.id}`, '--review-case=synthetic-cli-independent-review', `--output=${file}`], { env: process.env });
    assert.equal(JSON.parse(prepared.stdout).writesToFirebase, false); const output = JSON.parse(await readFile(file, 'utf8')); assert.equal(output.status, 'review-required');
    const applied = await run(process.execPath, [...base, '--action=apply', `--plan=${file}`, `--reviewer-uid=${reviewer}`, '--confirmed-case=synthetic-cli-independent-review'], { env: process.env }); assert.equal(JSON.parse(applied.stdout).pinReset, false);
    const repeated = await run(process.execPath, [...base, '--action=apply', `--plan=${file}`, `--reviewer-uid=${reviewer}`, '--confirmed-case=synthetic-cli-independent-review'], { env: process.env }); assert.equal(JSON.parse(repeated.stdout).replayed, true);
  });
  await check('owner, other and admin clients cannot read or write recovery evidence', async () => {
    const archive = (await db.collection('_parental_controls_archive').get()).docs[0], receipt = (await db.collection('_parental_recovery_receipts').get()).docs[0];
    for (const [actor, claims] of [[uid, {}], ['parental-recovery-qa-other', {}], [reviewer, { admin: true }]]) {
      for (const path of [archive.ref.path, receipt.ref.path]) { const ref = doc(env.authenticatedContext(actor, claims).firestore(), path);
        for (const op of [() => getDoc(ref), () => setDoc(ref, { approved: true }), () => updateDoc(ref, { reviewed_by: actor }), () => deleteDoc(ref)]) { await assertFails(op()); rulesChecks++; }
      }
    }
  });
  await check('active Auth profile alias blocks ownership recovery until the conflict is reviewed', async () => {
    await clearControls(); await auth.createUser({ uid: profileId });
    await assert.rejects(prepare(), { code: 'failed-precondition' }); assert.deepEqual((await sourceRef.get()).data(), original); await auth.deleteUser(profileId);
  });
  await check('current Auth recreation invalidates the prepared target incarnation', async () => {
    await clearControls(); const pending = await prepare(); await auth.deleteUser(uid); await auth.createUser({ uid });
    assert.notEqual(Date.parse((await auth.getUser(uid)).metadata.creationTime), created); await assert.rejects(apply(pending), { code: 'failed-precondition' }); assert.deepEqual((await sourceRef.get()).data(), original);
  });
  console.log(JSON.stringify({ groupedChecks: checks, rulesChecks, project: process.env.GCLOUD_PROJECT, compiledOperatorHelpers: true, productionWrites: false, httpAdmissionCertified: false }));
} finally { await env.cleanup(); }
