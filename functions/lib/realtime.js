import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, requireAuth } from './_shared/admin.js';
const SECRETS = ['LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET', 'LIVEKIT_URL'];
/** livekit-token — mint a LiveKit access token for a 1:1 or group call. */
export const livekitToken = onCall({ secrets: SECRETS }, async (request) => {
    const uid = requireAuth(request);
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const wsUrl = process.env.LIVEKIT_URL;
    if (!apiKey || !apiSecret || !wsUrl) {
        throw new HttpsError('failed-precondition', 'LIVEKIT_API_KEY/SECRET/URL not configured');
    }
    const { conversationId, callId, callType = 'audio' } = (request.data || {});
    const room = callId || conversationId;
    if (!room)
        throw new HttpsError('invalid-argument', 'conversationId or callId required');
    // Dynamic import keeps cold-start light when livekit isn't used.
    const { AccessToken } = await import('livekit-server-sdk');
    const profile = (await db.collection('profiles').doc(uid).get()).data() || {};
    const identity = uid;
    const name = profile.display_name || profile.username || 'User';
    const at = new AccessToken(apiKey, apiSecret, { identity, name, ttl: 60 * 60 });
    at.addGrant({ room, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true });
    return { token: await at.toJwt(), url: wsUrl, room, callType };
});
/** community-voice-token — same minting, scoped to community/channel room name. */
export const communityVoiceToken = onCall({ secrets: SECRETS }, async (request) => {
    const uid = requireAuth(request);
    const { serverId, channelId } = (request.data || {});
    if (!serverId || !channelId)
        throw new HttpsError('invalid-argument', 'serverId and channelId required');
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const wsUrl = process.env.LIVEKIT_URL;
    if (!apiKey || !apiSecret || !wsUrl)
        throw new HttpsError('failed-precondition', 'LIVEKIT not configured');
    const { AccessToken } = await import('livekit-server-sdk');
    const room = `comm_${serverId}_${channelId}`;
    const at = new AccessToken(apiKey, apiSecret, { identity: uid, ttl: 60 * 60 });
    at.addGrant({ room, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true });
    return { token: await at.toJwt(), url: wsUrl, room };
});
/** spaces-token — alias used by audio spaces UI. */
export const spacesToken = communityVoiceToken;
/** api-calls-create-room — placeholder; LiveKit auto-creates rooms on first join. */
export const apiCallsCreateRoom = onCall(async (request) => {
    requireAuth(request);
    const { roomName } = (request.data || {});
    return { ok: true, room: roomName || `room_${Date.now()}` };
});
/** external-presence-poll — read-only presence helper. */
export const externalPresencePoll = onCall(async (request) => {
    requireAuth(request);
    const { userIds = [] } = (request.data || {});
    const ids = userIds.slice(0, 30);
    if (!ids.length)
        return { presence: {} };
    const snaps = await Promise.all(ids.map((id) => db.collection('chat_presence').doc(id).get()));
    const presence = {};
    snaps.forEach((s, i) => { if (s.exists)
        presence[ids[i]] = s.data(); });
    return { presence };
});
//# sourceMappingURL=realtime.js.map