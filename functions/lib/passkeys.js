/**
 * WebAuthn passkey register + login using @simplewebauthn/server.
 * Persists challenges in `auth_challenges` and credentials in `webauthn_credentials`.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, auth, requireAuth } from './_shared/admin.js';
const RP_NAME = 'VYBE';
function rpId() { return process.env.WEBAUTHN_RP_ID || 'vybehub.app'; }
function origin() { return process.env.PUBLIC_SITE_URL || 'https://vybehub.app'; }
async function lib() {
    const m = await import('@simplewebauthn/server').catch(() => null);
    if (!m)
        throw new HttpsError('failed-precondition', '@simplewebauthn/server not installed');
    return m;
}
export const authPasskeyRegisterOptions = onCall(async (request) => {
    const uid = requireAuth(request);
    const { generateRegistrationOptions } = await lib();
    const user = await auth.getUser(uid);
    const credsSnap = await db.collection('webauthn_credentials').where('user_id', '==', uid).get();
    const excludeCredentials = credsSnap.docs.map((d) => {
        const c = d.data();
        return { id: Buffer.from(c.credential_id, 'base64url'), type: 'public-key', transports: c.transports || [] };
    });
    const options = await generateRegistrationOptions({
        rpName: RP_NAME, rpID: rpId(),
        userID: Buffer.from(uid),
        userName: user.email || user.displayName || uid,
        attestationType: 'none', excludeCredentials,
        authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
    });
    await db.collection('auth_challenges').doc(uid).set({
        user_id: uid, challenge: options.challenge, type: 'register',
        expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
    });
    return options;
});
export const authPasskeyRegisterVerify = onCall(async (request) => {
    const uid = requireAuth(request);
    const { verifyRegistrationResponse } = await lib();
    const { response } = (request.data || {});
    const ch = await db.collection('auth_challenges').doc(uid).get();
    if (!ch.exists)
        throw new HttpsError('failed-precondition', 'No challenge');
    const expectedChallenge = ch.data().challenge;
    const verification = await verifyRegistrationResponse({
        response, expectedChallenge, expectedOrigin: origin(), expectedRPID: rpId(),
    });
    if (!verification.verified || !verification.registrationInfo)
        throw new HttpsError('permission-denied', 'Not verified');
    const info = verification.registrationInfo;
    await db.collection('webauthn_credentials').add({
        user_id: uid,
        credential_id: Buffer.from(info.credentialID).toString('base64url'),
        public_key: Buffer.from(info.credentialPublicKey).toString('base64url'),
        counter: info.counter,
        transports: response?.response?.transports || [],
        created_at: new Date().toISOString(),
    });
    await ch.ref.delete();
    return { ok: true };
});
export const authPasskeyLoginOptions = onCall(async (request) => {
    const { generateAuthenticationOptions } = await lib();
    const { email } = (request.data || {});
    let allowCredentials = [];
    if (email) {
        const user = await auth.getUserByEmail(email).catch(() => null);
        if (user) {
            const creds = await db.collection('webauthn_credentials').where('user_id', '==', user.uid).get();
            allowCredentials = creds.docs.map((d) => ({
                id: Buffer.from(d.data().credential_id, 'base64url'),
                type: 'public-key',
                transports: d.data().transports || [],
            }));
        }
    }
    const options = await generateAuthenticationOptions({ rpID: rpId(), allowCredentials, userVerification: 'preferred' });
    await db.collection('auth_challenges').doc(`login_${options.challenge.slice(0, 24)}`).set({
        challenge: options.challenge, type: 'login', email: email || null,
        expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
    });
    return options;
});
export const authPasskeyLoginVerify = onCall(async (request) => {
    const { verifyAuthenticationResponse } = await lib();
    const { response, challenge } = (request.data || {});
    if (!challenge)
        throw new HttpsError('invalid-argument', 'challenge required');
    const chDoc = await db.collection('auth_challenges').doc(`login_${challenge.slice(0, 24)}`).get();
    if (!chDoc.exists)
        throw new HttpsError('failed-precondition', 'Unknown challenge');
    const credId = response?.id;
    const credSnap = await db.collection('webauthn_credentials').where('credential_id', '==', credId).limit(1).get();
    if (credSnap.empty)
        throw new HttpsError('not-found', 'Credential not registered');
    const cred = credSnap.docs[0].data();
    const verification = await verifyAuthenticationResponse({
        response, expectedChallenge: challenge, expectedOrigin: origin(), expectedRPID: rpId(),
        authenticator: {
            credentialID: Buffer.from(cred.credential_id, 'base64url'),
            credentialPublicKey: Buffer.from(cred.public_key, 'base64url'),
            counter: cred.counter || 0,
        },
    });
    if (!verification.verified)
        throw new HttpsError('permission-denied', 'Not verified');
    await credSnap.docs[0].ref.update({ counter: verification.authenticationInfo.newCounter, last_used_at: new Date().toISOString() });
    const customToken = await auth.createCustomToken(cred.user_id);
    await chDoc.ref.delete();
    return { ok: true, custom_token: customToken };
});
//# sourceMappingURL=passkeys.js.map