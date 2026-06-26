import { db } from './admin.js';
const PRESENCE_STALE_MS = 30_000;
function asString(value) {
    if (typeof value === 'string' && value.trim())
        return value.trim();
    return undefined;
}
async function resolveAuthUidForProfile(profileId) {
    const prof = await db.collection('profiles').doc(profileId).get();
    if (!prof.exists)
        return null;
    return asString(prof.data()?.user_id) || null;
}
async function isBlockedEitherWay(a, b) {
    const [ab, ba] = await Promise.all([
        db.collection('blocked_users').where('blocker_id', '==', a).where('blocked_id', '==', b).limit(1).get(),
        db.collection('blocked_users').where('blocker_id', '==', b).where('blocked_id', '==', a).limit(1).get(),
    ]);
    return !ab.empty || !ba.empty;
}
async function isConversationMuted(recipientProfileId, conversationId) {
    const authUid = await resolveAuthUidForProfile(recipientProfileId);
    const userIds = [recipientProfileId];
    if (authUid && authUid !== recipientProfileId)
        userIds.push(authUid);
    for (const uid of userIds) {
        const snap = await db
            .collection('conversation_notification_prefs')
            .where('conversation_id', '==', conversationId)
            .where('user_id', '==', uid)
            .limit(1)
            .get();
        if (snap.empty)
            continue;
        const mutedUntil = asString(snap.docs[0].data().muted_until);
        if (mutedUntil && new Date(mutedUntil).getTime() > Date.now())
            return true;
    }
    return false;
}
async function isViewingConversation(recipientProfileId, conversationId) {
    const presence = await db.collection('users').doc(recipientProfileId).get();
    if (!presence.exists)
        return false;
    const data = presence.data() || {};
    // Backgrounded users should still receive push (Despia WebView may not fire visibilitychange).
    if (data.online === false)
        return false;
    if (asString(data.active_conversation) !== conversationId)
        return false;
    const updated = asString(data.updated_at) || asString(data.last_seen);
    if (!updated)
        return false;
    return Date.now() - new Date(updated).getTime() < PRESENCE_STALE_MS;
}
/** Server-side smart delivery — skip push when user is already engaged or blocked. */
export async function shouldSkipRecipientPush(input) {
    const { recipientProfileId, senderProfileId, conversationId, type, checkActiveConversation } = input;
    if (await isBlockedEitherWay(recipientProfileId, senderProfileId)) {
        return { skip: true, reason: 'blocked' };
    }
    const dmLike = type === 'dm' ||
        type === 'group_message' ||
        type === 'typing' ||
        type === 'mention' ||
        type === 'reply';
    if (conversationId && dmLike) {
        if (checkActiveConversation !== false && (await isViewingConversation(recipientProfileId, conversationId))) {
            return { skip: true, reason: 'viewing_conversation' };
        }
        if (await isConversationMuted(recipientProfileId, conversationId)) {
            return { skip: true, reason: 'conversation_muted' };
        }
    }
    return { skip: false };
}
export async function logPushDelivery(entry) {
    try {
        await db.collection('push_delivery_logs').add({
            ...entry,
            created_at: new Date().toISOString(),
        });
    }
    catch (err) {
        console.warn('[pushDeliveryLog] write failed', err);
    }
}
//# sourceMappingURL=smartPushGate.js.map