import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { db, auth, requireAuth, rateLimit, enforceRateLimit } from './_shared/admin.js';
import { manageSpaceAuthority, normalizeSpaceInput } from './_shared/spaceAuthority.js';
import { mintCheckedSpaceAudioToken, spaceAudioTokenSigner } from './_shared/spaceAudioToken.js';
import { configuredSpaceAudioProvider } from './_shared/spaceAudioProvider.js';
import { synchronizeSpaceAudioEffect } from './_shared/spaceAudioSync.js';
const secrets = ['LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET', 'LIVEKIT_URL'];
// Prepared module: deliberately not exported from the deployed entry point
// until matching client, indexes, Rules and provider-flow checks are complete.
export const manageSpaces = onCall({ region: 'us-central1' }, async (request) => {
    const uid = requireAuth(request), input = normalizeSpaceInput(request.data, uid);
    if (input.action === 'audio')
        throw new HttpsError('invalid-argument', 'Use the audio admission service.');
    enforceRateLimit(await rateLimit(`spaces:${uid}`, 90, 60));
    if (input.action === 'create')
        enforceRateLimit(await rateLimit(`space-create:${uid}`, 10, 3600));
    const result = await manageSpaceAuthority(db, auth, uid, input);
    const { audioEffectId, ...response } = result;
    return { ...response, audioPending: !!audioEffectId };
});
export const spacesAudioToken = onCall({ region: 'us-central1', secrets, timeoutSeconds: 30 }, async (request) => {
    const uid = requireAuth(request);
    let signer = null;
    let limited = false;
    const result = await mintCheckedSpaceAudioToken(uid, request.data, {
        admit: async (owner, input) => {
            if (!limited) {
                enforceRateLimit(await rateLimit(`space-audio:${uid}`, 30, 60));
                limited = true;
            }
            const admission = await manageSpaceAuthority(db, auth, owner, input);
            return admission;
        },
        mint: async (admission) => {
            signer = await spaceAudioTokenSigner();
            return signer.mint(admission);
        },
        now: Date.now,
        sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
    });
    return { ...result, url: signer.url };
});
export const processSpaceAudioEffect = onDocumentCreated({ region: 'us-central1', document: '_space_audio_effects/{effectId}',
    secrets, retry: true, timeoutSeconds: 480 }, async (event) => {
    if (!event.data)
        return;
    await synchronizeSpaceAudioEffect(db, event.params.effectId, await configuredSpaceAudioProvider());
});
//# sourceMappingURL=spaces.js.map