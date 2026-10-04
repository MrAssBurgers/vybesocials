import assert from 'node:assert/strict';

// Only the root's dedicated synthetic emulator may execute or reset fixtures.
const projectId = process.env.GCLOUD_PROJECT;
assert.ok(['demo-vybe-creators', 'demo-vybe-creator-qa'].includes(projectId), 'Use only the dedicated creator QA project');
assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):\d+$/);
const port = Number(process.env.FIRESTORE_EMULATOR_HOST.split(':').at(-1));
assert.ok(port > 0 && port < 65536 && port !== 8280, 'Do not reset the interactive preview Firestore');
const { db } = await import('../functions/lib/_shared/admin.js');
const { reportModeration } = await import('../functions/lib/reportModeration.js');
const { isAttestedReport, reportHash } = await import('../functions/lib/_shared/reportAuthority.js');
const { messageEvidenceHash } = await import('../functions/lib/_shared/messageReportEvidence.js');
let checks = 0;
const check = async (name, run) => { await run(); console.log(`PASS ${name}`); checks++; };
const call = (uid, data) => reportModeration.run({ auth: uid ? { uid, token: {} } : undefined, data });
const actor = async name => {
  const value = { uid: `message-report-${name}`, profileId: `message-report-profile-${name}` };
  await db.doc(`profiles/${value.profileId}`).set({ user_id: value.uid, username: name });
  await db.doc(`user_auth_index/${value.uid}`).set({ profile_id: value.profileId });
  return value;
};
const submit = (reporter, id, requestId = 'submit') => call(reporter.uid, { action: 'submit', requestId, targetType: 'message', targetId: id, reason: 'harassment', details: 'Synthetic message report' });
const inspect = (staff, reportId) => call(staff.uid, { action: 'inspect', reportId });
const fixture = async name => {
  const reporter = await actor(`${name}-reporter`), sender = await actor(`${name}-sender`);
  const cid = `message-report-conversation-${name}`, id = `message-report-message-${name}`;
  const parent = db.doc(`conversations/${cid}`), message = db.doc(`messages/${id}`);
  await parent.set({ id: cid, member_ids: [reporter.profileId, sender.profileId], created_by: reporter.profileId, is_group: false });
  const row = { id, conversation_id: cid, sender_id: sender.profileId, content: `Synthetic message ${name}`, message_type: 'text', media_url: null, created_at: new Date().toISOString(), is_deleted: false };
  await message.set(row);
  return { reporter, sender, cid, id, parent, message, row };
};
const stored = async reportId => {
  const [report, authority, evidence] = await Promise.all(['reports', '_report_authority', '_message_report_evidence'].map(name => db.doc(`${name}/${reportId}`).get()));
  return { report: report.data(), authority: authority.data(), evidence: evidence.data() };
};
const rejectedWithoutWrites = async (f, code, requestId = 'submit') => {
  await assert.rejects(submit(f.reporter, f.id, requestId), { code });
  const key = reportHash(f.reporter.uid, requestId);
  for (const path of [`reports/r_${key}`, `_report_authority/r_${key}`, `_message_report_evidence/r_${key}`, `_report_requests/${key}`, `_report_audit/${key}`]) assert.equal((await db.doc(path).get()).exists, false, path);
  assert.equal((await db.doc(`_report_quotas/${reportHash(f.reporter.uid, 'submit')}`).get()).exists, false);
};

