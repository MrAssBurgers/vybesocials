import assert from 'node:assert/strict';

// Fail before loading Firebase: synthetic fixtures may only use a demo emulator.
const projectId = process.env.GCLOUD_PROJECT;
assert.match(projectId || '', /^demo-[a-z0-9-]+$/);
assert.notEqual(projectId, 'demo-vybe-preview', 'Do not reset the interactive preview project');
assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):\d+$/);
const { db } = await import('../functions/lib/_shared/admin.js');
const { reportModeration, runReportModeration } = await import('../functions/lib/reportModeration.js');
const { isAttestedReport, reportHash, reportSummary } = await import('../functions/lib/_shared/reportAuthority.js');
const call = (uid, data, token = {}) => reportModeration.run({ auth: uid ? { uid, token } : undefined, data });
let checks = 0;
const check = async (name, run) => { await run(); console.log(`PASS ${name}`); checks++; };
const actor = async name => {
  const value = { uid: `report-qa-${name}`, profileId: `report-qa-profile-${name}` };
  await db.doc(`profiles/${value.profileId}`).set({ user_id: value.uid, username: name });
  await db.doc(`user_auth_index/${value.uid}`).set({ profile_id: value.profileId });
  return value;
};
const staff = async (name, collection = 'user_roles', alias = 'uid', role = 'moderator', enabled = true) => {
  const value = await actor(name);
  const ref = db.doc(`${collection}/report-qa-grant-${name}`);
  await ref.set({ user_id: value[alias], role, ...(enabled === undefined ? {} : { enabled }) });
  return { ...value, grant: ref };
};
const app = async (id, owner, extra = {}) => {
  await db.doc(`mini_app_drafts/${id}`).set({ owner_id: owner.uid, title: 'Private draft', html: '<p>private edits</p>' });
  const row = { id, owner_id: owner.uid, status: 'published', title: 'Synthetic app', description: 'Review without execution', category: 'tool', html: '<script>throw new Error("never execute")</script>', css: 'body{color:red}', javascript: 'window.fixture = true;', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...extra };
  await db.doc(`mini_apps/${id}`).set(row);
  return row;
};
const submit = (owner, requestId, targetType, targetId, extra = {}) => call(owner.uid, { action: 'submit', requestId, targetType, targetId, reason: 'spam', details: 'Synthetic test report', ...extra });
const inspect = (owner, reportId) => call(owner.uid, { action: 'inspect', reportId });
const receipt = (uid, requestId) => db.doc(`_report_requests/${reportHash(uid, requestId)}`);

