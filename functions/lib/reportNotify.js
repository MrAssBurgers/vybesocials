/** Notify the existing safety inbox without altering moderation decisions. */
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { defineSecret } from 'firebase-functions/params';
import { db } from './_shared/admin.js';
import { deliverReportNotification } from './_shared/reportNotificationDelivery.js';
const RESEND_API_KEY = defineSecret('RESEND_API_KEY');
const EMAIL_FROM = defineSecret('EMAIL_FROM');
const SAFETY_INBOX = process.env.SAFETY_REPORT_EMAIL || process.env.VYBE_SAFETY_EMAIL || 'vybesocial.info@gmail.com';
async function sendSafetyEmail(email, idempotencyKey, key) {
    const response = await fetch('https://api.resend.com/emails', {
        method: 'POST', signal: AbortSignal.timeout(20_000),
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify(email),
    });
    if (!response.ok)
        throw new Error(`Safety notification provider returned HTTP ${response.status}.`);
    const body = await response.json();
    if (typeof body.id !== 'string' || !body.id)
        throw new Error('Safety notification acknowledgement is missing.');
    return body.id;
}
export const onReportCreated = onDocumentCreated({
    document: 'reports/{reportId}', region: 'us-central1', secrets: [RESEND_API_KEY, EMAIL_FROM],
    cpu: 0.083, concurrency: 1, memory: '256MiB', retry: true,
}, async (event) => {
    if (!event.data)
        return;
    const key = RESEND_API_KEY.value() || process.env.RESEND_API_KEY;
    const result = await deliverReportNotification(db, event.params.reportId, {
        from: EMAIL_FROM.value() || process.env.EMAIL_FROM || 'VYBE <no-reply@vybehub.app>', to: SAFETY_INBOX,
    }, key ? (email, idempotencyKey) => sendSafetyEmail(email, idempotencyKey, key) : undefined);
    if (result === 'needs_review')
        console.warn('[onReportCreated] Delivery requires operator review; automatic retries stopped before provider deduplication expires.');
});
//# sourceMappingURL=reportNotify.js.map