/**
 * Email functions — Resend-backed transactional + auth + queue processor.
 * Secrets: RESEND_API_KEY, EMAIL_FROM (e.g. "VYBE <no-reply@vybehub.app>")
 */
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db, requireAuth, requireAdmin, auth, rateLimit, enforceRateLimit } from './_shared/admin.js';
import crypto from 'node:crypto';

const RESEND_URL = 'https://api.resend.com/emails';

function fromAddr(): string {
  return process.env.EMAIL_FROM || 'VYBE <no-reply@vybehub.app>';
}

function resendKey(): string {
  const k = process.env.RESEND_API_KEY;
  if (!k) throw new HttpsError('failed-precondition', 'RESEND_API_KEY not configured');
  return k;
}

async function sendViaResend(payload: {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: string;
  reply_to?: string;
  headers?: Record<string, string>;
}) {
  // Suppression check
  const recipients = Array.isArray(payload.to) ? payload.to : [payload.to];
  const suppressed = await Promise.all(
    recipients.map((e) => db.collection('suppressed_emails').doc(e.toLowerCase()).get()),
  );
  const filtered = recipients.filter((_, i) => !suppressed[i].exists);
  if (!filtered.length) return { ok: true, skipped: 'all_suppressed' };

  const res = await fetch(RESEND_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: payload.from || fromAddr(),
      to: filtered,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
      reply_to: payload.reply_to,
      headers: payload.headers,
    }),
  });
  if (!res.ok) throw new HttpsError('internal', `Resend ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return { ok: true, id: data.id };
}

function unsubLink(email: string): string {
  const secret = process.env.UNSUBSCRIBE_SECRET || 'change-me';
  const token = crypto.createHmac('sha256', secret).update(email.toLowerCase()).digest('hex').slice(0, 32);
  const base = process.env.PUBLIC_SITE_URL || 'https://vybehub.app';
  return `${base}/api/email-unsubscribe?e=${encodeURIComponent(email)}&t=${token}`;
}

const TEMPLATES: Record<string, (vars: Record<string, any>) => { subject: string; html: string; text: string }> = {
  reset_password: (v) => ({
    subject: 'Reset your VYBE password',
    html: `<p>Hi ${v.name || 'there'},</p><p>Reset your password: <a href="${v.link}">${v.link}</a></p><p>Link expires in 1 hour.</p>`,
    text: `Reset your password: ${v.link}`,
  }),
  welcome: (v) => ({
    subject: 'Welcome to VYBE',
    html: `<h1>Welcome ${v.name || ''}</h1><p>Your account is ready.</p>`,
    text: `Welcome ${v.name || ''}`,
  }),
  generic: (v) => ({ subject: v.subject || 'VYBE', html: v.html || `<p>${v.body || ''}</p>`, text: v.text || v.body || '' }),
};

function renderTemplate(template: string, vars: Record<string, any>) {
  const fn = TEMPLATES[template] || TEMPLATES.generic;
  return fn(vars);
}

export const sendTransactionalEmail = onCall({ secrets: ['RESEND_API_KEY'] }, async (request) => {
  const uid = requireAuth(request);
  const { to, template, vars, subject, html, text } = (request.data || {}) as any;
  if (!to) throw new HttpsError('invalid-argument', 'to required');

  // Determine admin status (admins may send free-form to any recipient).
  let isAdmin = request.auth?.token?.admin === true;
  if (!isAdmin) {
    const roleSnap = await db.collection('user_roles')
      .where('user_id', '==', uid)
      .where('role', 'in', ['admin', 'owner'])
      .limit(1).get();
    isAdmin = !roleSnap.empty;
  }

  let body: { subject: string; html: string; text: string };
  if (template) {
    body = renderTemplate(template, vars || {});
  } else if (subject) {
    if (!isAdmin) {
      throw new HttpsError('permission-denied', 'Free-form email sending is admin only. Use a template.');
    }
    body = { subject, html: html || `<p>${text || ''}</p>`, text: text || '' };
  } else {
    throw new HttpsError('invalid-argument', 'template or subject required');
  }

  // Non-admins may only email their own verified auth email.
  if (!isAdmin) {
    const userRecord = await auth.getUser(uid).catch(() => null);
    const ownEmail = userRecord?.email?.toLowerCase();
    const recipients = (Array.isArray(to) ? to : [to]).map((e: string) => String(e).toLowerCase());
    if (!ownEmail || recipients.some((r) => r !== ownEmail)) {
      throw new HttpsError('permission-denied', 'You may only send templated email to your own address');
    }
  }

  // Per-caller rate limit to prevent abuse (20/hour).
  enforceRateLimit(await rateLimit(`email:${uid}`, isAdmin ? 500 : 20, 3600));

  const recipient = Array.isArray(to) ? to[0] : to;
  body.html += `<hr><p style="font-size:12px;color:#888">VYBE • <a href="${unsubLink(recipient)}">Unsubscribe</a></p>`;

  const result = await sendViaResend({ to, ...body });
  await db.collection('email_send_log').add({
    to, template: template || 'custom', status: 'sent', sent_at: new Date().toISOString(), provider_id: (result as any).id,
  });
  return result;
});

export const sendAuthEmail = onCall({ secrets: ['RESEND_API_KEY'] }, async (request) => {
  const { to, link, name, type } = (request.data || {}) as any;
  if (!to || !link) throw new HttpsError('invalid-argument', 'to and link required');
  const tpl = renderTemplate(type === 'reset' ? 'reset_password' : 'welcome', { link, name });
  return sendViaResend({ to, ...tpl });
});

export const sendResetEmail = onCall({ secrets: ['RESEND_API_KEY'] }, async (request) => {
  const { to, link, name } = (request.data || {}) as any;
  if (!to || !link) throw new HttpsError('invalid-argument', 'to and link required');
  const tpl = renderTemplate('reset_password', { link, name });
  return sendViaResend({ to, ...tpl });
});

export const previewTransactionalEmail = onCall(async (request) => {
  await requireAdmin(request);
  const { template, vars } = (request.data || {}) as any;
  return renderTemplate(template || 'generic', vars || {});
});

export const handleEmailSuppression = onCall(async (request) => {
  await requireAdmin(request);
  const { email, reason } = (request.data || {}) as any;
  if (!email) throw new HttpsError('invalid-argument', 'email required');
  await db.collection('suppressed_emails').doc(email.toLowerCase()).set({
    email: email.toLowerCase(), reason: reason || 'manual', created_at: new Date().toISOString(),
  });
  return { ok: true };
});

export const handleEmailUnsubscribe = onRequest({ cors: true }, async (req, res) => {
  const email = String(req.query.e || '');
  const token = String(req.query.t || '');
  if (!email || !token) {
    res.status(400).send('Invalid link');
    return;
  }
  const secret = process.env.UNSUBSCRIBE_SECRET || 'change-me';
  const expected = crypto.createHmac('sha256', secret).update(email.toLowerCase()).digest('hex').slice(0, 32);
  if (token !== expected) {
    res.status(403).send('Invalid token');
    return;
  }
  await db.collection('suppressed_emails').doc(email.toLowerCase()).set({
    email: email.toLowerCase(), reason: 'unsubscribed', created_at: new Date().toISOString(),
  });
  res.status(200).send(`<html><body style="font-family:system-ui;padding:48px;text-align:center"><h1>Unsubscribed</h1><p>${email} will no longer receive marketing emails.</p></body></html>`);
});

/** Token-based unsubscribe (Firestore email_unsubscribe_tokens). */
export const emailUnsubscribeToken = onCall(async (request) => {
  const { token, validateOnly } = (request.data || {}) as { token?: string; validateOnly?: boolean };
  if (!token) throw new HttpsError('invalid-argument', 'token required');

  const snap = await db.collection('email_unsubscribe_tokens').where('token', '==', token).limit(1).get();
  const doc = snap.docs[0];
  if (!doc) {
    return { valid: false, error: 'Invalid or expired token' };
  }
  const record = doc.data() as { email?: string; used_at?: string | null };

  if (record.used_at) {
    return validateOnly
      ? { valid: false, reason: 'already_unsubscribed' }
      : { success: false, reason: 'already_unsubscribed' };
  }

  if (validateOnly) {
    return { valid: true };
  }

  await doc.ref.update({ used_at: new Date().toISOString() });
  const email = String(record.email || '').toLowerCase();
  if (!email) {
    throw new HttpsError('failed-precondition', 'Token missing email');
  }
  await db.collection('suppressed_emails').doc(email).set({
    email,
    reason: 'unsubscribe',
    created_at: new Date().toISOString(),
  }, { merge: true });

  return { success: true };
});

/** Drain the email_send_state queue. Runs every 5 minutes. */
export const processEmailQueue = onSchedule({ schedule: 'every 5 minutes', secrets: ['RESEND_API_KEY'] }, async () => {
  const snap = await db.collection('email_send_state')
    .where('status', '==', 'pending')
    .limit(50).get();
  for (const doc of snap.docs) {
    const data = doc.data() as any;
    try {
      const tpl = renderTemplate(data.template || 'generic', data.vars || {});
      await sendViaResend({ to: data.to, ...tpl });
      await doc.ref.update({ status: 'sent', sent_at: new Date().toISOString() });
    } catch (err: any) {
      await doc.ref.update({
        status: (data.attempts || 0) >= 3 ? 'failed' : 'pending',
        attempts: (data.attempts || 0) + 1,
        last_error: String(err?.message || err),
        updated_at: new Date().toISOString(),
      });
    }
  }
});