try {
  const reset = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' });
  assert.ok(reset.ok, 'Demo reset succeeded');
  const alice = await actor('alice'), bob = await actor('bob'), mod = await staff('moderator');
  await app('report-qa-app', bob);
  await db.doc('posts/report-qa-post').set({ author_id: bob.profileId, caption: 'Synthetic post' });
  await db.doc('comments/report-qa-comment').set({ author_id: bob.uid, post_id: 'report-qa-post', content: 'Synthetic comment' });

  await check('callable rejects guests, malformed actions and forged authority fields', async () => {
    await assert.rejects(call(null, { action: 'submit' }), { code: 'unauthenticated' });
    await assert.rejects(call(alice.uid, []), { code: 'invalid-argument' });
    await assert.rejects(call(alice.uid, { action: 'deleteEverything' }), { code: 'invalid-argument' });
    for (const extra of [{ reporter_uid: bob.uid }, { status: 'actioned' }, { target_owner_uid: alice.uid }, { schema_version: 2 }]) {
      await assert.rejects(submit(alice, 'forged', 'post', 'report-qa-post', extra), { code: 'invalid-argument' });
    }
    await assert.rejects(submit(alice, 'bad/code', 'post', 'report-qa-post'), { code: 'invalid-argument' });
    await assert.rejects(submit(alice, 'bad-details', 'post', 'report-qa-post', { details: 'x'.repeat(1001) }), { code: 'invalid-argument' });
    assert.equal((await db.collection('reports').get()).size, 0);
  });

  let submitted;
  await check('concurrent duplicate submits persist exactly one report, proof and receipt', async () => {
    const results = await Promise.all([submit(alice, 'same-submit', 'mini_app', 'report-qa-app'), submit(alice, 'same-submit', 'mini_app', 'report-qa-app')]);
    assert.deepEqual(results[0], results[1]); submitted = results[0];
    const row = (await db.doc(`reports/${submitted.reportId}`).get()).data();
    const proof = (await db.doc(`_report_authority/${submitted.reportId}`).get()).data();
    assert.equal(isAttestedReport(row, proof), true);
    assert.equal(row.reporter_uid, alice.uid); assert.equal(row.reporter_id, alice.profileId);
    assert.equal(row.target_owner_uid, bob.uid); assert.equal(row.target_owner_profile_id, bob.profileId);
    assert.equal(row.status, 'pending'); assert.match(row.target_revision, /^[a-f0-9]{64}$/);
    assert.equal((await db.collection('reports').get()).size, 1);
    assert.equal((await db.collection('_report_audit').get()).size, 1);
    assert.equal((await db.doc(`_report_quotas/${reportHash(alice.uid, 'submit')}`).get()).data().minute_count, 1);
  });

  await check('receipt fingerprint cannot be reused for a different target or action', async () => {
    await assert.rejects(submit(alice, 'same-submit', 'post', 'report-qa-post'), { code: 'already-exists' });
    await assert.rejects(call(mod.uid, { action: 'review', requestId: 'same-mod', reportId: submitted.reportId, status: 'dismissed', note: 'first' }).then(() => call(mod.uid, { action: 'review', requestId: 'same-mod', reportId: submitted.reportId, status: 'reviewed', note: 'first' })), { code: 'already-exists' });
    assert.deepEqual(await submit(alice, 'same-submit', 'mini_app', 'report-qa-app'), submitted);
    assert.equal((await db.doc(`reports/${submitted.reportId}`).get()).data().status, 'dismissed');
  });

  await check('profile aliases resolve canonical ownership and post/comment author identities', async () => {
    const reporter = await actor('aliases');
    for (const [kind, id] of [['profile', bob.uid], ['profile', bob.profileId], ['post', 'report-qa-post'], ['comment', 'report-qa-comment']]) {
      const result = await submit(reporter, `alias-${kind}-${id}`, kind, id);
      const row = (await db.doc(`reports/${result.reportId}`).get()).data();
      assert.equal(row.target_owner_uid, bob.uid); assert.equal(row.target_owner_profile_id, bob.profileId);
      if (kind === 'profile') assert.equal(row.target_id, bob.profileId);
    }
  });

  await check('missing/deleted sources and inconsistent author pairs are rejected without receipts', async () => {
    await db.doc('posts/report-qa-inconsistent').set({ author_id: bob.profileId, user_id: alice.uid });
    await db.doc('posts/report-qa-deleted').set({ author_id: bob.profileId, deleted_at: new Date().toISOString() });
    await db.doc('comments/report-qa-orphan').set({ author_id: bob.profileId, post_id: 'missing-parent' });
    for (const [kind, id, code] of [['post', 'missing', 'not-found'], ['post', 'report-qa-deleted', 'not-found'], ['comment', 'report-qa-orphan', 'not-found'], ['post', 'report-qa-inconsistent', 'failed-precondition']]) {
      await assert.rejects(submit(alice, `reject-${id}`, kind, id), { code });
      assert.equal((await receipt(alice.uid, `reject-${id}`).get()).exists, false);
    }
  });

  await check('broken auth index and ambiguous profile/UID aliases fail closed', async () => {
    const broken = await actor('broken');
    await db.doc(`user_auth_index/${broken.uid}`).set({ profile_id: bob.profileId });
    await assert.rejects(submit(broken, 'broken-index', 'post', 'report-qa-post'), { code: 'failed-precondition' });
    const collision = await actor('collision');
    await db.doc('profiles/report-qa-ambiguous').set({ user_id: collision.profileId });
    await assert.rejects(submit(alice, 'collision-target', 'profile', collision.profileId), { code: 'failed-precondition' });
    await db.doc('user_roles/report-qa-ambiguous-grant').set({ user_id: collision.profileId, role: 'moderator', enabled: true });
    await assert.rejects(call(collision.uid, { action: 'list' }), { code: 'failed-precondition' });
    await db.doc('profiles/report-qa-noncanonical').set({ user_id: bob.uid });
    await assert.rejects(submit(alice, 'noncanonical-target', 'profile', 'report-qa-noncanonical'), { code: 'failed-precondition' });
  });

  await check('staff actions deny ordinary users and stale admin claims alone', async () => {
    for (const action of [{ action: 'list' }, { action: 'count' }, { action: 'inspect', reportId: submitted.reportId }, { action: 'review', requestId: 'forbidden', reportId: submitted.reportId, status: 'dismissed' }]) {
      await assert.rejects(call(alice.uid, action), { code: 'permission-denied' });
      await assert.rejects(call(alice.uid, action, { admin: true }), { code: 'permission-denied' });
    }
  });

  await check('current staff UID and profile grants in either role collection are accepted', async () => {
    for (const collection of ['user_roles', 'user_roles_auth']) for (const alias of ['uid', 'profileId']) {
      const reviewer = await staff(`${collection}-${alias}`, collection, alias, alias === 'uid' ? 'admin' : 'moderator');
      assert.equal((await inspect(reviewer, submitted.reportId)).report.id, submitted.reportId);
    }
    const owner = await staff('flagless-owner', 'user_roles', 'profileId', 'owner');
    await owner.grant.set({ user_id: owner.profileId, role: 'owner' });
    assert.equal((await call(owner.uid, { action: 'count' })).includesLegacy, true);
  });

  await check('disabled and malformed enabled roles deny access, including prior receipt replay', async () => {
    const reviewer = await staff('revoked');
    const operation = { action: 'review', requestId: 'revocation-receipt', reportId: submitted.reportId, status: 'reviewed', note: 'Synthetic review' };
    await call(reviewer.uid, operation);
    await reviewer.grant.update({ enabled: false });
    await assert.rejects(call(reviewer.uid, operation, { admin: true }), { code: 'permission-denied' });
    for (const enabled of ['true', null, 1]) {
      await reviewer.grant.update({ enabled });
      await assert.rejects(call(reviewer.uid, { action: 'list' }), { code: 'permission-denied' });
    }
  });

  await check('legacy flags and mismatched attestation never become verified reports', async () => {
    const row = (await db.doc(`reports/${submitted.reportId}`).get()).data();
    const proof = (await db.doc(`_report_authority/${submitted.reportId}`).get()).data();
    assert.equal(isAttestedReport({ ...row, target_owner_uid: alice.uid }, proof), false);
    assert.equal(isAttestedReport({ ...row, created_at: null }, { ...proof, created_at: null }), false);
    assert.equal(isAttestedReport({ ...row, schema_version: 2, verified: true }, undefined), false);
    assert.equal(reportSummary('different-document', row, proof).verification, 'legacy');
    await db.doc('reports/legacy-forged').set({ schema_version: 2, verified: true, status: 'pending', reporter_uid: bob.uid, content_type: 'mini_app', content_id: 'report-qa-app', reported_user_id: alice.profileId, reason: { poison: true }, details: ['malformed'], created_at: { seconds: 1 } });
    const view = await inspect(mod, 'legacy-forged');
    assert.equal(view.report.verification, 'legacy'); assert.equal(view.report.reporterUid, null); assert.equal(view.report.createdAt, null);
    assert.equal(view.target.ownerUid, bob.uid); assert.equal(view.target.available, true);
    assert.match(view.target.source.html, /never execute/);
    await db.doc('reports/legacy-profile-uid').set({ reported_user_id: bob.uid, status: 'pending', reason: 'spam' });
    const profileLead = await inspect(mod, 'legacy-profile-uid');
    assert.equal(profileLead.target.available, true); assert.equal(profileLead.target.ownerUid, bob.uid);
    assert.equal(profileLead.target.id, profileLead.report.targetId);
  });

  await check('bounded ID pagination covers malformed legacy leads without chronological assumptions', async () => {
    await db.doc('reports/legacy-malformed').set({ target_type: {}, target_id: ['bad'], status: 42, reason: [], description: { broken: true } });
    const ids = []; let cursor;
    do {
      const page = await call(mod.uid, { action: 'list', limit: 2, ...(cursor ? { cursor } : {}) });
      assert.ok(page.reports.length <= 2); ids.push(...page.reports.map(row => row.id)); cursor = page.nextCursor;
    } while (cursor);
    assert.equal(new Set(ids).size, ids.length); assert.deepEqual(ids, [...ids].sort());
    assert.ok(ids.includes('legacy-malformed'));
    const malformed = await inspect(mod, 'legacy-malformed');
    assert.equal(malformed.report.status, 'unknown'); assert.equal(malformed.target.available, false);
    for (const limit of [0, 51, '2', 1.5]) await assert.rejects(call(mod.uid, { action: 'list', limit }), { code: 'invalid-argument' });
  });

  await check('pending count explicitly includes unverified legacy leads', async () => {
    const result = await call(mod.uid, { action: 'count' });
    const actual = await db.collection('reports').where('status', '==', 'pending').get();
    assert.deepEqual(result, { pendingCount: actual.size, includesLegacy: true });
    const page = await call(mod.uid, { action: 'list', status: 'pending', limit: 50 });
    assert.ok(page.reports.some(row => row.id === 'legacy-forged' && row.verification === 'legacy'));
  });

  await check('legacy review creates an immutable action audit but no fabricated authority', async () => {
    const input = { action: 'review', requestId: 'legacy-review', reportId: 'legacy-malformed', status: 'dismissed', note: 'Malformed historical lead' };
    const result = await call(mod.uid, input);
    assert.deepEqual(await call(mod.uid, input), result);
    assert.equal((await db.doc('_report_authority/legacy-malformed').get()).exists, false);
    const audit = (await db.doc(`_report_audit/${reportHash(mod.uid, input.requestId)}`).get()).data();
    assert.equal(audit.verification, 'legacy'); assert.equal(audit.actor_uid, mod.uid); assert.equal(audit.note, input.note);
  });

  let currentView;
  await check('changed and recreated publications require fresh inspection; no-op retains content revision', async () => {
    const stale = await inspect(mod, 'legacy-forged');
    const ref = db.doc('mini_apps/report-qa-app');
    await ref.update({ title: 'Updated publication' });
    await assert.rejects(call(mod.uid, { action: 'removeMiniApp', requestId: 'stale-remove', reportId: 'legacy-forged', expectedRevision: stale.target.revision, note: 'stale' }), { code: 'failed-precondition' });
    const once = await inspect(mod, 'legacy-forged');
    assert.notEqual(stale.target.revision, once.target.revision);
    const beforeNoOp = await ref.get();
    await ref.set(beforeNoOp.data());
    const afterNoOp = await ref.get();
    assert.equal(afterNoOp.updateTime.isEqual(beforeNoOp.updateTime), true, 'Emulator confirms unchanged data is a no-op');
    const unchanged = await inspect(mod, 'legacy-forged');
    assert.equal(once.target.revision, unchanged.target.revision);
    await ref.delete();
    await ref.set(beforeNoOp.data());
    currentView = await inspect(mod, 'legacy-forged');
    assert.notEqual(unchanged.target.revision, currentView.target.revision, 'Deletion/recreation must invalidate inspection even with identical source');
    await assert.rejects(call(mod.uid, { action: 'removeMiniApp', requestId: 'recreated-stale-remove', reportId: 'legacy-forged', expectedRevision: unchanged.target.revision, note: 'stale before recreation' }), { code: 'failed-precondition' });
    assert.equal((await db.doc('_mini_app_moderation/report-qa-app').get()).exists, false);
    assert.equal((await receipt(mod.uid, 'stale-remove').get()).exists, false);
  });

  let removal;
  await check('concurrent removal preserves actual owner/source and atomically applies one hold', async () => {
    const publication = (await db.doc('mini_apps/report-qa-app').get()).data();
    const draft = (await db.doc('mini_app_drafts/report-qa-app').get()).data();
    const input = { action: 'removeMiniApp', requestId: 'remove-once', reportId: 'legacy-forged', expectedRevision: currentView.target.revision, note: 'Reviewed current source; remove test publication' };
    const results = await Promise.all([call(mod.uid, input), call(mod.uid, input)]); removal = results[0];
    assert.deepEqual(results[0], results[1]); assert.equal(removal.holdActive, true);
    assert.equal((await db.doc('mini_apps/report-qa-app').get()).exists, false);
    assert.deepEqual((await db.doc('mini_app_drafts/report-qa-app').get()).data(), draft);
    const hold = (await db.doc('_mini_app_moderation/report-qa-app').get()).data();
    assert.equal(hold.active, true); assert.equal(hold.owner_uid, bob.uid); assert.equal(hold.app_id, 'report-qa-app');
    const audit = (await db.doc(`_report_audit/${reportHash(mod.uid, 'remove-once')}`).get()).data();
    assert.deepEqual(audit.publication, publication); assert.equal(audit.owner_uid, bob.uid); assert.equal(audit.verification, 'legacy');
    assert.equal((await db.doc('reports/legacy-forged').get()).data().status, 'actioned');
    const after = await inspect(mod, 'legacy-forged');
    assert.equal(after.target.available, false); assert.equal(after.target.source, undefined); assert.equal(after.hold.active, true);
  });

  await check('actioned reports cannot be downgraded and release needs an explicit note', async () => {
    await assert.rejects(call(mod.uid, { action: 'review', requestId: 'downgrade', reportId: 'legacy-forged', status: 'dismissed' }), { code: 'failed-precondition' });
    await assert.rejects(call(mod.uid, { action: 'releaseMiniApp', requestId: 'missing-note', appId: 'report-qa-app' }), { code: 'invalid-argument' });
    await assert.rejects(call(alice.uid, { action: 'releaseMiniApp', requestId: 'outsider-release', appId: 'report-qa-app', expectedHoldRevision: reportHash(mod.uid, 'remove-once'), note: 'untrusted' }), { code: 'permission-denied' });
    assert.equal((await db.doc('_mini_app_moderation/report-qa-app').get()).data().active, true);
  });

  await check('release is exactly once, preserves owner binding and never republishes source', async () => {
    const input = { action: 'releaseMiniApp', requestId: 'release-once', appId: 'report-qa-app', expectedHoldRevision: reportHash(mod.uid, 'remove-once'), note: 'Creator may submit a corrected publication' };
    const results = await Promise.all([call(mod.uid, input), call(mod.uid, input)]);
    assert.deepEqual(results[0], results[1]);
    const hold = (await db.doc('_mini_app_moderation/report-qa-app').get()).data();
    assert.equal(hold.active, false); assert.equal(hold.owner_uid, bob.uid); assert.equal(hold.app_id, input.appId); assert.equal(hold.release_note, input.note);
    assert.equal((await db.doc('mini_apps/report-qa-app').get()).exists, false);
    assert.deepEqual(await call(mod.uid, { action: 'removeMiniApp', requestId: 'remove-once', reportId: 'legacy-forged', expectedRevision: currentView.target.revision, note: 'Reviewed current source; remove test publication' }), removal);
    assert.equal((await db.doc('_mini_app_moderation/report-qa-app').get()).data().active, false, 'Old removal replay must not reapply a hold');
  });

  await check('a stale release cannot clear a newer removal hold, even for the same app', async () => {
    await app('report-qa-app', bob);
    const before = await inspect(mod, submitted.reportId);
    const oldHoldRevision = before.hold.revision;
    await call(mod.uid, { action: 'removeMiniApp', requestId: 'remove-second-version', reportId: submitted.reportId, expectedRevision: before.target.revision, note: 'Reviewed second publication' });
    const current = await inspect(mod, submitted.reportId);
    assert.notEqual(current.hold.revision, oldHoldRevision);
    await assert.rejects(call(mod.uid, { action: 'releaseMiniApp', requestId: 'stale-hold-release', appId: 'report-qa-app', expectedHoldRevision: oldHoldRevision, note: 'Stale browser confirmation' }), { code: 'failed-precondition' });
    assert.equal((await receipt(mod.uid, 'stale-hold-release').get()).exists, false);
    assert.equal((await db.doc('_mini_app_moderation/report-qa-app').get()).data().active, true);
    await call(mod.uid, { action: 'releaseMiniApp', requestId: 'release-second-version', appId: 'report-qa-app', expectedHoldRevision: current.hold.revision, note: 'Reviewed the new hold explicitly' });
    assert.equal((await db.doc('mini_apps/report-qa-app').get()).exists, false);
  });

  await check('malformed/rebound holds fail closed and leave current publication intact', async () => {
    await app('report-qa-app', bob);
    const view = await inspect(mod, submitted.reportId);
    for (const hold of [{ active: false }, { version: 1, active: false, app_id: 'other', owner_uid: bob.uid }, { version: 1, active: false, app_id: 'report-qa-app', owner_uid: alice.uid }]) {
      await db.doc('_mini_app_moderation/report-qa-app').set(hold);
      await assert.rejects(call(mod.uid, { action: 'removeMiniApp', requestId: 'malformed-hold', reportId: submitted.reportId, expectedRevision: view.target.revision, note: 'Should not apply' }), { code: 'failed-precondition' });
      assert.equal((await db.doc('mini_apps/report-qa-app').get()).exists, true);
    }
  });

  await check('submission quota is bounded, duplicate receipt replay does not consume it', async () => {
    const limited = await actor('limited');
    const start = Math.floor(Date.now() / 86400000) * 86400000 + 3600000;
    const input = i => ({ action: 'submit', requestId: `quota-${i}`, targetType: 'post', targetId: 'report-qa-post', reason: 'spam' });
    for (let i = 0; i < 5; i++) await runReportModeration(db, limited.uid, input(i), start);
    await runReportModeration(db, limited.uid, input(0), start);
    await assert.rejects(runReportModeration(db, limited.uid, input(5), start), { code: 'resource-exhausted' });
    for (let i = 5; i < 20; i++) await runReportModeration(db, limited.uid, input(i), start + i * 60000);
    await assert.rejects(runReportModeration(db, limited.uid, input(20), start + 30 * 60000), { code: 'resource-exhausted' });
    assert.equal((await db.doc(`_report_quotas/${reportHash(limited.uid, 'submit')}`).get()).data().day_count, 20);
  });

  await check('receipt/audit collision fails without rewriting historical records', async () => {
    const reporter = await actor('collision-receipt');
    const key = reportHash(reporter.uid, 'collision');
    await db.doc(`_report_audit/${key}`).set({ version: 0, preserved: true });
    await assert.rejects(submit(reporter, 'collision', 'post', 'report-qa-post'), { code: 'failed-precondition' });
    assert.equal((await db.doc(`reports/r_${key}`).get()).exists, false);
    assert.deepEqual((await db.doc(`_report_audit/${key}`).get()).data(), { version: 0, preserved: true });
  });

  console.log(`Report authority backend emulator: ${checks} checks passed (real Firestore transactions; no production or provider calls)`);
} finally { await db.terminate(); }
