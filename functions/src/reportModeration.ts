import { onCall, HttpsError } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import { db, requireAuth } from './_shared/admin.js';
import {
  assertReportFields, holdSummary, inspectReport, listReports, readReport,
  reportActor, reportHash, reportId, reportQuota, reportRequestId, reportStaff,
  reportTarget, reportText, targetIdentity, REPORT_REASONS, type ReportTargetType,
} from './_shared/reportAuthority.js';
import { captureMessageEvidence, messageEvidenceHash, messageReportTarget } from './_shared/messageReportEvidence.js';

type Input = Record<string, unknown>;
const mutationFields = {
  submit: ['requestId', 'targetType', 'targetId', 'reason', 'details'],
  review: ['requestId', 'reportId', 'status', 'note'],
  removeMiniApp: ['requestId', 'reportId', 'expectedRevision', 'note'],
  releaseMiniApp: ['requestId', 'appId', 'expectedHoldRevision', 'note'],
};

function mutationInput(input: Input) {
  const action = input.action as keyof typeof mutationFields;
  assertReportFields(input, mutationFields[action]);
  const requestId = reportRequestId(input.requestId);
  if (action === 'submit') {
    if (!['profile', 'post', 'comment', 'mini_app', 'message'].includes(String(input.targetType)) || !REPORT_REASONS.includes(input.reason as typeof REPORT_REASONS[number])) throw new HttpsError('invalid-argument', 'Choose a supported report target and reason');
    return { action, requestId, targetType: input.targetType as ReportTargetType, targetId: reportId(input.targetId), reason: input.reason as string, details: reportText(input.details, 1000) };
  }
  const note = reportText(input.note, 1000, action !== 'review');
  if (action === 'releaseMiniApp') {
    if (typeof input.expectedHoldRevision !== 'string' || !/^[a-f0-9]{64}$/.test(input.expectedHoldRevision)) throw new HttpsError('invalid-argument', 'Inspect the current moderation hold before releasing it');
    return { action, requestId, appId: reportId(input.appId), expectedHoldRevision: input.expectedHoldRevision, note };
  }
  const report = reportId(input.reportId);
  if (action === 'review') {
    if (!['reviewed', 'dismissed'].includes(String(input.status))) throw new HttpsError('invalid-argument', 'Choose reviewed or dismissed');
    return { action, requestId, reportId: report, status: input.status as 'reviewed' | 'dismissed', note };
  }
  if (typeof input.expectedRevision !== 'string' || !/^[a-f0-9]{64}$/.test(input.expectedRevision)) throw new HttpsError('invalid-argument', 'Inspect the current mini app before removing it');
  return { action, requestId, reportId: report, expectedRevision: input.expectedRevision, note };
}

