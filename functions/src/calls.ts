import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, requireAuth } from './_shared/admin.js';

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

function inferOtherParticipantId(conversationId: string, myProfileId: string): string | null {
  const parts = conversationId.split('_').filter(Boolean);
  if (parts.length !== 2) return null;
  const [a, b] = parts;
  if (a === myProfileId) return b;
  if (b === myProfileId) return a;
  return null;
}

async function ensureConversationMembershipAdmin(
  conversationId: string,
  senderProfileId: string,
  senderAuthUid: string,
  otherProfileId?: string | null,
): Promise<void> {
  const now = new Date().toISOString();
  const otherProfile = otherProfileId
    ? await db.collection('profiles').doc(otherProfileId).get()
    : null;
  const otherAuthUid =
    otherProfile?.exists && typeof otherProfile.data()?.user_id === 'string'
      ? (otherProfile.data()!.user_id as string)
      : null;

  const memberIds = [
    ...new Set(
      [senderProfileId, senderAuthUid, otherProfileId, otherAuthUid].filter(Boolean),
    ),
  ] as string[];

  const convRef = db.collection('conversations').doc(conversationId);
  const convSnap = await convRef.get();
  if (!convSnap.exists) {
    const parts = conversationId.split('_').filter(Boolean);
    const callerInId =
      parts.length === 2 && (parts[0] === senderProfileId || parts[1] === senderProfileId);
    if (!callerInId) {
      throw new HttpsError('permission-denied', 'Not a participant of this conversation');
    }
    await convRef.set({
      id: conversationId,
      is_group: false,
      member_ids: memberIds,
      name: null,
      avatar_url: null,
      created_by: senderProfileId,
      created_at: now,
      updated_at: now,
    });
  } else {
    const existing = (convSnap.data()?.member_ids as string[]) || [];
    let isExistingMember =
      existing.includes(senderProfileId) || existing.includes(senderAuthUid);
    if (!isExistingMember) {
      const memberDoc = await db
        .collection('conversation_members')
        .doc(`${conversationId}_${senderProfileId}`)
        .get();
      const authMemberDoc = memberDoc.exists
        ? memberDoc
        : await db
            .collection('conversation_members')
            .doc(`${conversationId}_${senderAuthUid}`)
            .get();
      isExistingMember = authMemberDoc.exists;
    }
    if (!isExistingMember) {
      throw new HttpsError('permission-denied', 'Not a member of this conversation');
    }
    const merged = [...new Set([...existing, senderProfileId, senderAuthUid])];
    if (merged.length !== existing.length) {
      await convRef.set({ member_ids: merged, updated_at: now }, { merge: true });
    }
  }

  const batch = db.batch();
  for (const memberId of memberIds) {
    const compositeId = `${conversationId}_${memberId}`;
    batch.set(
      db.collection('conversation_members').doc(compositeId),
      {
        id: compositeId,
        conversation_id: conversationId,
        user_id: memberId,
        role: memberId === senderProfileId ? 'admin' : 'member',
        is_muted: false,
        is_pinned: false,
        last_read_at: null,
        created_at: now,
        updated_at: now,
      },
      { merge: true },
    );
  }
  await batch.commit();

  await db.collection('user_auth_index').doc(senderAuthUid).set(
    { profile_id: senderProfileId, updated_at: now },
    { merge: true },
  );
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

  const conversationId = data.conversationId?.trim();
  const receiverRaw = data.receiverId?.trim();
  if (!conversationId || !receiverRaw) {
    throw new HttpsError('invalid-argument', 'conversationId and receiverId required');
  }

  const callerProfileId = await resolveProfileId(authUid);
  const receiverProfileId = await normalizeProfileId(receiverRaw);
  const otherProfileId =
    inferOtherParticipantId(conversationId, callerProfileId) || receiverProfileId;

  await ensureConversationMembershipAdmin(
    conversationId,
    callerProfileId,
    authUid,
    otherProfileId,
  );

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

  await ref.set(call);
  return { call };
});
