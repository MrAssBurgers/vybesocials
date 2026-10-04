import assert from 'node:assert/strict';
// This fixture uses real local transactions and an injected email transport.
// It never calls an email provider or resets a preview/production database.
const projectId = process.env.GCLOUD_PROJECT;
assert.ok(['demo-vybe-creators', 'demo-vybe-report-qa'].includes(projectId));
assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):\d+$/);
const { db } = await import('../functions/lib/_shared/admin.js');
const { deliverReportNotification, reportDeliveryId } = await import('../functions/lib/_shared/reportNotificationDelivery.js');
const { isAttestedReport } = await import('../functions/lib/_shared/reportAuthority.js');
const prefix = `notify-${Date.now()}`;
const config = { from: 'qa@example.test', to: 'safety@example.test' };
const immutable = ['reporter_uid', 'reporter_id', 'target_type', 'target_id', 'target_owner_uid', 'target_owner_profile_id', 'reason', 'details', 'created_at', 'target_revision'];
let checks = 0;
const check = async (name, run) => { await run(); checks++; console.log(`PASS ${name}`); };
const seed = async (name, extra = {}, verified = true) => {
  const id = `${prefix}-${name}`;
  const row = { id, schema_version: 2, reporter_uid: 'notification-alice', reporter_id: 'notification-alice-profile', target_type: 'profile', target_id: 'notification-bob-profile', target_owner_uid: 'notification-bob', target_owner_profile_id: 'notification-bob-profile', reason: 'other', details: '<script>untrusted</script>', created_at: new Date().toISOString(), target_revision: null, status: 'pending', ...extra };
  const proof = { version: 1, report_id: id, ...Object.fromEntries(immutable.map(key => [key, row[key]])) };
  await db.doc(`reports/${id}`).set(row);
  if (verified) { assert.ok(isAttestedReport(row, proof)); await db.doc(`_report_authority/${id}`).set(proof); }
  return id;
};
const state = id => db.doc(`report_notification_deliveries/${reportDeliveryId(id)}`);
const alert = id => db.doc(`admin_alerts/report-${reportDeliveryId(id)}`);
try {
  await check('legacy and conflicting proof never send or create trusted alerts', async () => {
    const id = await seed('unverified', {}, false); let sends = 0;
    assert.equal(await deliverReportNotification(db, id, config, async () => { sends++; return 'fake'; }), 'unverified');
    assert.equal((await alert(id).get()).exists, false);
    const second = await seed('conflict'); await db.doc(`reports/${second}`).update({ reporter_uid: 'forged' });
    assert.equal(await deliverReportNotification(db, second, config, async () => { sends++; return 'fake'; }), 'unverified');
    assert.equal(sends, 0);
  });
  await check('confirmed provider acceptance is durable and never overwrites review status or read state', async () => {
    const id = await seed('accepted', { status: 'reviewed', reviewed_by: 'moderator', reviewed_at: '2026-01-01T00:00:00.000Z' }); let sends = 0;
    const send = async () => { sends++; return 'email-id'; };
    assert.equal(await deliverReportNotification(db, id, config, send), 'accepted');
    await alert(id).update({ read: true });
    assert.equal(await deliverReportNotification(db, id, config, send), 'accepted');
    assert.equal(sends, 1); assert.equal((await state(id).get()).data().provider_id, 'email-id');
    assert.equal((await alert(id).get()).data().read, true);
    assert.equal((await db.doc(`reports/${id}`).get()).data().status, 'reviewed');
    assert.equal((await db.doc(`reports/${id}`).get()).data().notified_at, undefined);
  });
  await check('failure retries preserve the exact provider payload and key despite config changes', async () => {
    const id = await seed('retry'); const attempts = [];
    await assert.rejects(deliverReportNotification(db, id, config, async (email, key) => { attempts.push({ email, key }); throw new Error('uncertain provider response'); }));
    assert.equal((await state(id).get()).data().status, 'retryable');
    assert.equal((await state(id).get()).data().accepted_at, undefined);
    await deliverReportNotification(db, id, { from: 'changed@example.test', to: 'changed@example.test' }, async (email, key) => { attempts.push({ email, key }); return 'accepted-retry'; });
    assert.deepEqual(attempts[0], attempts[1]);
    assert.equal((await alert(id).get()).data().delivery_status, 'accepted');
  });
  await check('missing provider config is not stamped as sent and can recover later', async () => {
    const id = await seed('unconfigured');
    await assert.rejects(deliverReportNotification(db, id, config, undefined));
    assert.equal((await state(id).get()).data().first_attempt_at, undefined);
    assert.equal((await state(id).get()).data().status, 'unconfigured');
    assert.equal((await alert(id).get()).exists, true);
    assert.equal(await deliverReportNotification(db, id, config, async () => 'configured-now'), 'accepted');
  });
  await check('active lease rejects concurrent delivery without a second provider call', async () => {
    const id = await seed('concurrent'); let release; let started; let sends = 0;
    const gate = new Promise(resolve => { release = resolve; });
    const entered = new Promise(resolve => { started = resolve; });
    const first = deliverReportNotification(db, id, config, async () => { sends++; started(); await gate; return 'first'; });
    await entered;
    try { await assert.rejects(deliverReportNotification(db, id, config, async () => { sends++; return 'second'; }), /already in progress/); }
    finally { release(); }
    await first; assert.equal(sends, 1);
  });
  await check('expired worker lease retries with the original provider identity', async () => {
    const id = await seed('lease'); const start = Date.now(); let original;
    await assert.rejects(deliverReportNotification(db, id, config, async (email, key) => { original = { email, key }; throw new Error('lost'); }, () => start));
    await state(id).update({ status: 'sending', lease_until: start + 90_000 });
    await deliverReportNotification(db, id, config, async (email, key) => { assert.deepEqual({ email, key }, original); return 'recovered'; }, () => start + 90_001);
  });
  await check('uncertain sends stop before provider deduplication expires and remain visible for review', async () => {
    const id = await seed('old'); const start = Date.now(); let sends = 0;
    await assert.rejects(deliverReportNotification(db, id, config, async () => { sends++; throw new Error('uncertain'); }, () => start));
    assert.equal(await deliverReportNotification(db, id, config, async () => { sends++; return 'unexpected'; }, () => start + 23 * 60 * 60 * 1000), 'needs_review');
    assert.equal(sends, 1); assert.equal((await alert(id).get()).data().delivery_status, 'needs_review');
    assert.equal((await state(id).get()).data().accepted_at, undefined);
  });
  await check('empty provider acknowledgement is retryable, never accepted', async () => {
    const id = await seed('missing-ack'); await assert.rejects(deliverReportNotification(db, id, config, async () => ''));
    assert.equal((await state(id).get()).data().status, 'retryable');
  });
  console.log(`Report notification backend: ${checks} checks passed (real Firestore transactions; email transport stubbed; no provider access)`);
} finally { await db.terminate(); }
