import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { createHash } from 'node:crypto';
import { db, requireAuth } from './_shared/admin.js';
import { resolveProfileIdFromAuth } from './_shared/aiQuota.js';
import { isConversationPairBlocked, validDocumentId, withConversationAccess } from './_shared/conversationMembership.js';

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
  const actor = { profileId, authUid };
  await withConversationAccess(conversationId, actor, { resolveDirectPeer: true }, async (tx, access) => {
    if (!access.isGroup && access.other && await isConversationPairBlocked(tx, actor, access.other)) {
      throw new HttpsError('permission-denied', 'You cannot call this user');
    }
  });
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
  // A caller-owned call row can never confer access to a separate private
  // conversation. This also rejects forged rows created under legacy rules.
  if (data.conversation_id != null && data.conversation_id !== '') {
    if (!validDocumentId(data.conversation_id)) throw new HttpsError('permission-denied', 'Invalid call conversation');
    await assertConversationMember(data.conversation_id, profileId, authUid);
    return data.conversation_id;
  }
  const participants: string[] = [
    ...(Array.isArray(data.member_ids) ? data.member_ids : []),
    ...(Array.isArray(data.participants) ? data.participants : []),
    ...(Array.isArray(data.participant_ids) ? data.participant_ids : []),
    data.caller_id,
    data.receiver_id,
    data.initiator_id,
  ].filter((v): v is string => typeof v === 'string' && v.length > 0);

  if (participants.includes(profileId) || participants.includes(authUid)) {
    return null;
  }

  throw new HttpsError('permission-denied', 'Not a participant of this call');
}

/** Verify caller is a member of a community server before minting a voice-channel token. */
async function assertServerMember(
  serverId: string,
  channelId: string,
  profileId: string,
  authUid: string,
): Promise<void> {
  await db.runTransaction(async tx => {
    const [byProfile, byAuth, channel] = await Promise.all([
      tx.get(db.collection('server_members').doc(`${serverId}_${profileId}`)),
      tx.get(db.collection('server_members').doc(`${serverId}_${authUid}`)),
      tx.get(db.collection('channels').doc(channelId)),
    ]);
    if (!((byProfile.data()?.server_id === serverId && byProfile.data()?.user_id === profileId)
      || (byAuth.data()?.server_id === serverId && byAuth.data()?.user_id === authUid))) {
      throw new HttpsError('permission-denied', 'Not a member of this community');
    }
    const channelData = channel.data();
    // Match the existing client classifier for migrated live rooms.
    const voice = channelData?.type === 'voice' || channelData?.room_type === 'live';
    if (channelData?.server_id !== serverId || !voice) {
      throw new HttpsError('permission-denied', 'Voice channel is not part of this community');
    }
  });
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
  if ((conversationId != null && !validDocumentId(conversationId)) || (callId != null && !validDocumentId(callId))) {
    throw new HttpsError('invalid-argument', 'Invalid conversation or call ID');
  }

  const { profileId, displayName } = await loadProfileForAuth(authUid);

  // Enforce membership before minting a join-capable token.
  let effectiveConversationId = conversationId || null;
  if (conversationId) {
    await assertConversationMember(conversationId, profileId, authUid);
  } else if (callId) {
    effectiveConversationId = await assertCallParticipant(callId, profileId, authUid);
  }

  // Separate namespaces prevent a caller-chosen standalone ID from joining
  // an unrelated conversation or community room.
  const roomName = effectiveConversationId
    ? `call-${effectiveConversationId}`
    : `standalone_${callId}`;

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
  if (!validDocumentId(serverId) || !validDocumentId(channelId)) throw new HttpsError('invalid-argument', 'serverId and channelId required');
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const wsUrl = process.env.LIVEKIT_URL;
  if (!apiKey || !apiSecret || !wsUrl) throw new HttpsError('failed-precondition', 'LIVEKIT not configured');

  const { profileId } = await loadProfileForAuth(authUid);

  // Enforce community membership before minting a join-capable token.
  await assertServerMember(serverId, channelId, profileId, authUid);

  const { AccessToken } = await import('livekit-server-sdk');
  // Hash a structured tuple: concatenating caller-controlled IDs with an
  // underscore allowed different server/channel pairs to share one room.
  const roomName = `comm_v2_${createHash('sha256').update(JSON.stringify([serverId, channelId])).digest('hex')}`;
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
