import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, requireAuth, rateLimit, enforceRateLimit } from './_shared/admin.js';
import { isConversationPairBlocked, validDocumentId, withConversationAccess } from './_shared/conversationMembership.js';
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
const ALLOWED_VIEW_MODES = new Set([
    'permanent',
    'view_once',
    'replay_once',
    '24h',
    'timed',
    'keep',
    'on_close',
]);
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
/**
 * Canonical DM send — single enforcement point for blocks, rate limits,
 * membership, schema, media, and idempotent reconnect retries.
 */
/** Fractional CPU — default Gen2 1 vCPU blows project cpu_allocation under concurrent cold starts.
 * CPU < 1 requires concurrency 1 (Cloud Run). Prefer more small instances over fat ones.
 */
const SEND_DM_OPTS = {
    region: 'us-central1',
    memory: '256MiB',
    cpu: 0.083,
    concurrency: 1,
    maxInstances: 40,
};
export const sendDmMessage = onCall(SEND_DM_OPTS, async (request) => {
    const authUid = requireAuth(request);
    const data = (request.data || {});
    // Bind new clients' queued intent to the identity present at dispatch. The
    // SDK may acquire a token asynchronously after the local account changes.
    if (data.expectedSenderUid !== undefined && data.expectedSenderUid !== authUid) {
        throw new HttpsError('failed-precondition', 'Your account changed. Open this chat again before sending.');
    }
    const allowed = await rateLimit(`dm-send:${authUid}`, 60, 60);
    enforceRateLimit(allowed);
    const conversationId = typeof data.conversationId === 'string' ? data.conversationId.trim() : '';
    if (!validDocumentId(conversationId))
        throw new HttpsError('invalid-argument', 'Valid conversationId required');
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
    const now = new Date().toISOString();
    // 24h/timed: start the clock at send so unsaved messages purge even if never opened.
    // on_close / view_once: no expires_at here — leave-purge or first view handles it.
    const expiresAt = viewMode === '24h' || viewMode === 'timed'
        ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        : null;
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
    const result = await withConversationAccess(conversationId, { profileId: senderProfileId, authUid }, {
        allowCreate: true, repair: true, peerHint: data.otherProfileId,
    }, async (tx, access) => {
        if (!access.isGroup && access.other) {
            if (await isConversationPairBlocked(tx, { profileId: senderProfileId, authUid }, access.other)) {
                throw new HttpsError('permission-denied', 'You can’t message this user');
            }
        }
        if (clientMessageId) {
            const existing = await tx.get(db.collection('messages').where('conversation_id', '==', conversationId)
                .where('client_message_id', '==', clientMessageId).where('sender_id', '==', senderProfileId).limit(1));
            if (!existing.empty)
                return { message: { ...existing.docs[0].data(), id: existing.docs[0].id }, deduped: true,
                    otherProfileId: access.other?.profileId ?? null, treatAsDirect: !access.isGroup };
        }
        tx.create(msgRef, message);
        return { message, deduped: false, otherProfileId: access.other?.profileId ?? null, treatAsDirect: !access.isGroup };
    });
    const { otherProfileId, treatAsDirect } = result;
    if (result.deduped) {
        const sender = await loadProfile(senderProfileId);
        return { message: { ...result.message, sender: sender ? {
                    id: sender.id, username: sender.username || '', avatar_url: sender.avatar_url ?? null,
                    display_name: sender.display_name || sender.username || null,
                } : null }, deduped: true };
    }
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
    if (treatAsDirect && otherProfileId) {
        try {
            const { mapDmSendToRelationshipEvent, recordRelationshipActivity } = await import('./relationshipEngine.js');
            const relEvent = mapDmSendToRelationshipEvent(messageType, data.mediaType || null, Boolean(data.replyToId));
            if (relEvent) {
                await recordRelationshipActivity({
                    actorId: senderProfileId,
                    friendId: otherProfileId,
                    eventType: relEvent,
                    sourceId: msgRef.id,
                    occurredAt: now,
                });
                const { applyVybeScoreEvent } = await import('./vybeScore.js');
                const scoreType = relEvent === 'snap_reply' ? 'snap_reply'
                    : messageType === 'video' ? 'snap_video_sent'
                        : 'snap_sent';
                if (relEvent.startsWith('snap')) {
                    await applyVybeScoreEvent({
                        userId: senderProfileId,
                        eventType: scoreType,
                        sourceId: msgRef.id,
                        idempotencyKey: `snap:${msgRef.id}:sender`,
                    });
                }
            }
        }
        catch (err) {
            console.warn('[sendDmMessage] relationship activity skipped', err);
        }
    }
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