/**
 * dm_inbox_entries — server-written per-viewer inbox projection.
 *
 * Canonical writes stay on messages / conversations / conversation_members.
 * This module keeps a denormalized inbox row so clients can query one
 * viewer-scoped collection instead of N+1 membership + message + profile reads.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated, onDocumentDeleted, onDocumentUpdated, onDocumentWritten, } from 'firebase-functions/v2/firestore';
import { db, requireAuth, requireAdmin, rateLimit, enforceRateLimit } from './_shared/admin.js';
export const DM_INBOX_PROJECTION_VERSION = 1;
export const DM_INBOX_COLLECTION = 'dm_inbox_entries';
function entryDocId(viewerId, conversationId) {
    return `${viewerId}_${conversationId}`;
}
function asString(value) {
    return typeof value === 'string' && value.trim() ? value : null;
}
function previewFromMessage(message, viewerId, isOwn) {
    if (!message || message.is_deleted || message.deleted_at)
        return 'Message deleted';
    const type = String(message.message_type || message.type || 'text').toLowerCase();
    if (type === 'image' || type === 'photo')
        return isOwn ? 'You: 📷 Photo' : '📷 Photo';
    if (type === 'video')
        return isOwn ? 'You: 🎬 Video' : '🎬 Video';
    if (type === 'audio' || type === 'voice')
        return isOwn ? 'You: 🎤 Voice message' : '🎤 Voice message';
    if (type === 'gif')
        return isOwn ? 'You: GIF' : 'GIF';
    if (type === 'sticker')
        return isOwn ? 'You: Sticker' : 'Sticker';
    if (type === 'location')
        return isOwn ? 'You: 📍 Location' : '📍 Location';
    if (type === 'vybe' || type === 'snap')
        return isOwn ? 'You: VYBE' : 'VYBE';
    const content = (message.content || '').trim();
    if (!content)
        return isOwn ? 'You: Message' : 'Message';
    const clipped = content.length > 56 ? `${content.slice(0, 56)}…` : content;
    return isOwn ? `You: ${clipped}` : clipped;
}
function buildSearchTokens(parts) {
    const tokens = new Set();
    for (const part of parts) {
        if (!part)
            continue;
        const normalized = part.toLowerCase().replace(/[^a-z0-9_\s.@-]/g, ' ').trim();
        if (!normalized)
            continue;
        tokens.add(normalized);
        for (const word of normalized.split(/\s+/)) {
            if (word.length >= 2)
                tokens.add(word);
            for (let i = 2; i <= Math.min(word.length, 12); i++) {
                tokens.add(word.slice(0, i));
            }
        }
    }
    return [...tokens].slice(0, 64);
}
async function loadProfile(profileId) {
    const snap = await db.collection('profiles').doc(profileId).get();
    if (!snap.exists)
        return null;
    return { id: snap.id, ...snap.data() };
}
async function listMemberUserIds(conversationId) {
    const snap = await db
        .collection('conversation_members')
        .where('conversation_id', '==', conversationId)
        .get();
    const ids = new Set();
    for (const doc of snap.docs) {
        const userId = asString(doc.data().user_id);
        if (userId)
            ids.add(userId);
    }
    const conv = await db.collection('conversations').doc(conversationId).get();
    const memberIds = conv.data()?.member_ids;
    if (Array.isArray(memberIds)) {
        for (const id of memberIds) {
            if (typeof id === 'string' && id)
                ids.add(id);
        }
    }
    return [...ids];
}
async function loadViewerMembership(conversationId, viewerId) {
    const exact = await db.collection('conversation_members').doc(`${conversationId}_${viewerId}`).get();
    if (exact.exists)
        return exact.data();
    const snap = await db
        .collection('conversation_members')
        .where('conversation_id', '==', conversationId)
        .where('user_id', '==', viewerId)
        .limit(1)
        .get();
    if (!snap.empty)
        return snap.docs[0].data();
    return null;
}
async function loadLatestMessage(conversationId) {
    const snap = await db
        .collection('messages')
        .where('conversation_id', '==', conversationId)
        .orderBy('created_at', 'desc')
        .limit(8)
        .get();
    for (const doc of snap.docs) {
        const data = doc.data();
        if (data.is_deleted || data.deleted_at)
            continue;
        return { id: doc.id, data };
    }
    return null;
}
async function countUnread(conversationId, viewerId, lastReadAt) {
    const cutoff = lastReadAt || '1970-01-01T00:00:00.000Z';
    const snap = await db
        .collection('messages')
        .where('conversation_id', '==', conversationId)
        .where('created_at', '>', cutoff)
        .orderBy('created_at', 'desc')
        .limit(100)
        .get();
    let unread = 0;
    let mentions = 0;
    for (const doc of snap.docs) {
        const data = doc.data();
        if (data.is_deleted || data.deleted_at)
            continue;
        if (data.sender_id === viewerId)
            continue;
        unread += 1;
        const mentioned = (Array.isArray(data.mentioned_profile_ids) && data.mentioned_profile_ids.includes(viewerId)) ||
            (Array.isArray(data.mentions) && data.mentions.includes(viewerId));
        if (mentioned)
            mentions += 1;
    }
    return { unread, mentions };
}
function inferOtherProfileId(conversationId, viewerId, memberIds) {
    const parts = conversationId.split('_').filter(Boolean);
    if (parts.length === 2) {
        if (parts[0] === viewerId)
            return parts[1];
        if (parts[1] === viewerId)
            return parts[0];
    }
    const others = memberIds.filter((id) => id !== viewerId);
    return others[0] || null;
}
function computeNeedsReply(opts) {
    if (opts.isGroup || opts.isMuted || !opts.latest)
        return false;
    const type = String(opts.latest.message_type || opts.latest.type || 'text').toLowerCase();
    if (['system', 'reaction', 'call', 'missed_call'].includes(type))
        return false;
    if (opts.latest.is_deleted || opts.latest.deleted_at)
        return false;
    if (!opts.latest.sender_id || opts.latest.sender_id === opts.viewerId)
        return false;
    if (!opts.lastReadAt)
        return true;
    if (!opts.latest.created_at)
        return true;
    return new Date(opts.lastReadAt).getTime() < new Date(opts.latest.created_at).getTime();
}
async function resolveRelationshipBadge(viewerId, otherProfileId) {
    if (!otherProfileId)
        return null;
    const closeSnap = await db
        .collection('close_friends')
        .where('user_id', '==', viewerId)
        .where('friend_id', '==', otherProfileId)
        .limit(1)
        .get();
    if (!closeSnap.empty)
        return 'close_friend';
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const accepted = await db
        .collection('friend_requests')
        .where('status', '==', 'accepted')
        .where('updated_at', '>=', thirtyDaysAgo)
        .limit(40)
        .get()
        .catch(async () => db
        .collection('friend_requests')
        .where('status', '==', 'accepted')
        .limit(40)
        .get());
    for (const doc of accepted.docs) {
        const data = doc.data();
        const pair = (data.sender_id === viewerId && data.receiver_id === otherProfileId) ||
            (data.receiver_id === viewerId && data.sender_id === otherProfileId);
        if (!pair)
            continue;
        const when = asString(data.updated_at) || asString(data.accepted_at) || asString(data.created_at);
        if (when && when >= thirtyDaysAgo)
            return 'new_friend';
    }
    return null;
}
async function buildEntryForViewer(conversationId, viewerId) {
    const [convSnap, membership, memberIds, latest] = await Promise.all([
        db.collection('conversations').doc(conversationId).get(),
        loadViewerMembership(conversationId, viewerId),
        listMemberUserIds(conversationId),
        loadLatestMessage(conversationId),
    ]);
    if (!membership && !memberIds.includes(viewerId))
        return null;
    const conv = (convSnap.data() || {});
    const isGroup = Boolean(conv.is_group);
    const isMuted = Boolean(membership?.is_muted);
    const isPinned = Boolean(membership?.is_pinned);
    const isArchived = Boolean(membership?.is_archived);
    const pinOrder = typeof membership?.pin_order === 'number'
        ? membership.pin_order
        : isPinned
            ? Date.parse(membership?.last_read_at || '0') || 0
            : 0;
    const otherProfileId = isGroup
        ? null
        : inferOtherProfileId(conversationId, viewerId, memberIds);
    const otherProfiles = await Promise.all((isGroup ? memberIds.filter((id) => id !== viewerId).slice(0, 3) : otherProfileId ? [otherProfileId] : []).map((id) => loadProfile(id)));
    const primaryOther = otherProfiles[0] || null;
    const secondaryOther = otherProfiles[1] || null;
    let displayName = asString(conv.name) ||
        asString(conv.title) ||
        asString(primaryOther?.display_name) ||
        asString(primaryOther?.username) ||
        (isGroup ? 'Group chat' : 'Chat');
    if (isGroup && !asString(conv.name) && !asString(conv.title)) {
        const names = otherProfiles
            .map((p) => asString(p?.display_name) || asString(p?.username))
            .filter(Boolean)
            .slice(0, 3);
        if (names.length)
            displayName = names.join(', ');
    }
    const latestData = latest?.data || null;
    const isOwn = Boolean(latestData?.sender_id && latestData.sender_id === viewerId);
    const senderProfile = latestData?.sender_id ? await loadProfile(latestData.sender_id) : null;
    const { unread, mentions } = await countUnread(conversationId, viewerId, membership?.last_read_at);
    const needsReply = computeNeedsReply({
        isGroup,
        isMuted,
        latest: latestData,
        viewerId,
        lastReadAt: membership?.last_read_at,
    });
    const relationshipBadge = await resolveRelationshipBadge(viewerId, otherProfileId);
    const activityAt = asString(latestData?.created_at) ||
        asString(conv.updated_at) ||
        new Date().toISOString();
    const entry = {
        viewer_id: viewerId,
        conversation_id: conversationId,
        conversation_type: isGroup ? 'group' : 'direct',
        display_name: displayName,
        username: asString(primaryOther?.username),
        avatar_url: asString(conv.avatar_url) || asString(primaryOther?.avatar_url),
        secondary_avatar_url: asString(secondaryOther?.avatar_url),
        other_profile_id: otherProfileId,
        member_ids: memberIds,
        preview_text: latestData
            ? previewFromMessage(latestData, viewerId, isOwn)
            : isGroup
                ? 'No messages yet'
                : 'Tap to chat',
        latest_message_id: latest?.id || null,
        latest_message_type: String(latestData?.message_type || latestData?.type || 'text'),
        latest_sender_id: asString(latestData?.sender_id),
        latest_sender_name: asString(senderProfile?.display_name) || asString(senderProfile?.username),
        latest_message_at: activityAt,
        delivery_status: asString(latestData?.delivery_status) || (isOwn ? 'sent' : 'received'),
        unread_count: unread,
        mention_count: mentions,
        is_unread: unread > 0,
        is_pinned: isPinned,
        pin_order: pinOrder,
        is_muted: isMuted,
        is_archived: isArchived,
        needs_reply: needsReply,
        streak_count: 0,
        relationship_badge: relationshipBadge,
        is_verified: Boolean(primaryOther?.is_verified),
        search_tokens: buildSearchTokens([
            displayName,
            primaryOther?.username,
            primaryOther?.display_name,
            conversationId,
            otherProfileId,
        ]),
        updated_at: new Date().toISOString(),
        projection_version: DM_INBOX_PROJECTION_VERSION,
    };
    return entry;
}
export async function upsertInboxEntry(conversationId, viewerId) {
    const entry = await buildEntryForViewer(conversationId, viewerId);
    const ref = db.collection(DM_INBOX_COLLECTION).doc(entryDocId(viewerId, conversationId));
    if (!entry) {
        await ref.delete().catch(() => undefined);
        return;
    }
    await ref.set(entry, { merge: true });
}
export async function rebuildConversationInbox(conversationId) {
    const memberIds = await listMemberUserIds(conversationId);
    await Promise.all(memberIds.map((viewerId) => upsertInboxEntry(conversationId, viewerId)));
    return memberIds.length;
}
async function safeRebuild(conversationId, label) {
    if (!conversationId)
        return;
    try {
        await rebuildConversationInbox(conversationId);
    }
    catch (err) {
        console.error(`[dmInboxProjection:${label}]`, conversationId, err);
    }
}
export const onDmInboxMessageCreated = onDocumentCreated({ document: 'messages/{messageId}', region: 'us-central1' }, async (event) => {
    const data = event.data?.data();
    await safeRebuild(data?.conversation_id, 'messageCreated');
});
export const onDmInboxMessageUpdated = onDocumentUpdated({ document: 'messages/{messageId}', region: 'us-central1' }, async (event) => {
    const after = event.data?.after.data();
    const before = event.data?.before.data();
    await safeRebuild(after?.conversation_id || before?.conversation_id, 'messageUpdated');
});
export const onDmInboxMessageDeleted = onDocumentDeleted({ document: 'messages/{messageId}', region: 'us-central1' }, async (event) => {
    const data = event.data?.data();
    await safeRebuild(data?.conversation_id, 'messageDeleted');
});
export const onDmInboxMemberWritten = onDocumentWritten({ document: 'conversation_members/{docId}', region: 'us-central1' }, async (event) => {
    const after = event.data?.after.data();
    const before = event.data?.before.data();
    const conversationId = after?.conversation_id || before?.conversation_id;
    const viewerId = after?.user_id || before?.user_id;
    if (!conversationId || !viewerId)
        return;
    try {
        if (!event.data?.after.exists) {
            await db
                .collection(DM_INBOX_COLLECTION)
                .doc(entryDocId(viewerId, conversationId))
                .delete()
                .catch(() => undefined);
            return;
        }
        await upsertInboxEntry(conversationId, viewerId);
    }
    catch (err) {
        console.error('[dmInboxProjection:memberWritten]', conversationId, viewerId, err);
    }
});
export const onDmInboxConversationWritten = onDocumentWritten({ document: 'conversations/{cid}', region: 'us-central1' }, async (event) => {
    await safeRebuild(event.params.cid, 'conversationWritten');
});
/**
 * Resumable admin backfill. Pass `{ cursor?, limit? }` — cursor is last
 * conversation_members doc id processed.
 */
