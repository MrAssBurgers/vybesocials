import { createHash, randomUUID } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { isAttestedReport } from './reportAuthority.js';

export interface ReportEmail { from: string; to: string[]; subject: string; text: string; html: string }
export type ReportEmailSender = (email: ReportEmail, idempotencyKey: string) => Promise<string>;
const LEASE_MS = 90_000;
// Resend retains idempotency keys for 24 hours. Stop uncertain retries before
// that boundary rather than claiming exactly-once delivery beyond it.
const RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;
const boundedText = (value: unknown, limit = 500) => typeof value === 'string' ? value.slice(0, limit) : '';
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
export const reportDeliveryId = (reportId: string) => createHash('sha256').update(reportId).digest('hex');

export function reportEmail(reportId: string, row: Record<string, unknown>, config: { from: string; to: string }): ReportEmail {
  const fields = [
    ['Report ID', boundedText(reportId, 1500)], ['Reason', boundedText(row.reason)],
    ['Details', boundedText(row.details, 2000)], ['Reporter', boundedText(row.reporter_id, 1500)],
    ['Target type', boundedText(row.target_type, 40)], ['Target ID', boundedText(row.target_id, 1500)],
  ];
  return {
    from: config.from, to: [config.to],
    subject: `[VYBE] New safety report (${reportDeliveryId(reportId).slice(0, 12)})`,
    text: ['A safety report is available in the review queue.', ...fields.map(([label, value]) => `${label}: ${value || 'n/a'}`), '', 'Review the actual content in Admin → Reports.', 'https://vybehub.app/admin'].join('\n'),
    html: `<p>A safety report is available in the review queue.</p><ul>${fields.map(([label, value]) => `<li><b>${label}:</b> ${escapeHtml(value || 'n/a')}</li>`).join('')}</ul><p>Review the actual content in <a href="https://vybehub.app/admin">Admin → Reports</a>.</p>`,
  };
}

/** Real Firestore leases/receipts; injectable transport is used only by tests. */
export async function deliverReportNotification(
  database: Firestore, reportId: string, config: { from: string; to: string },
  send: ReportEmailSender | undefined, now = Date.now,
): Promise<'accepted' | 'unverified' | 'needs_review'> {
  const id = reportDeliveryId(reportId);
  const reportRef = database.doc(`reports/${reportId}`);
  const authorityRef = database.doc(`_report_authority/${reportId}`);
  const deliveryRef = database.doc(`report_notification_deliveries/${id}`);
  const alertRef = database.doc(`admin_alerts/report-${id}`);
  const lease = randomUUID();
  const claimed = await database.runTransaction(async transaction => {
    const [report, authority, delivery, alert] = await transaction.getAll(reportRef, authorityRef, deliveryRef, alertRef);
    const row = report.data();
    if (!row || row.id !== reportId || !isAttestedReport(row, authority.data())) return { kind: 'unverified' as const };
    const state = delivery.data(); const time = now();
    if (state?.status === 'accepted') return { kind: 'accepted' as const };
    if (state?.status === 'needs_review') return { kind: 'needs_review' as const };
    if (state?.status === 'sending' && state.lease_until > time) return { kind: 'busy' as const };
    if (!alert.exists) transaction.create(alertRef, { type: 'content_report', report_id: reportId,
      reason: boundedText(row.reason), created_at: row.created_at, read: false });
    if (!send) {
      transaction.set(deliveryRef, { status: 'unconfigured', report_id: reportId, updated_at: new Date(time).toISOString() }, { merge: true });
      return { kind: 'unconfigured' as const };
    }
    if (typeof state?.first_attempt_at === 'number' && time - state.first_attempt_at >= RETRY_WINDOW_MS) {
      transaction.set(deliveryRef, { status: 'needs_review', lease_until: 0, updated_at: new Date(time).toISOString() }, { merge: true });
      transaction.set(alertRef, { delivery_status: 'needs_review' }, { merge: true });
      return { kind: 'needs_review' as const };
    }
    const email = (state?.email as ReportEmail | undefined) || reportEmail(reportId, row, config);
    const key = `report/${id}`;
    transaction.set(deliveryRef, { report_id: reportId, status: 'sending', email,
      idempotency_key: key, first_attempt_at: state?.first_attempt_at ?? time,
      lease, lease_until: time + LEASE_MS, updated_at: new Date(time).toISOString() }, { merge: true });
    return { kind: 'claimed' as const, email, key };
  });
  if (claimed.kind === 'unconfigured') throw new Error('Safety notification provider is not configured. Report remains in the review queue.');
  if (claimed.kind === 'busy') throw new Error('Safety notification delivery is already in progress.');
  if (claimed.kind !== 'claimed') return claimed.kind;
  try {
    const providerId = await send!(claimed.email, claimed.key);
    if (typeof providerId !== 'string' || !providerId || providerId.length > 200) throw new Error('Notification provider did not acknowledge the request.');
    await database.runTransaction(async transaction => {
      const current = await transaction.get(deliveryRef);
      if (current.data()?.status === 'accepted') return;
      // An expired lease can have another worker, but both use the same fixed
      // provider key/payload; either acknowledgement is valid inside the window.
      transaction.set(deliveryRef, { status: 'accepted', provider_id: providerId,
        accepted_at: new Date(now()).toISOString(), lease_until: 0 }, { merge: true });
      transaction.set(alertRef, { delivery_status: 'accepted' }, { merge: true });
    });
    return 'accepted';
  } catch {
    await database.runTransaction(async transaction => {
      const current = await transaction.get(deliveryRef);
      if (current.data()?.lease === lease && current.data()?.status !== 'accepted') {
        transaction.set(deliveryRef, { status: 'retryable', lease_until: 0,
          last_error: 'provider_or_acknowledgement_unavailable', updated_at: new Date(now()).toISOString() }, { merge: true });
      }
    });
    throw new Error('Safety notification was not confirmed. Report remains in the review queue.');
  }
}
