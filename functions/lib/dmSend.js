import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, requireAuth } from './_shared/admin.js';
async function resolveProfileId(authUid) {
    const index = await db.collection('user_auth_index').doc(authUid).get();
    const fromIndex = index.data()?.profile_id;
    if (typeof fromIndex === 'string' && fromIndex)
        return fromIndex;
    const byAuth = await db.collection('profiles').where('user_id', '==', authUid).limit(1).get();
    if (!byAuth.empty)
        return byAuth.docs[0].id;
    return authUid;
}
async function loadProfile(id) {
    const direct = await db.collection('profiles').doc(id).get();
    if (direct.exists) {
        const data = direct.data() || {};
        return {
            id: direct.id,
            user_id: typeof data.user_id === 'string' ? data.user_id : undefined,
            username: typeof data.username === 'string' ? data.username : undefined,
            display_name: typeof data.display_name === 'string' ? data.display_name : undefined,
            avatar_url: typeof data.avatar_url === 'string' ? data.avatar_url : null,
        };
    }
    const byAuth = await db.collection('profiles').where('user_id', '==', id).limit(1).get();
    if (byAuth.empty)
        return null;
    const doc = byAuth.docs[0];
    const data = doc.data();
    return {
        id: doc.id,
        user_id: typeof data.user_id === 'string' ? data.user_id : undefined,
        username: typeof data.username === 'string' ? data.username : undefined,
        display_name: typeof data.display_name === 'string' ? data.display_name : undefined,
        avatar_url: typeof data.avatar_url === 'string' ? data.avatar_url : null,
    };
}
function inferOtherParticipantId(conversationId, myProfileId) {
    const parts = conversationId.split('_').filter(Boolean);
    if (parts.length !== 2)
        return null;
    const [a, b] = parts;
    if (a === myProfileId)
        return b;
    if (b === myProfileId)
        return a;
    return null;
}
async function ensureConversationMembershipAdmin(conversationId, senderProfileId, senderAuthUid, otherProfileId) {
    const now = new Date().toISOString();
    const otherProfile = otherProfileId ? await loadProfile(otherProfileId) : null;
    const otherAuthUid = otherProfile?.user_id ?? null;
    const memberIds = [
        ...new Set([senderProfileId, senderAuthUid, otherProfileId, otherAuthUid].filter(Boolean)),
    ];
    const convRef = db.collection('conversations').doc(conversationId);
    const convSnap = await convRef.get();
    if (!convSnap.exists) {
        await convRef.set({
            id: conversationId,
            is_group: memberIds.filter((id) => id !== senderAuthUid && id !== otherAuthUid).length > 2,
            member_ids: memberIds,
            name: null,
            avatar_url: null,
            created_by: senderProfileId,
            created_at: now,
            updated_at: now,
        });
    }
    else {
        const existing = convSnap.data()?.member_ids || [];
        const merged = [...new Set([...existing, ...memberIds])];
        if (merged.length !== existing.length) {
            await convRef.set({ member_ids: merged, updated_at: now }, { merge: true });
        }
    }
    const batch = db.batch();
    for (const memberId of memberIds) {
        const compositeId = `${conversationId}_${memberId}`;
        batch.set(db.collection('conversation_members').doc(compositeId), {
            id: compositeId,
            conversation_id: conversationId,
            user_id: memberId,
            role: memberId === senderProfileId ? 'admin' : 'member',
            is_muted: false,
            is_pinned: false,
            last_read_at: null,
            created_at: now,
            updated_at: now,
        }, { merge: true });
    }
    await batch.commit();
    await db.collection('user_auth_index').doc(senderAuthUid).set({ profile_id: senderProfileId, updated_at: now }, { merge: true });
}
/** Server-side DM send — repairs membership then writes the message (bypasses client rule edge cases). */
export const sendDmMessage = onCall({ region: 'us-central1' }, async (request) => {
    const authUid = requireAuth(request);
    const data = (request.data || {});
    const conversationId = data.conversationId?.trim();
    if (!conversationId)
        throw new HttpsError('invalid-argument', 'conversationId required');
    const content = typeof data.content === 'string' ? data.content.trim() : '';
    const mediaUrl = typeof data.mediaUrl === 'string' ? data.mediaUrl : null;
    if (!content && !mediaUrl)
        throw new HttpsError('invalid-argument', 'content or mediaUrl required');
    const senderProfileId = await resolveProfileId(authUid);
    const otherProfileId = inferOtherParticipantId(conversationId, senderProfileId) ||
        null;
    await ensureConversationMembershipAdmin(conversationId, senderProfileId, authUid, otherProfileId);
    const now = new Date().toISOString();
    const viewMode = data.viewMode || 'permanent';
    const expiresAt = viewMode === '24h' ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : null;
    const msgRef = db.collection('messages').doc();
    const message = {
        id: msgRef.id,
        conversation_id: conversationId,
        sender_id: senderProfileId,
        content: content || null,
        media_url: mediaUrl,
        media_type: data.mediaType || null,
        message_type: data.messageType || (mediaUrl ? 'media' : 'text'),
        view_mode: viewMode,
        expires_at: expiresAt,
        is_deleted: false,
        reply_to_id: data.replyToId ?? null,
        created_at: now,
    };
    await msgRef.set(message);
    await db.collection('conversations').doc(conversationId).set({ updated_at: now }, { merge: true });
    const sender = await loadProfile(senderProfileId);
    return {
        message: {
            ...message,
            sender: sender
                ? {
                    id: sender.id,
                    username: sender.username || '',
                    avatar_url: sender.avatar_url ?? null,
                    display_name: sender.display_name || sender.username || null,
                }
                : null,
        },
    };
});
//# sourceMappingURL=dmSend.js.map