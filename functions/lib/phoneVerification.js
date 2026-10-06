import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, auth, requireAuth } from './_shared/admin.js';
import { confirmPhoneVerification, readPhoneVerification, requestPhoneVerification } from './_shared/phoneVerificationAuthority.js';
import { TWILIO_SECRETS, getTwilioConfig, twilioVerifyStart, twilioVerifyCheck } from './_shared/twilioVerify.js';
function recentUid(request) {
    const uid = requireAuth(request), signedIn = Number(request.auth?.token.auth_time) * 1000;
    if (!Number.isFinite(signedIn) || signedIn > Date.now() + 60_000 || Date.now() - signedIn > 600_000)
        throw new HttpsError('failed-precondition', 'For your security, sign out and sign in again before verifying your phone.');
    return uid;
}
const provider = {
    async start(phone) {
        const config = getTwilioConfig();
        if (!config)
            throw new HttpsError('unavailable', 'SMS verification is unavailable. Please try again later.');
        const result = await twilioVerifyStart(config, phone);
        if (!result.ok)
            throw new HttpsError('unavailable', result.error === 'phone_blocked' ? 'This number cannot receive our verification texts.' : 'Could not send the verification code. Please retry.');
    },
    async check(phone, code) {
        const config = getTwilioConfig();
        if (!config)
            throw new HttpsError('unavailable', 'SMS verification is unavailable. Please try again later.');
        return (await twilioVerifyCheck(config, phone, code)).ok;
    },
};
const options = { cors: true, timeoutSeconds: 60, secrets: [...TWILIO_SECRETS] };
export const phoneVerificationState = onCall({ cors: true, timeoutSeconds: 30, invoker: 'public' }, request => readPhoneVerification(db, auth, requireAuth(request), request.data));
export const phoneVerifyRequest = onCall(options, request => requestPhoneVerification(db, auth, provider, recentUid(request), request.data));
export const phoneVerifyConfirm = onCall(options, request => confirmPhoneVerification(db, auth, provider, recentUid(request), request.data));
//# sourceMappingURL=phoneVerification.js.map