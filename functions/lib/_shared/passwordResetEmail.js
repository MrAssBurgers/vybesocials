import { auth } from './admin.js';
import { renderAuthEmail, AUTH_EMAIL_SUBJECTS } from './emailTemplates/index.js';
import { passwordResetContinueUrl } from './passwordReset.js';
import { sendFirebasePasswordResetEmail } from './firebaseAuthEmail.js';
const RESEND_URL = 'https://api.resend.com/emails';
function fromAddr() {
    return process.env.EMAIL_FROM || 'VYBE <no-reply@vybehub.app>';
}
async function sendViaResend(to, subject, html) {
    const key = process.env.RESEND_API_KEY?.trim();
    if (!key)
        return false;
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
/**
 * Branded reset email when Resend is configured; otherwise Firebase's default mailer.
 * Uses Admin generatePasswordResetLink so Console template lock does not matter.
 */
export async function sendPasswordResetEmail(email) {
    const continueUrl = passwordResetContinueUrl();
    try {
        const link = await auth.generatePasswordResetLink(email, {
            url: continueUrl,
            handleCodeInApp: false,
        });
        const html = renderAuthEmail('recovery', { link, email });
        const sent = await sendViaResend(email, AUTH_EMAIL_SUBJECTS.recovery, html);
        if (sent)
            return 'resend';
    }
    catch (err) {
        const code = err?.code;
        if (code === 'auth/user-not-found') {
            throw err;
        }
        console.warn('[passwordResetEmail] Admin link + Resend path failed, falling back:', err);
    }
    await sendFirebasePasswordResetEmail(email, continueUrl);
    return 'firebase_auth';
}
//# sourceMappingURL=passwordResetEmail.js.map