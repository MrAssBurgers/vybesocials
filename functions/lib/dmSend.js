import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, requireAuth, rateLimit, enforceRateLimit } from './_shared/admin.js';
const ALLOWED_MESSAGE_TYPES = new Set([
    'text',
    'media',
    'image',
    'video',
    'voice',
    'audio',
    'gif',
    'sticker',
    'vybe',
    'snap',
    'location',
    'contact',
    'poll',
    'event',
    'shared_post',
    'shared_clip',
    'call_event',
    'screenshot_notification',
    'screen_recording_notification',
    'system',
]);
const ALLOWED_VIEW_MODES = new Set(['permanent', 'view_once', 'replay_once', '24h', 'keep']);
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
/** True if either side of a 1:1 pair has blocked the other. */
export async function isBlockedPair(profileIdA, profileIdB) {
    if (!profileIdA || !profileIdB || profileIdA === profileIdB)
        return false;
    const [aBlockedB, bBlockedA] = await Promise.all([
        db
            .collection('blocked_users')
            .where('blocker_id', '==', profileIdA)
            .where('blocked_id', '==', profileIdB)
            .limit(1)
            .get(),
        db
            .collection('blocked_users')
            .where('blocker_id', '==', profileIdB)
            .where('blocked_id', '==', profileIdA)
            .limit(1)
            .get(),
    ]);
    return !aBlockedB.empty || !bBlockedA.empty;
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
async function resolveDirectOtherProfileId(conversationId, senderProfileId, hintedOther) {
    if (hintedOther && hintedOther !== senderProfileId)
        return hintedOther;
    const fromId = inferOtherParticipantId(conversationId, senderProfileId);
    if (fromId)
        return fromId;
    const members = await db
        .collection('conversation_members')
        .where('conversation_id', '==', conversationId)
        .limit(8)
        .get();
    for (const doc of members.docs) {
        const userId = doc.data().user_id;
        if (typeof userId === 'string' && userId && userId !== senderProfileId) {
            return userId;
        }
    }
    const conv = await db.collection('conversations').doc(conversationId).get();
    const memberIds = conv.data()?.member_ids;
    if (Array.isArray(memberIds)) {
        for (const id of memberIds) {
            if (typeof id === 'string' && id && id !== senderProfileId)
                return id;
        }
    }
    return null;
}
function assertValidMediaUrl(mediaUrl, senderProfileId, authUid) {
    if (!mediaUrl)
        return;
    const url = mediaUrl.trim();
    if (!url)
        throw new HttpsError('invalid-argument', 'Invalid media URL');
    if (url.length > 2048)
        throw new HttpsError('invalid-argument', 'Media URL too long');
    // Allow data URLs only for tiny stickers — reject large payloads.
    if (url.startsWith('data:')) {
        if (url.length > 200_000) {
            throw new HttpsError('invalid-argument', 'Invalid media payload');
        }
        return;
    }
    // Relative storage paths / Firebase download URLs / https media.
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('gs://')) {
        // Soft ownership hint — path should include sender id when it's our storage layout.
        const lower = url.toLowerCase();
        if (lower.includes('/chat-media/') ||
            lower.includes('%2fchat-media%2f') ||
            lower.includes('/dm/') ||
            lower.includes('/voice/') ||
            lower.includes('firebasestorage') ||
            lower.includes('googleapis.com')) {
            return;
        }
        // External https (GIF hosts etc.) allowed for known message types.
        if (url.startsWith('https://'))
            return;
        throw new HttpsError('invalid-argument', 'Unsupported media URL');
    }
    // Storage-relative path — must reference caller when path embeds an id.
    if (url.includes(senderProfileId) ||
        url.includes(authUid) ||
        url.startsWith('chat-media/') ||
        url.startsWith('dm/') ||
        url.startsWith('voice/')) {
        return;
    }
    throw new HttpsError('invalid-argument', 'Invalid media ownership');
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
        const parts = conversationId.split('_').filter(Boolean);
        const callerInId = parts.length === 2 && (parts[0] === senderProfileId || parts[1] === senderProfileId);
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
    }
    else {
        const existing = convSnap.data()?.member_ids || [];
        let isExistingMember = existing.includes(senderProfileId) || existing.includes(senderAuthUid);
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
async function findExistingByClientMessageId(conversationId, senderProfileId, clientMessageId) {
    const snap = await db
        .collection('messages')
        .where('conversation_id', '==', conversationId)
        .where('client_message_id', '==', clientMessageId)
        .limit(1)
        .get();
    if (snap.empty)
        return null;
    const doc = snap.docs[0];
    const data = doc.data();
    if (data.sender_id !== senderProfileId)
        return null;
    return { id: doc.id, ...data };
}
/**
 * Canonical DM send — single enforcement point for blocks, rate limits,
 * membership, schema, media, and idempotent reconnect retries.
 */
export const sendDmMessage = onCall({ region: 'us-central1' }, async (request) => {
    const authUid = requireAuth(request);
    const allowed = await rateLimit(`dm-send:${authUid}`, 60, 60);
    enforceRateLimit(allowed);
    const data = (request.data || {});
    const conversationId = data.conversationId?.trim();
    if (!conversationId)
        throw new HttpsError('invalid-argument', 'conversationId required');
    if (conversationId.length > 200) {
        throw new HttpsError('invalid-argument', 'conversationId too long');
    }
    const content = typeof data.content === 'string' ? data.content.trim() : '';
    const mediaUrl = typeof data.mediaUrl === 'string' ? data.mediaUrl.trim() : null;
    if (!content && !mediaUrl) {
        throw new HttpsError('invalid-argument', 'content or mediaUrl required');
    }
    if (content.length > 8000) {
        throw new HttpsError('invalid-argument', 'Message too long');
    }
    const viewMode = data.viewMode || 'permanent';
    if (!ALLOWED_VIEW_MODES.has(viewMode)) {
        throw new HttpsError('invalid-argument', 'Unsupported view mode');
    }
    const messageType = data.messageType ||
        (mediaUrl ? (data.mediaType === 'vybe' ? 'vybe' : 'media') : 'text');
    if (!ALLOWED_MESSAGE_TYPES.has(messageType)) {
        throw new HttpsError('invalid-argument', 'Unsupported message type');
    }
    const senderProfileId = await resolveProfileId(authUid);
    assertValidMediaUrl(mediaUrl, senderProfileId, authUid);
    const clientMessageId = typeof data.clientMessageId === 'string' && data.clientMessageId.trim()
        ? data.clientMessageId.trim().slice(0, 128)
        : null;
    if (clientMessageId) {
        const existing = await findExistingByClientMessageId(conversationId, senderProfileId, clientMessageId);
        if (existing) {
            const sender = await loadProfile(senderProfileId);
            return {
                message: {
                    ...existing,
                    id: existing.id,
                    sender: sender
                        ? {
                            id: sender.id,
                            username: sender.username || '',
                            avatar_url: sender.avatar_url ?? null,
                            display_name: sender.display_name || sender.username || null,
                        }
                        : null,
                },
                deduped: true,
            };
        }
    }
    const otherProfileId = await resolveDirectOtherProfileId(conversationId, senderProfileId, data.otherProfileId);
    // Load conversation first so we know direct vs group before any writes.
    const convSnap = await db.collection('conversations').doc(conversationId).get();
    const isGroup = Boolean(convSnap.data()?.is_group);
    // New 1:1 threads use sorted-pair ids and are never groups.
    const treatAsDirect = !isGroup ||
        (!convSnap.exists && Boolean(inferOtherParticipantId(conversationId, senderProfileId)));
    if (treatAsDirect && otherProfileId) {
        if (await isBlockedPair(senderProfileId, otherProfileId)) {
            throw new HttpsError('permission-denied', 'You can’t message this user');
        }
    }
    await ensureConversationMembershipAdmin(conversationId, senderProfileId, authUid, otherProfileId);
    // Re-resolve after membership in case the conversation uses non-pair ids.
    if (treatAsDirect) {
        const resolvedOther = await resolveDirectOtherProfileId(conversationId, senderProfileId, otherProfileId);
        if (resolvedOther && (await isBlockedPair(senderProfileId, resolvedOther))) {
            throw new HttpsError('permission-denied', 'You can’t message this user');
        }
    }
    const now = new Date().toISOString();
    const expiresAt = viewMode === '24h' ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : null;
    const msgRef = db.collection('messages').doc();
    const message = {
        id: msgRef.id,
        conversation_id: conversationId,
        sender_id: senderProfileId,
        content: content || null,
        media_url: mediaUrl,
        media_type: data.mediaType || null,
        message_type: messageType,
        view_mode: viewMode,
        expires_at: expiresAt,
        is_deleted: false,
        reply_to_id: data.replyToId ?? null,
        client_message_id: clientMessageId,
        created_at: now,
    };
    await msgRef.set(message);
    await db.collection('conversations').doc(conversationId).set({ updated_at: now }, { merge: true });
    // Lightweight audit trail for enforcement / abuse review.
    await db
        .collection('dm_send_audit')
        .doc(msgRef.id)
        .set({
        message_id: msgRef.id,
        conversation_id: conversationId,
        sender_id: senderProfileId,
        auth_uid: authUid,
        other_profile_id: otherProfileId,
        message_type: messageType,
        has_media: Boolean(mediaUrl),
        client_message_id: clientMessageId,
        created_at: now,
    })
        .catch((err) => console.warn('[sendDmMessage] audit write failed', err));
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
        deduped: false,
    };
});
//# sourceMappingURL=dmSend.js.map