import { HttpsError } from 'firebase-functions/v2/https';
import { auth } from './admin.js';
import { renderAuthEmail, AUTH_EMAIL_SUBJECTS } from './emailTemplates/index.js';
import { passwordResetContinueUrl, toCleanPasswordResetLink } from './passwordReset.js';

const RESEND_URL = 'https://api.resend.com/emails';

function fromAddr(): string {
  return process.env.EMAIL_FROM || 'VYBE <no-reply@vybehub.app>';
}

async function sendViaResend(to: string, subject: string, html: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return false;

  const res = await fetch(RESEND_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: fromAddr(),
      to: [to],
      subject,
      html,
    }),
  });

  if (!res.ok) {
    console.error('[passwordResetEmail] Resend failed:', res.status, (await res.text()).slice(0, 200));
    return false;
  }
  return true;
}

export type PasswordResetSendProvider = 'resend' | 'firebase_auth';

/**
 * Branded reset email via Resend only — never Firebase's default mailer (sendOobCode).
 * Uses Admin generatePasswordResetLink + clean vybehub.app URL in recovery.html.
 */
export async function sendPasswordResetEmail(email: string): Promise<PasswordResetSendProvider> {
  const continueUrl = passwordResetContinueUrl();

  if (!process.env.RESEND_API_KEY?.trim()) {
    console.error('[passwordResetEmail] RESEND_API_KEY secret not bound');
    throw new HttpsError('failed-precondition', 'Password reset email is not configured');
  }

  const firebaseLink = await auth.generatePasswordResetLink(email, {
    url: continueUrl,
    handleCodeInApp: true,
  });

  const link = toCleanPasswordResetLink(firebaseLink);
  const html = renderAuthEmail('recovery', { link, email });
  const sent = await sendViaResend(email, AUTH_EMAIL_SUBJECTS.recovery, html);
  if (!sent) {
    throw new HttpsError('internal', 'Failed to send password reset email');
  }

  return 'resend';
}