try {
  const reset = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' });
  assert.ok(reset.ok, 'Dedicated demo reset succeeded');
  const mod = await actor('moderator');
  const grant = db.doc('user_roles/message-report-staff');
  await grant.set({ user_id: mod.uid, role: 'moderator', enabled: true });

  await check('canonical participant captures exact bounded text privately with report/proof/hash binding', async () => {
    const f = await fixture('snapshot');
    const content = '<script>do not execute</script> ' + 'x'.repeat(9000);
    await f.message.update({ content, media_url: 'https://private.invalid/image?token=never-disclose', media_type: 'image', secret: 'unrelated-secret' });
    const response = await submit(f.reporter, f.id);
    const saved = await stored(response.reportId);
    assert.equal(isAttestedReport(saved.report, saved.authority), true);
    assert.equal(saved.report.message_evidence_hash, messageEvidenceHash(saved.evidence));
    assert.equal(saved.evidence.content, content.slice(0, 8000)); assert.equal(saved.evidence.content_truncated, true);
    assert.equal(saved.evidence.reporter_uid, f.reporter.uid); assert.equal(saved.evidence.sender_uid, f.sender.uid);
    assert.equal(saved.evidence.conversation_id, f.cid); assert.equal(saved.evidence.captured_at, saved.report.created_at);
    assert.equal(saved.evidence.source_revision, saved.report.target_revision);
    assert.equal(JSON.stringify(saved).includes('never-disclose'), false); assert.equal(JSON.stringify(saved).includes('unrelated-secret'), false);
    assert.equal(JSON.stringify(saved.report).includes(content.slice(0, 100)), false);
    const viewed = await inspect(mod, response.reportId);
    assert.equal(viewed.target.caption, null); assert.equal(viewed.target.available, true);
    assert.equal(viewed.target.messageEvidence.content, content.slice(0, 8000));
    assert.equal(viewed.target.messageEvidence.hasMedia, true); assert.equal(viewed.target.messageEvidence.mediaType, 'image');
    assert.equal(viewed.target.messageEvidence.capturedAt, saved.report.created_at);
    assert.equal(JSON.stringify(viewed).includes('never-disclose'), false);
    await assert.rejects(inspect(f.reporter, response.reportId), { code: 'permission-denied' });
  });

  await check('UID parent aliases and legitimate group schema are supported', async () => {
    const f = await fixture('uid-group');
    await f.parent.set({ member_ids: [f.reporter.uid, f.sender.uid], type: 'group', created_by: f.sender.uid });
    await f.message.update({ sender_id: f.sender.uid, author_id: f.sender.profileId });
    const result = await submit(f.reporter, f.id);
    assert.equal((await stored(result.reportId)).evidence.sender_profile_id, f.sender.profileId);
  });

  await check('Unicode truncation survives Firestore encoding with its exact evidence hash', async () => {
    const f = await fixture('unicode');
    await f.message.update({ content: 'a'.repeat(7999) + '😀', message_type: 'a'.repeat(63) + '😀', media_type: 'a'.repeat(79) + '😀' });
    const response = await submit(f.reporter, f.id);
    const saved = await stored(response.reportId);
    assert.equal(saved.evidence.content.length, 7999); assert.equal(saved.evidence.content_truncated, true);
    assert.equal(saved.report.message_evidence_hash, messageEvidenceHash(saved.evidence));
    const viewed = await inspect(mod, response.reportId);
    assert.equal(viewed.target.available, true); assert.equal(viewed.target.messageEvidence.content.length, 7999);
  });

  await check('canonical flat member proof validates both stored identities', async () => {
    const f = await fixture('flat');
    await f.parent.update({ member_ids: [f.sender.profileId] });
    const ref = db.doc(`conversation_members/${f.cid}_${f.reporter.profileId}`);
    await ref.set({ user_id: f.sender.profileId, conversation_id: f.cid });
    await rejectedWithoutWrites(f, 'permission-denied');
    await ref.set({ user_id: f.reporter.profileId, conversation_id: 'different-conversation' });
    await rejectedWithoutWrites(f, 'permission-denied');
    await ref.set({ user_id: f.reporter.profileId, conversation_id: f.cid });
    assert.equal((await submit(f.reporter, f.id)).success, true);
  });

  await check('nested member proof uses the scoped path and rejects a mismatched conversation', async () => {
    const f = await fixture('nested');
    await f.parent.update({ member_ids: [f.sender.profileId] });
    const ref = db.doc(`conversations/${f.cid}/members/${f.reporter.uid}`);
    await ref.set({ user_id: f.reporter.uid, conversation_id: 'other' });
    await rejectedWithoutWrites(f, 'permission-denied');
    await ref.set({ user_id: f.reporter.uid });
    assert.equal((await submit(f.reporter, f.id)).success, true);
  });

  await check('legacy random membership and creator hints cannot grant reporting access', async () => {
    const f = await fixture('random-member');
    await f.parent.update({ member_ids: [f.sender.profileId], created_by: f.reporter.profileId });
    await db.doc('conversation_members/message-report-random-row').set({ user_id: f.reporter.profileId, conversation_id: f.cid, role: 'admin' });
    await rejectedWithoutWrites(f, 'permission-denied');
  });

  await check('orphan messages, mismatched parents and deleted conversations fail without mutations', async () => {
    const f = await fixture('parent');
    await f.parent.delete();
    await db.doc(`conversation_members/${f.cid}_${f.reporter.uid}`).set({ user_id: f.reporter.uid, conversation_id: f.cid });
    await rejectedWithoutWrites(f, 'permission-denied');
    await f.parent.set({ id: 'another', member_ids: [f.reporter.uid, f.sender.uid] });
    await rejectedWithoutWrites(f, 'failed-precondition');
    await f.parent.update({ id: f.cid, deleted_at: new Date().toISOString() });
    await rejectedWithoutWrites(f, 'permission-denied');
  });

  await check('removed membership cannot create a new report; explicit left flags fail closed', async () => {
    const f = await fixture('removed');
    await f.parent.update({ member_ids: [f.sender.profileId] });
    await rejectedWithoutWrites(f, 'permission-denied');
    await f.parent.update({ member_ids: [f.reporter.profileId, f.sender.profileId] });
    await db.doc(`conversation_members/${f.cid}_${f.reporter.uid}`).set({ user_id: f.reporter.uid, conversation_id: f.cid, left_at: new Date().toISOString() });
    await rejectedWithoutWrites(f, 'permission-denied');
  });

  await check('conflicting sender aliases, nonparticipant senders and self reports fail closed', async () => {
    const f = await fixture('sender');
    await f.message.update({ author_id: f.reporter.uid });
    await rejectedWithoutWrites(f, 'failed-precondition');
    await f.message.set({ ...f.row, sender_id: f.reporter.profileId });
    await rejectedWithoutWrites(f, 'invalid-argument');
    const stranger = await actor('sender-stranger');
    await f.message.set({ ...f.row, sender_id: stranger.profileId });
    await rejectedWithoutWrites(f, 'permission-denied');
  });

  await check('protected send provenance must match message, sender and conversation', async () => {
    const f = await fixture('send-audit');
    const ref = db.doc(`dm_send_audit/${f.id}`);
    const audit = { message_id: f.id, conversation_id: f.cid, sender_id: f.sender.profileId, auth_uid: f.sender.uid };
    for (const patch of [{ message_id: 'other' }, { conversation_id: 'other' }, { sender_id: f.reporter.profileId }, { auth_uid: f.reporter.uid }]) {
      await ref.set({ ...audit, ...patch }); await rejectedWithoutWrites(f, 'failed-precondition');
    }
    await ref.set(audit);
    await f.parent.update({ member_ids: [f.reporter.profileId] });
    assert.equal((await submit(f.reporter, f.id)).success, true, 'retained message from former sender with protected proof');
  });

  await check('missing, unsent, deleted, expired and malformed messages never create evidence', async () => {
    const f = await fixture('unavailable');
    await f.message.delete(); await rejectedWithoutWrites(f, 'not-found');
    for (const patch of [{ is_deleted: true }, { deleted: true }, { deleted_at: new Date().toISOString() }, { is_unsent: true }, { unsent_at: new Date().toISOString() }, { expires_at: '2000-01-01T00:00:00.000Z' }, { content: '', media_url: null }]) {
      await f.message.set({ ...f.row, ...patch }); await rejectedWithoutWrites(f, 'not-found');
    }
    for (const patch of [{ content: {} }, { text: 'conflicting' }, { id: 'other' }, { expires_at: 'not-a-date' }, { conversation_id: '../bad' }]) {
      await f.message.set({ ...f.row, ...patch }); await rejectedWithoutWrites(f, 'failed-precondition');
    }
  });

  await check('explicitly kept expired messages retain their reportable content', async () => {
    const f = await fixture('kept');
    await f.message.update({ expires_at: '2000-01-01T00:00:00.000Z', saved_by_recipient: true });
    assert.equal((await submit(f.reporter, f.id)).success, true);
  });

  await check('concurrent duplicate submissions create exactly one evidence snapshot and quota charge', async () => {
    const f = await fixture('duplicate');
    const [first, second] = await Promise.all([submit(f.reporter, f.id), submit(f.reporter, f.id)]);
    assert.deepEqual(first, second);
    const key = reportHash(f.reporter.uid, 'submit');
    assert.equal((await db.doc(`_message_report_evidence/r_${key}`).get()).exists, true);
    assert.equal((await db.doc(`_report_quotas/${reportHash(f.reporter.uid, 'submit')}`).get()).data().minute_count, 1);
    await f.message.update({ content: 'Edited after report', edited_at: new Date().toISOString() });
    assert.deepEqual(await submit(f.reporter, f.id), first);
    assert.equal((await inspect(mod, first.reportId)).target.messageEvidence.content, f.row.content);
    await assert.rejects(submit(f.reporter, 'different-message'), { code: 'already-exists' });
  });

  await check('later unsend and reporter departure preserve only the original receipt and evidence', async () => {
    const f = await fixture('retained');
    const result = await submit(f.reporter, f.id);
    await f.message.delete(); await f.parent.update({ member_ids: [f.sender.profileId] });
    assert.deepEqual(await submit(f.reporter, f.id), result);
    assert.deepEqual(Object.keys(result).sort(), ['reportId', 'status', 'success']);
    assert.equal((await inspect(mod, result.reportId)).target.messageEvidence.content, f.row.content);
    await assert.rejects(submit(f.reporter, f.id, 'new-attempt'), { code: 'not-found' });
    await f.message.set(f.row);
    await assert.rejects(submit(f.reporter, f.id, 'new-attempt'), { code: 'permission-denied' });
  });

  await check('concurrent edits capture one complete committed version, never mixed caller evidence', async () => {
    const f = await fixture('edit-race');
    await f.message.update({ content: 'Version A', message_type: 'text' });
    const [result] = await Promise.all([submit(f.reporter, f.id), f.message.update({ content: 'Version B', message_type: 'system', edited_at: new Date().toISOString() })]);
    const evidence = (await inspect(mod, result.reportId)).target.messageEvidence;
    assert.ok(evidence.content === 'Version A' && evidence.messageType === 'text' || evidence.content === 'Version B' && evidence.messageType === 'system');
    const saved = await stored(result.reportId);
    assert.equal(saved.report.message_evidence_hash, messageEvidenceHash(saved.evidence));
  });

  await check('concurrent unsend either preserves the previously captured version or rejects without a receipt', async () => {
    const f = await fixture('unsend-race');
    const [outcome] = await Promise.allSettled([submit(f.reporter, f.id), f.message.update({ is_deleted: true, content: null, media_url: null })]);
    if (outcome.status === 'fulfilled') assert.equal((await inspect(mod, outcome.value.reportId)).target.messageEvidence.content, f.row.content);
    else { assert.equal(outcome.reason.code, 'not-found'); assert.equal((await db.doc(`_report_requests/${reportHash(f.reporter.uid, 'submit')}`).get()).exists, false); }
  });

  await check('unverified legacy message leads never inspect private messages or fabricated evidence', async () => {
    const f = await fixture('legacy');
    const reportId = 'message-report-legacy';
    await db.doc(`reports/${reportId}`).set({ id: reportId, schema_version: 2, target_type: 'message', target_id: f.id, reporter_uid: f.reporter.uid, target_owner_uid: f.sender.uid, status: 'pending', reason: 'spam' });
    await db.doc(`_message_report_evidence/${reportId}`).set({ content: 'Forged snapshot', target_id: f.id });
    const viewed = await inspect(mod, reportId);
    assert.equal(viewed.report.verification, 'legacy'); assert.equal(viewed.target.available, false);
    assert.equal(viewed.target.messageEvidence, undefined); assert.equal(viewed.target.caption, null);
    assert.equal(JSON.stringify(viewed).includes(f.row.content), false);
  });

  await check('missing or tampered evidence and mismatched proof hashes never disclose content', async () => {
    const f = await fixture('tamper');
    const result = await submit(f.reporter, f.id);
    const evidenceRef = db.doc(`_message_report_evidence/${result.reportId}`);
    const original = (await evidenceRef.get()).data();
    for (const patch of [{ content: 'Injected private data' }, { report_id: 'another' }, { sender_uid: f.reporter.uid }, { conversation_id: 'another' }, { content: 'a'.repeat(8001) }]) {
      await evidenceRef.set({ ...original, ...patch });
      const viewed = await inspect(mod, result.reportId);
      assert.equal(viewed.target.available, false); assert.equal(viewed.target.messageEvidence, undefined);
    }
    await evidenceRef.delete(); assert.equal((await inspect(mod, result.reportId)).target.available, false);
    await evidenceRef.set(original);
    await db.doc(`reports/${result.reportId}`).update({ message_evidence_hash: '0'.repeat(64) });
    const viewed = await inspect(mod, result.reportId);
    assert.equal(viewed.report.verification, 'legacy'); assert.equal(viewed.target.messageEvidence, undefined);
  });

  await check('evidence identity collision aborts report, quota, audit and receipt atomically', async () => {
    const f = await fixture('collision');
    const key = reportHash(f.reporter.uid, 'submit');
    await db.doc(`_message_report_evidence/r_${key}`).set({ legacy: true });
    await assert.rejects(submit(f.reporter, f.id), { code: 'failed-precondition' });
    for (const path of [`reports/r_${key}`, `_report_authority/r_${key}`, `_report_requests/${key}`, `_report_audit/${key}`, `_report_quotas/${reportHash(f.reporter.uid, 'submit')}`]) assert.equal((await db.doc(path).get()).exists, false);
  });

  await check('message reports reject caller evidence and remain review-only for moderators', async () => {
    const f = await fixture('review-only');
    for (const extra of [{ conversationId: f.cid }, { senderId: f.sender.uid }, { content: 'Caller allegation' }, { messageEvidence: {} }]) {
      await assert.rejects(call(f.reporter.uid, { action: 'submit', requestId: 'submit', targetType: 'message', targetId: f.id, reason: 'spam', ...extra }), { code: 'invalid-argument' });
    }
    const result = await submit(f.reporter, f.id);
    await call(mod.uid, { action: 'review', requestId: 'message-review', reportId: result.reportId, status: 'reviewed' });
    assert.equal((await f.message.get()).exists, true);
    await assert.rejects(call(mod.uid, { action: 'removeMiniApp', requestId: 'message-remove', reportId: result.reportId, expectedRevision: 'a'.repeat(64), note: 'Must not delete messages' }), { code: 'failed-precondition' });
    await grant.update({ enabled: false });
    await assert.rejects(inspect(mod, result.reportId), { code: 'permission-denied' });
    await grant.update({ enabled: true });
  });
  console.log(`Message reporting backend: ${checks} checks passed.`);
} finally { await db.terminate(); }