/** All actor, target, receipt, hold and quota reads precede all writes. */
export async function runReportModeration(database: Firestore, uid: string, input: Input, now = Date.now()): Promise<unknown> {
  const action = input.action;
  if (action === 'moderationCount' || action === 'deletionHistory') {
    assertReportFields(input, []);
    await database.runTransaction(async tx => {
      await reportStaff(tx, database, uid);
      const writeQuota = await reportQuota(tx, database, uid, 'read', now);
      writeQuota();
    });
    let result: unknown;
    if (action === 'moderationCount') {
      const counts = await Promise.all(['reports', 'content_flags', 'content_appeals', 'bug_reports'].map(async table =>
        (await database.collection(table).where('status', '==', 'pending').count().get()).data().count));
      result = { pendingCount: counts.reduce((total, count) => total + count, 0), includesLegacy: true };
    } else {
      const rows = await database.collection('post_deletion_log').orderBy('created_at', 'desc').limit(100).get();
      result = { entries: rows.docs.map(doc => {
        const row = doc.data();
        return { id: doc.id, caption: typeof row.caption === 'string' ? row.caption.slice(0, 1000) : '',
          reason: typeof row.reason === 'string' ? row.reason.slice(0, 1000) : '',
          created_at: typeof row.created_at === 'string' ? row.created_at : null };
      }) };
    }
    // A role revoked during the aggregate/history read must not expose the response.
    await database.runTransaction(tx => reportStaff(tx, database, uid));
    return result;
  }
  if (action === 'list' || action === 'inspect' || action === 'count') {
    assertReportFields(input, action === 'list' ? ['cursor', 'limit', 'status'] : action === 'inspect' ? ['reportId'] : []);
    if (action === 'count') {
      await database.runTransaction(async tx => {
        await reportStaff(tx, database, uid);
        const writeQuota = await reportQuota(tx, database, uid, 'read', now);
        writeQuota();
      });
      const count = (await database.collection('reports').where('status', '==', 'pending').count().get()).data().count;
      // Aggregate queries are not part of Firestore transactions. Recheck access
      // after this bounded response so a revoked role cannot return private data.
      await database.runTransaction(tx => reportStaff(tx, database, uid));
      return { pendingCount: count, includesLegacy: true };
    }
    return database.runTransaction(async tx => {
      await reportStaff(tx, database, uid);
      const writeQuota = await reportQuota(tx, database, uid, 'read', now);
      const result = action === 'list' ? await listReports(tx, database, input) : await inspectReport(tx, database, reportId(input.reportId));
      writeQuota();
      return result;
    });
  }
  if (typeof action !== 'string' || !Object.hasOwn(mutationFields, action)) throw new HttpsError('invalid-argument', 'Unknown moderation action');
  const operation = mutationInput(input);
  const key = reportHash(uid, operation.requestId);
  const fingerprint = reportHash(operation);
  const time = new Date(now).toISOString();
  return database.runTransaction(async tx => {
    // A receipt proves what happened, not current permission to read/replay it.
    const actor = operation.action === 'submit' ? await reportActor(tx, database, uid) : await reportStaff(tx, database, uid);
    const receiptRef = database.doc(`_report_requests/${key}`);
    const receipt = (await tx.get(receiptRef)).data();
    if (receipt) {
      if (receipt.version !== 1 || receipt.actor_uid !== uid || receipt.fingerprint !== fingerprint || receipt.action !== operation.action) throw new HttpsError('already-exists', 'This request identity was already used for another action');
      return receipt.result;
    }
    const writeQuota = await reportQuota(tx, database, uid, operation.action === 'submit' ? 'submit' : 'moderate', now);
    const auditRef = database.doc(`_report_audit/${key}`);
    if ((await tx.get(auditRef)).exists) throw new HttpsError('failed-precondition', 'Moderation receipt needs review');
    let result: Record<string, unknown>;
    let evidence: Record<string, unknown> = {};
    // Stage writes only after the operation has completed all of its reads.
    let writeAction: () => void;
    if (operation.action === 'submit') {
      const target = operation.targetType === 'message'
        ? await messageReportTarget(tx, database, operation.targetId!, actor, id => targetIdentity(tx, database, id), now)
        : await reportTarget(tx, database, operation.targetType!, operation.targetId!);
      const id = `r_${key}`;
      const reportRef = database.doc(`reports/${id}`);
      const authorityRef = database.doc(`_report_authority/${id}`);
      const [existing, proof] = await Promise.all([tx.get(reportRef), tx.get(authorityRef)]);
      if (existing.exists || proof.exists) throw new HttpsError('failed-precondition', 'Report identity needs review');
      const messageEvidence = target.type === 'message' ? captureMessageEvidence(target, id, actor, time) : null;
      const messageEvidenceRef = messageEvidence ? database.doc(`_message_report_evidence/${id}`) : null;
      if (messageEvidenceRef && (await tx.get(messageEvidenceRef)).exists) throw new HttpsError('failed-precondition', 'Message evidence identity needs review');
      const immutable = {
        reporter_uid: actor.uid, reporter_id: actor.profileId,
        target_type: target.type, target_id: target.id,
        target_owner_uid: target.owner.uid, target_owner_profile_id: target.owner.profileId,
        reason: operation.reason!, details: operation.details!, created_at: time, target_revision: target.revision,
        ...(messageEvidence ? { message_evidence_hash: messageEvidenceHash(messageEvidence) } : {}),
      };
      result = { success: true, reportId: id, status: 'pending' };
      evidence = { report_id: id, target_type: target.type, target_id: target.id };
      writeAction = () => {
        tx.create(reportRef, { schema_version: 2, id, ...immutable, status: 'pending', reviewed_at: null, reviewed_by: null, admin_notes: '' });
        tx.create(authorityRef, { version: 1, report_id: id, ...immutable });
        if (messageEvidence && messageEvidenceRef) tx.create(messageEvidenceRef, messageEvidence);
      };
    } else if (operation.action === 'review') {
      const report = await readReport(tx, database, operation.reportId!);
      if (report.summary.status === 'actioned') throw new HttpsError('failed-precondition', 'A removal record cannot be downgraded to a review');
      result = { success: true, reportId: operation.reportId, status: operation.status };
      evidence = { report_id: operation.reportId, previous_status: report.summary.status, status: operation.status, verification: report.summary.verification, note: operation.note };
      writeAction = () => { tx.update(report.snapshot.ref, { status: operation.status, reviewed_at: time, reviewed_by: actor.uid, admin_notes: operation.note }); };
    } else if (operation.action === 'removeMiniApp') {
      const report = await readReport(tx, database, operation.reportId!);
      if (report.summary.targetType !== 'mini_app' || !report.summary.targetId) throw new HttpsError('failed-precondition', 'This report does not identify a mini app');
      const app = await reportTarget(tx, database, 'mini_app', report.summary.targetId);
      if (app.revision !== operation.expectedRevision) throw new HttpsError('failed-precondition', 'The mini app changed. Inspect its current version before removing it.');
      const holdRef = database.doc(`_mini_app_moderation/${app.id}`);
      const priorHold = (await tx.get(holdRef)).data();
      const prior = holdSummary(priorHold, app.id);
      if (prior && (prior.active || priorHold!.owner_uid !== app.owner.uid)) throw new HttpsError('failed-precondition', 'Moderation hold needs review');
      // Preserve the actual stored publication, not caller-submitted source or
      // an old report's owner. Unusually large legacy rows need operator review.
      if (Buffer.byteLength(JSON.stringify(app.row), 'utf8') > 700000) throw new HttpsError('failed-precondition', 'This legacy publication needs operator review');
      result = { success: true, reportId: operation.reportId, appId: app.id, status: 'actioned', holdActive: true };
      evidence = { report_id: operation.reportId, app_id: app.id, owner_uid: app.owner.uid, revision: app.revision, publication: app.row, note: operation.note, verification: report.summary.verification };
      writeAction = () => {
        tx.set(holdRef, { version: 1, app_id: app.id, owner_uid: app.owner.uid, active: true, revision: app.revision, removed_at: time, removed_by_uid: actor.uid, removed_by_profile_id: actor.profileId, note: operation.note, audit_id: key });
        tx.delete(app.snapshot.ref);
        tx.update(report.snapshot.ref, { status: 'actioned', reviewed_at: time, reviewed_by: actor.uid, admin_notes: operation.note });
      };
    } else {
      const holdRef = database.doc(`_mini_app_moderation/${operation.appId!}`);
      const hold = (await tx.get(holdRef)).data();
      const summary = holdSummary(hold, operation.appId!);
      if (!summary?.active) throw new HttpsError('failed-precondition', 'This mini app has no active moderation hold');
      if (summary.revision !== operation.expectedHoldRevision) throw new HttpsError('failed-precondition', 'The moderation hold changed. Inspect it again before releasing it.');
      result = { success: true, appId: operation.appId, holdActive: false };
      evidence = { app_id: operation.appId, owner_uid: hold!.owner_uid, previous_audit_id: hold!.audit_id || null, note: operation.note };
      writeAction = () => { tx.update(holdRef, { active: false, released_at: time, released_by_uid: actor.uid, release_note: operation.note }); };
    }
    writeAction();
    tx.create(auditRef, { version: 1, id: key, action: operation.action, actor_uid: actor.uid, actor_profile_id: actor.profileId, created_at: time, ...evidence });
    tx.create(receiptRef, { version: 1, actor_uid: actor.uid, action: operation.action, fingerprint, result, created_at: time });
    writeQuota();
    return result;
  });
}

export const reportModeration = onCall({ region: 'us-central1', memory: '256MiB', timeoutSeconds: 60, cors: true, invoker: 'public' }, async request => {
  const uid = requireAuth(request);
  if (!request.data || typeof request.data !== 'object' || Array.isArray(request.data)) throw new HttpsError('invalid-argument', 'A report action is required');
  return runReportModeration(db, uid, request.data);
});
