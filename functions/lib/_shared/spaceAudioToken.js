import { HttpsError } from 'firebase-functions/v2/https';
import { normalizeSpaceInput } from './spaceAuthority.js';
import { cloudSpaceAudioOrigin } from './spaceAudioProvider.js';
const changed = () => new HttpsError('failed-precondition', 'Your audio access changed. Reopen the room.');
/** Never return a token from a retired role, account, membership or room. */
export async function mintCheckedSpaceAudioToken(uid, raw, service) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || 'action' in raw)
        throw new HttpsError('invalid-argument', 'Audio room details are required.');
    const input = normalizeSpaceInput({ ...raw, action: 'audio' }, uid);
    const first = await service.admit(uid, input);
    const valid = (grant) => grant && grant.ownerUid === uid && grant.profileId === input.expectedProfileId && grant.identity === grant.profileId
        && /^space_v1_[a-f0-9]{64}$/.test(grant.roomName) && Number.isSafeInteger(grant.generation) && grant.generation > 0
        && Number.isSafeInteger(grant.notBeforeSeconds) && grant.notBeforeSeconds >= 0
        && ['host', 'co_host', 'speaker', 'listener', 'requested'].includes(grant.role)
        && typeof grant.canPublish === 'boolean' && grant.canPublish === ['host', 'co_host', 'speaker'].includes(grant.role);
    if (!valid(first))
        throw changed();
    const wait = Math.max(0, first.notBeforeSeconds * 1000 - service.now());
    if (wait > 3000)
        throw new HttpsError('unavailable', 'Audio permissions are still settling. Please retry.');
    if (wait)
        await service.sleep(wait);
    if (service.now() < first.notBeforeSeconds * 1000)
        throw new HttpsError('unavailable', 'Audio permissions are still settling. Please retry.');
    const same = (grant) => valid(grant) && grant.ownerUid === first.ownerUid && grant.profileId === first.profileId
        && grant.identity === first.identity && grant.roomName === first.roomName && grant.generation === first.generation
        && grant.role === first.role && grant.canPublish === first.canPublish && grant.notBeforeSeconds === first.notBeforeSeconds;
    if (!same(await service.admit(uid, input)))
        throw changed();
    const token = await service.mint(first);
    if (typeof token !== 'string' || !token)
        throw new HttpsError('unavailable', 'Audio access could not be created. Please retry.');
    if (!same(await service.admit(uid, input)))
        throw changed();
    return { token, roomName: first.roomName, role: first.role, canPublish: first.canPublish, generation: first.generation };
}
export async function spaceAudioTokenSigner(env = process.env) {
    const { LIVEKIT_URL: url, LIVEKIT_API_KEY: key, LIVEKIT_API_SECRET: secret } = env;
    if (!url || !key || !secret)
        throw new HttpsError('failed-precondition', 'Audio service is not configured.');
    cloudSpaceAudioOrigin(url);
    const { AccessToken, TrackSource } = await import('livekit-server-sdk');
    return {
        url,
        async mint(grant) {
            const token = new AccessToken(key, secret, { identity: grant.identity, name: grant.displayName, ttl: 60 });
            token.addGrant({ room: grant.roomName, roomJoin: true, canSubscribe: true, canPublish: grant.canPublish,
                canPublishSources: grant.canPublish ? [TrackSource.MICROPHONE] : [], canPublishData: false, canUpdateOwnMetadata: false });
            return token.toJwt();
        },
    };
}
//# sourceMappingURL=spaceAudioToken.js.map