/**
 * Notify the safety inbox when a user submits a content/user report.
 * Supports Guideline 1.2 — developer acts on reports within 24 hours.
 */
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { defineSecret } from 'firebase-functions/params';
import { db } from './_shared/admin.js';

const RESEND_API_KEY = defineSecret('RESEND_API_KEY');
const EMAIL_FROM = defineSecret('EMAIL_FROM');

const SAFETY_INBOX =
  process.env.SAFETY_REPORT_EMAIL ||
  process.env.VYBE_SAFETY_EMAIL ||
  'vybesocial.info@gmail.com';

const RESEND_URL = 'https://api.resend.com/emails';

async function sendSafetyEmail(payload: {
  subject: string;
  text: string;
  html: string;
}): Promise<void> {
  const key = RESEND_API_KEY.value() || process.env.RESEND_API_KEY;
  if (!key) {
    console.warn('[onReportCreated] RESEND_API_KEY missing — skip email');
    return;
  }
  const from = EMAIL_FROM.value() || process.env.EMAIL_FROM || 'VYBE <no-reply@vybehub.app>';
  const res = await fetch(RESEND_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [SAFETY_INBOX],
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
    }),
  });
  if (!res.ok) {
    console.error('[onReportCreated] Resend failed', res.status, await res.text());
  }
}

export const onReportCreated = onDocumentCreated(
  {
    document: 'reports/{reportId}',
    region: 'us-central1',
    secrets: [RESEND_API_KEY, EMAIL_FROM],
    cpu: 0.083,
    concurrency: 1,
    memory: '256MiB',
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const data = snap.data() as Record<string, unknown>;
    const reportId = event.params.reportId as string;

    // Mark for admin queue visibility
    try {
      await snap.ref.set(
        {
          status: data.status || 'pending',
          notified_at: new Date().toISOString(),
        },
        { merge: true },
      );
    } catch (err) {
      console.warn('[onReportCreated] status merge failed', err);
    }

    const reason = String(data.reason || 'unspecified');
    const reporterId = String(data.reporter_id || '');
    const reportedUserId = String(data.reported_user_id || '');
    const postId = data.post_id ? String(data.post_id) : '';
    const commentId = data.comment_id ? String(data.comment_id) : '';

    const subject = `[VYBE] New report — ${reason} (${reportId.slice(0, 8)})`;
    const text = [
      'A user submitted a safety report.',
      `Report ID: ${reportId}`,
      `Reason: ${reason}`,
      `Reporter: ${reporterId}`,
      `Reported user: ${reportedUserId || 'n/a'}`,
      `Post: ${postId || 'n/a'}`,
      `Comment: ${commentId || 'n/a'}`,
      '',
      'Review in Admin → Reports within 24 hours.',
      'https://vybehub.app/admin',
    ].join('\n');

    const html = `<p>A user submitted a safety report.</p>
<ul>
<li><b>Report ID:</b> ${reportId}</li>
<li><b>Reason:</b> ${reason}</li>
<li><b>Reporter:</b> ${reporterId}</li>
<li><b>Reported user:</b> ${reportedUserId || 'n/a'}</li>
<li><b>Post:</b> ${postId || 'n/a'}</li>
<li><b>Comment:</b> ${commentId || 'n/a'}</li>
</ul>
<p>Review in <a href="https://vybehub.app/admin">Admin → Reports</a> within 24 hours.</p>`;

    await sendSafetyEmail({ subject, text, html });

    // Optional: stamp a lightweight admin alert doc for dashboard badge
    try {
      await db.collection('admin_alerts').add({
        type: 'content_report',
        report_id: reportId,
        reason,
        created_at: new Date().toISOString(),
        read: false,
      });
    } catch {
      /* non-fatal */
    }
  },
);