export const backfillDmInboxEntries = onCall({ region: 'us-central1', timeoutSeconds: 540, memory: '1GiB' }, async (request) => {
    await requireAdmin(request);
    const allowed = await rateLimit(`dm-inbox-backfill:${request.auth.uid}`, 30, 60);
    enforceRateLimit(allowed);
    const data = (request.data || {});
    const limit = Math.min(Math.max(Number(data.limit) || 50, 1), 200);
    let query = db.collection('conversation_members').orderBy('__name__').limit(limit);
    if (data.cursor) {
        const cursorSnap = await db.collection('conversation_members').doc(data.cursor).get();
        if (cursorSnap.exists)
            query = query.startAfter(cursorSnap);
    }
    const snap = await query.get();
    let wrote = 0;
    const seen = new Set();
    for (const doc of snap.docs) {
        const member = doc.data();
        const conversationId = asString(member.conversation_id);
        const viewerId = asString(member.user_id);
        if (!conversationId || !viewerId)
            continue;
        const key = entryDocId(viewerId, conversationId);
        if (seen.has(key))
            continue;
        seen.add(key);
        await upsertInboxEntry(conversationId, viewerId);
        wrote += 1;
    }
    const last = snap.docs[snap.docs.length - 1];
    return {
        ok: true,
        processed: snap.size,
        wrote,
        nextCursor: last?.id || null,
        done: snap.size < limit,
    };
});
/** Viewer-callable force refresh for one conversation (rate limited). */
export const refreshMyDmInboxEntry = onCall({ region: 'us-central1' }, async (request) => {
    const uid = requireAuth(request);
    const allowed = await rateLimit(`dm-inbox-refresh:${uid}`, 60, 60);
    enforceRateLimit(allowed);
    const conversationId = asString(request.data?.conversationId);
    if (!conversationId)
        throw new HttpsError('invalid-argument', 'conversationId required');
    const index = await db.collection('user_auth_index').doc(uid).get();
    const viewerId = (typeof index.data()?.profile_id === 'string' && index.data()?.profile_id) || uid;
    await upsertInboxEntry(conversationId, viewerId);
    return { ok: true };
});
//# sourceMappingURL=dmInboxProjection.js.map