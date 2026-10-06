import { HttpsError } from 'firebase-functions/v2/https';
/** The existing provider must support revocation; never silently downgrade it. */
export function cloudSpaceAudioOrigin(raw) {
    let url;
    try {
        url = new URL(raw);
    }
    catch {
        throw new HttpsError('failed-precondition', 'Audio service configuration needs attention.');
    }
    if (!['wss:', 'https:'].includes(url.protocol) || !/^[a-z0-9-]+\.livekit\.cloud$/i.test(url.hostname)
        || url.username || url.password || url.search || url.hash || (url.port && url.port !== '443') || !['', '/'].includes(url.pathname)) {
        throw new HttpsError('failed-precondition', 'Audio rooms require the configured Cloud service.');
    }
    return `https://${url.hostname}`;
}
function checkedPlan(plan) {
    if (!plan || !/^space_v1_[a-f0-9]{64}$/.test(plan.roomName) || !Number.isSafeInteger(plan.cutoffSeconds) || plan.cutoffSeconds <= 0
        || !Array.isArray(plan.identities) || plan.identities.length > 400
        || plan.identities.some(identity => typeof identity !== 'string' || !identity || identity.length > 128 || /[\s/]/.test(identity))) {
        throw new HttpsError('invalid-argument', 'Invalid audio room change.');
    }
    return { ...plan, identities: [...new Set(plan.identities)] };
}
/**
 * Called only with a server-owned, durably recorded revocation plan. The
 * coordinator must block stale token issuance and reconcile uncertain writes.
 * Completing this transport operation alone does not establish that invariant.
 */
export function spaceAudioProvider(api, configuredUrl) {
    cloudSpaceAudioOrigin(configuredUrl);
    const remove = async (plan) => {
        // Bounded batches. A failed request prevents close/ack, even if other
        // removals in its batch completed; replay uses the exact same cutoff.
        for (let offset = 0; offset < plan.identities.length; offset += 5) {
            await Promise.all(plan.identities.slice(offset, offset + 5).map(identity => api.removeParticipant(plan.roomName, identity, { revokeTokenTs: BigInt(plan.cutoffSeconds) })));
        }
    };
    return {
        async revoke(plan) {
            const checked = checkedPlan(plan);
            if (!checked.identities.length)
                throw new HttpsError('invalid-argument', 'A participant is required.');
            try {
                await remove(checked);
            }
            catch {
                throw new HttpsError('unavailable', 'The audio change could not be confirmed. Please retry.');
            }
        },
        async close(plan) {
            const checked = checkedPlan(plan);
            try {
                await remove(checked);
                try {
                    await api.deleteRoom(checked.roomName);
                }
                catch (error) {
                    // All recorded identities were revoked first. An already-absent
                    // room can therefore satisfy close; other provider errors cannot.
                    if (error.code !== 'not_found')
                        throw error;
                }
            }
            catch {
                throw new HttpsError('unavailable', 'The audio room could not be closed. Please retry.');
            }
        },
    };
}
export async function configuredSpaceAudioProvider(env = process.env) {
    const { LIVEKIT_URL: url, LIVEKIT_API_KEY: key, LIVEKIT_API_SECRET: secret } = env;
    if (!url || !key || !secret)
        throw new HttpsError('failed-precondition', 'Audio service is not configured.');
    const origin = cloudSpaceAudioOrigin(url);
    const { RoomServiceClient } = await import('livekit-server-sdk');
    return spaceAudioProvider(new RoomServiceClient(origin, key, secret, { requestTimeout: 5 }), url);
}
//# sourceMappingURL=spaceAudioProvider.js.map