import { HttpsError } from 'firebase-functions/v2/https';
const RESEND_URL = 'https://api.resend.com/emails';
/** Turn Firebase action link into a direct vybehub.app link (skips firebaseapp.com redirect). */
export function toDirectPasswordResetLink(firebaseLink, continueUrl) {
    try {
        const parsed = new URL(firebaseLink);
        const oobCode = parsed.searchParams.get('oobCode');
        const mode = parsed.searchParams.get('mode') || 'resetPassword';
        if (!oobCode)
            return firebaseLink;
        const direct = new URL(continueUrl);
        direct.searchParams.set('mode', mode);
        direct.searchParams.set('oobCode', oobCode);
        return direct.toString();
    }
    catch {
        return firebaseLink;
    }
}
export function passwordResetContinueUrl() {
    const base = process.env.PUBLIC_SITE_URL || 'https://vybehub.app';
    return `${base.replace(/\/$/, '')}/reset-password`;
}
function fromAddr() {
    return process.env.EMAIL_FROM || 'VYBE <noreply@vybehub.app>';
}
function resendKey() {
    const k = process.env.RESEND_API_KEY;
    if (!k)
        throw new HttpsError('failed-precondition', 'RESEND_API_KEY not configured');
    return k;
}
export function renderPasswordResetEmailHtml(actionLink) {
    const year = new Date().getFullYear();
    return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a0a;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" style="max-width:480px;background:linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%);border-radius:24px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);">
        <tr><td style="padding:40px 32px 24px;text-align:center;">
          <div style="display:inline-block;padding:12px 20px;background:linear-gradient(135deg,#667eea,#764ba2);border-radius:16px;margin-bottom:20px;">
            <span style="color:#fff;font-size:24px;font-weight:800;letter-spacing:2px;">VYBE</span>
          </div>
          <h1 style="color:#ffffff;font-size:22px;font-weight:700;margin:16px 0 8px;">Reset Your Password</h1>
          <p style="color:#94a3b8;font-size:14px;line-height:1.6;margin:0;">Click the button below to choose a new password for your VYBE account.</p>
        </td></tr>
        <tr><td style="padding:8px 32px 32px;text-align:center;">
          <a href="${actionLink}" style="display:inline-block;padding:14px 40px;background:linear-gradient(135deg,#667eea,#764ba2);color:#ffffff;text-decoration:none;border-radius:14px;font-size:15px;font-weight:700;letter-spacing:0.5px;">Reset Password</a>
          <p style="color:#64748b;font-size:12px;margin-top:20px;line-height:1.5;">This link expires in 1 hour.<br>If you didn't request this, you can safely ignore this email.</p>
        </td></tr>
        <tr><td style="padding:20px 32px;border-top:1px solid rgba(255,255,255,0.06);text-align:center;">
          <p style="color:#475569;font-size:11px;margin:0;">© ${year} VYBE</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
export function renderPasswordResetEmailText(actionLink) {
    return `Reset Your VYBE Password\n\nClick the link below to choose a new password:\n\n${actionLink}\n\nThis link expires in 1 hour. If you didn't request this, ignore this email.`;
}
export async function sendPasswordResetViaResend(to, actionLink) {
    const html = renderPasswordResetEmailHtml(actionLink);
    const text = renderPasswordResetEmailText(actionLink);
    const from = fromAddr();
    const payload = {
        from,
        to: [to],
        subject: 'Reset Your VYBE Password',
        html,
        text,
    };
    const res = await fetch(RESEND_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        const body = await res.text();
        // Domain not verified — try Resend sandbox sender
        if (res.status === 403 || body.toLowerCase().includes('domain')) {
            const fallback = await fetch(RESEND_URL, {
                method: 'POST',
                headers: { Authorization: `Bearer ${resendKey()}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...payload, from: 'VYBE <onboarding@resend.dev>' }),
            });
            if (!fallback.ok) {
                throw new HttpsError('internal', `Resend fallback ${fallback.status}: ${await fallback.text()}`);
            }
            const data = await fallback.json();
            return { id: data.id };
        }
        throw new HttpsError('internal', `Resend ${res.status}: ${body}`);
    }
    const data = await res.json();
    return { id: data.id };
}
//# sourceMappingURL=passwordReset.js.map