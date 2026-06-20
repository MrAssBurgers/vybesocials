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

  // Match client + legacy Supabase room naming (`call-${conversationId}`).
  const roomName = conversationId ? `call-${conversationId}` : String(callId);

  const { profileId, displayName } = await loadProfileForAuth(authUid);

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
