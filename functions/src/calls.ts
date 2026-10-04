import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, requireAuth } from './_shared/admin.js';
import { isConversationPairBlocked, validDocumentId, withConversationAccess } from './_shared/conversationMembership.js';

async function resolveProfileId(authUid: string): Promise<string> {
  const index = await db.collection('user_auth_index').doc(authUid).get();
  const fromIndex = index.data()?.profile_id;
  if (typeof fromIndex === 'string' && fromIndex) return fromIndex;

  const byAuth = await db.collection('profiles').where('user_id', '==', authUid).limit(1).get();
  if (!byAuth.empty) return byAuth.docs[0].id;
  return authUid;
}

async function normalizeProfileId(idOrAuth: string): Promise<string> {
  const direct = await db.collection('profiles').doc(idOrAuth).get();
  if (direct.exists) return direct.id;
  const byAuth = await db.collection('profiles').where('user_id', '==', idOrAuth).limit(1).get();
  if (!byAuth.empty) return byAuth.docs[0].id;
  return idOrAuth;
}

/** Server-side call row creation when client Firestore rules reject the insert. */
export const startDmCall = onCall({ region: 'us-central1' }, async (request) => {
  const authUid = requireAuth(request);
  const data = (request.data || {}) as {
    conversationId?: string;
    receiverId?: string;
    callType?: 'audio' | 'video';
    isGroupCall?: boolean;
    callMode?: 'p2p' | 'persistent';
  };

  const conversationId = typeof data.conversationId === 'string' ? data.conversationId.trim() : '';
  const receiverRaw = typeof data.receiverId === 'string' ? data.receiverId.trim() : '';
  if (!validDocumentId(conversationId) || !validDocumentId(receiverRaw)) {
    throw new HttpsError('invalid-argument', 'conversationId and receiverId required');
  }

  const callerProfileId = await resolveProfileId(authUid);
  const receiverProfileId = await normalizeProfileId(receiverRaw);
  const callType = data.callType === 'video' ? 'video' : 'audio';
  const callMode = data.callMode === 'persistent' ? 'persistent' : 'p2p';
  const roomName = `call-${conversationId}`;
  const now = new Date().toISOString();

  const ref = db.collection('calls').doc();
  const call = {
    id: ref.id,
    conversation_id: conversationId,
    caller_id: callerProfileId,
    receiver_id: receiverProfileId,
    call_type: callType,
    status: 'ringing',
    room_name: roomName,
    is_group_call: Boolean(data.isGroupCall),
    call_mode: callMode,
    ring_expires_at: new Date(Date.now() + 30_000).toISOString(),
    created_at: now,
  };

  return withConversationAccess(conversationId, { profileId: callerProfileId, authUid }, {
    allowCreate: true, repair: true, peerHint: receiverProfileId, requirePeer: true,
  }, async (tx, access) => {
    if (!access.other) throw new HttpsError('permission-denied', 'The recipient is not part of this conversation');
    if (await isConversationPairBlocked(tx, { profileId: callerProfileId, authUid }, access.other)) {
      throw new HttpsError('permission-denied', 'You cannot call this user');
    }
    const verifiedCall = { ...call, receiver_id: access.other.profileId, is_group_call: access.isGroup };
    tx.create(ref, verifiedCall);
    return { call: verifiedCall };
  });
});
