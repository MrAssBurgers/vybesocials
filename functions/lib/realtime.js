import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, requireAuth } from './_shared/admin.js';
import { resolveProfileIdFromAuth } from './_shared/aiQuota.js';
const SECRETS = ['LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET', 'LIVEKIT_URL'];
async function loadProfileForAuth(authUid) {
    const profileId = await resolveProfileIdFromAuth(authUid);
    const snap = await db.collection('profiles').doc(profileId).get();
    const data = snap.data() || {};
    const displayName = data.display_name ||
        data.username ||
        'User';
    return { profileId, displayName };
}
async function assertConversationMember(conversationId, profileId, authUid) {
    const [byProfile, byAuth] = await Promise.all([
        db.collection('conversation_members').doc(`${conversationId}_${profileId}`).get(),
        db.collection('conversation_members').doc(`${conversationId}_${authUid}`).get(),
    ]);
    if (byProfile.exists || byAuth.exists)
        return;
    const conv = await db.collection('conversations').doc(conversationId).get();
    if (conv.exists) {
        const memberIds = conv.data()?.member_ids;
        if (Array.isArray(memberIds) && (memberIds.includes(profileId) || memberIds.includes(authUid))) {
            return;
        }
    }
    throw new HttpsError('permission-denied', 'Not a member of this conversation');
}
async function assertCallParticipant(callId, profileId, authUid) {
    const callSnap = await db.collection('calls').doc(callId).get();
    if (!callSnap.exists) {
        throw new HttpsError('not-found', 'Call not found');
    }
    const data = callSnap.data() || {};
    const participants = [
        ...(Array.isArray(data.member_ids) ? data.member_ids : []),
        ...(Array.isArray(data.participants) ? data.participants : []),
        data.caller_id,
        data.receiver_id,
        data.initiator_id,
    ].filter((v) => typeof v === 'string' && v.length > 0);
    if (participants.includes(profileId) || participants.includes(authUid)) {
        return typeof data.conversation_id === 'string' ? data.conversation_id : null;
    }
    const conversationId = typeof data.conversation_id === 'string' ? data.conversation_id : null;
    if (conversationId) {
        await assertConversationMember(conversationId, profileId, authUid);
        return conversationId;
    }
    throw new HttpsError('permission-denied', 'Not a participant of this call');
}
async function assertServerMember(serverId, profileId, authUid) {
    const [byProfile, byAuth] = await Promise.all([
        db.collection('server_members').doc(`${serverId}_${profileId}`).get(),
        db.collection('server_members').doc(`${serverId}_${authUid}`).get(),
    ]);
    if (byProfile.exists || byAuth.exists)
        return;
    throw new HttpsError('permission-denied', 'Not a member of this community');
}
/** livekit-token — mint a LiveKit access token for a 1:1 or group call. */
export const livekitToken = onCall({ secrets: SECRETS }, async (request) => {
    const authUid = requireAuth(request);
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const wsUrl = process.env.LIVEKIT_URL;
    if (!apiKey || !apiSecret || !wsUrl) {
        throw new HttpsError('failed-precondition', 'LIVEKIT_API_KEY/SECRET/URL not configured');
    }
    const { conversationId, callId, callType = 'audio', } = (request.data || {});
    if (!conversationId && !callId) {
        throw new HttpsError('invalid-argument', 'conversationId or callId required');
    }
    const { profileId, displayName } = await loadProfileForAuth(authUid);
    let effectiveConversationId = conversationId || null;
    if (conversationId) {
        await assertConversationMember(conversationId, profileId, authUid);
    }
    else if (callId) {
        effectiveConversationId = await assertCallParticipant(callId, profileId, authUid);
    }
    const roomName = effectiveConversationId
        ? `call-${effectiveConversationId}`
        : String(callId);
    const { AccessToken } = await import('livekit-server-sdk');
    const at = new AccessToken(apiKey, apiSecret, {
        identity: profileId,
        name: displayName,
        ttl: 60 * 60,
    });
    at.addGrant({
        room: roomName,
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
    });
    return {
        token: await at.toJwt(),
        url: wsUrl,
        room: roomName,
        roomName,
        callType,
    };
});
/** community-voice-token — same minting, scoped to community/channel room name. */
export const communityVoiceToken = onCall({ secrets: SECRETS }, async (request) => {
    const authUid = requireAuth(request);
    const { serverId, channelId } = (request.data || {});
    if (!serverId || !channelId)
        throw new HttpsError('invalid-argument', 'serverId and channelId required');
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const wsUrl = process.env.LIVEKIT_URL;
    if (!apiKey || !apiSecret || !wsUrl)
        throw new HttpsError('failed-precondition', 'LIVEKIT not configured');
    const { profileId } = await loadProfileForAuth(authUid);
    await assertServerMember(serverId, profileId, authUid);
    const { AccessToken } = await import('livekit-server-sdk');
    const roomName = `comm_${serverId}_${channelId}`;
    const at = new AccessToken(apiKey, apiSecret, { identity: profileId, ttl: 60 * 60 });
    at.addGrant({ room: roomName, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true });
    return { token: await at.toJwt(), url: wsUrl, room: roomName, roomName };
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
