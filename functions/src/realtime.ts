import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, requireAuth } from './_shared/admin.js';
import { resolveProfileIdFromAuth } from './_shared/aiQuota.js';

const SECRETS = ['LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET', 'LIVEKIT_URL'];

async function loadProfileForAuth(authUid: string): Promise<{
  profileId: string;
  displayName: string;
}> {
  const profileId = await resolveProfileIdFromAuth(authUid);
  const snap = await db.collection('profiles').doc(profileId).get();
  const data = snap.data() || {};
  const displayName =
    (data.display_name as string) ||
    (data.username as string) ||
    'User';
  return { profileId, displayName };
}

/** Verify caller is a member of the DM/group conversation before minting a call token. */
async function assertConversationMember(
  conversationId: string,
  profileId: string,
  authUid: string,
): Promise<void> {
  // 1. Direct conversation_members doc lookup by composite id.
  const [byProfile, byAuth] = await Promise.all([
    db.collection('conversation_members').doc(`${conversationId}_${profileId}`).get(),
    db.collection('conversation_members').doc(`${conversationId}_${authUid}`).get(),
  ]);
  if (byProfile.exists || byAuth.exists) return;

  // 2. Fallback to conversations.member_ids array.
  const conv = await db.collection('conversations').doc(conversationId).get();
  if (conv.exists) {
    const memberIds = conv.data()?.member_ids;
    if (Array.isArray(memberIds) && (memberIds.includes(profileId) || memberIds.includes(authUid))) {
      return;
    }
  }

  throw new HttpsError('permission-denied', 'Not a member of this conversation');
}

/** Verify caller is a participant of the given call doc (or its underlying conversation). */
async function assertCallParticipant(
  callId: string,
  profileId: string,
  authUid: string,
): Promise<string | null> {
  const callSnap = await db.collection('calls').doc(callId).get();
  if (!callSnap.exists) {
    throw new HttpsError('not-found', 'Call not found');
  }
  const data = callSnap.data() || {};
  const participants: string[] = [
    ...(Array.isArray(data.member_ids) ? data.member_ids : []),
    ...(Array.isArray(data.participants) ? data.participants : []),
    data.caller_id,
    data.receiver_id,
    data.initiator_id,
  ].filter((v): v is string => typeof v === 'string' && v.length > 0);

  if (participants.includes(profileId) || participants.includes(authUid)) {
    return typeof data.conversation_id === 'string' ? data.conversation_id : null;
  }

  const conversationId =
    typeof data.conversation_id === 'string' ? data.conversation_id : null;
  if (conversationId) {
    await assertConversationMember(conversationId, profileId, authUid);
    return conversationId;
  }

  throw new HttpsError('permission-denied', 'Not a participant of this call');
}

/** Verify caller is a member of a community server before minting a voice-channel token. */
async function assertServerMember(
  serverId: string,
  profileId: string,
  authUid: string,
): Promise<void> {
  const [byProfile, byAuth] = await Promise.all([
    db.collection('server_members').doc(`${serverId}_${profileId}`).get(),
    db.collection('server_members').doc(`${serverId}_${authUid}`).get(),
  ]);
  if (byProfile.exists || byAuth.exists) return;
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

  const {
    conversationId,
    callId,
    callType = 'audio',
  } = (request.data || {}) as {
    conversationId?: string;
    callId?: string;
    callType?: 'audio' | 'video';
  };

  if (!conversationId && !callId) {
    throw new HttpsError('invalid-argument', 'conversationId or callId required');
  }

  const { profileId, displayName } = await loadProfileForAuth(authUid);

  // Enforce membership before minting a join-capable token.
  let effectiveConversationId = conversationId || null;
  if (conversationId) {
    await assertConversationMember(conversationId, profileId, authUid);
  } else if (callId) {
    effectiveConversationId = await assertCallParticipant(callId, profileId, authUid);
  }

  // Match client + legacy Supabase room naming (`call-${conversationId}`).
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
  const { serverId, channelId } = (request.data || {}) as { serverId?: string; channelId?: string };
  if (!serverId || !channelId) throw new HttpsError('invalid-argument', 'serverId and channelId required');
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const wsUrl = process.env.LIVEKIT_URL;
  if (!apiKey || !apiSecret || !wsUrl) throw new HttpsError('failed-precondition', 'LIVEKIT not configured');

  const { profileId } = await loadProfileForAuth(authUid);

  // Enforce community membership before minting a join-capable token.
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
  const { roomName } = (request.data || {}) as { roomName?: string };
  return { ok: true, room: roomName || `room_${Date.now()}` };
});

/** external-presence-poll — read-only presence helper. */
export const externalPresencePoll = onCall(async (request) => {
  requireAuth(request);
  const { userIds = [] } = (request.data || {}) as { userIds?: string[] };
  const ids = userIds.slice(0, 30);
  if (!ids.length) return { presence: {} };
  const snaps = await Promise.all(ids.map((id) => db.collection('chat_presence').doc(id).get()));
  const presence: Record<string, any> = {};
  snaps.forEach((s, i) => { if (s.exists) presence[ids[i]] = s.data(); });
  return { presence };
});
