import { HttpsError } from 'firebase-functions/v2/https';
import { GoogleAuth } from 'google-auth-library';
const IDENTITY_SCOPE = 'https://www.googleapis.com/auth/identitytoolkit';
const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || 'vybe-daaab';
async function identityAccessToken() {
    const auth = new GoogleAuth({ scopes: [IDENTITY_SCOPE] });
    const client = await auth.getClient();
    const token = await client.getAccessToken();
    if (!token.token)
        throw new HttpsError('internal', 'Failed to obtain Identity Toolkit access token');
    return token.token;
}
/** Send password reset via Firebase Auth (uses Console email templates). */
export async function sendFirebasePasswordResetEmail(email, continueUrl) {
    const token = await identityAccessToken();
    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:sendOobCode`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            requestType: 'PASSWORD_RESET',
            email,
            continueUrl,
            canHandleCodeInApp: true,
        }),
    });
    if (res.ok)
        return;
    const body = await res.text();
    const lower = body.toLowerCase();
    if (res.status === 400 &&
        (lower.includes('email_not_found') ||
            lower.includes('user not found') ||
            lower.includes('no user record'))) {
        return;
    }
    throw new HttpsError('internal', `Firebase password reset email failed (${res.status}): ${body.slice(0, 300)}`);
}
//# sourceMappingURL=firebaseAuthEmail.js.map