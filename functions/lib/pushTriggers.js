import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { db } from './_shared/admin.js';
import { dispatchDmPushToProfile, dispatchCallPushToProfile, messagePreview } from './_shared/fcmPush.js';
import { resolvePushTargetProfileId } from './_shared/onesignalPush.js';
function asString(value) {
    if (typeof value === 'string' && value.trim())
        return value.trim();
    return undefined;
}
async function resolveProfileRecord(id) {
    const direct = await db.collection('profiles').doc(id).get();
    if (direct.exists) {
        const data = direct.data() || {};
        return {
            id: direct.id,
            user_id: asString(data.user_id),
            display_name: asString(data.display_name),
            username: asString(data.username),
            avatar_url: asString(data.avatar_url),
        };
    }
    const byAuth = await db.collection('profiles').where('user_id', '==', id).limit(1).get();
    if (!byAuth.empty) {
        const doc = byAuth.docs[0];
        const data = doc.data();
        return {
            id: doc.id,
            user_id: asString(data.user_id),
            display_name: asString(data.display_name),
            username: asString(data.username),
            avatar_url: asString(data.avatar_url),
        };
    }
    return null;
}
async function senderIdentityIds(senderId) {
    const ids = new Set([senderId]);
    const profile = await resolveProfileRecord(senderId);
    if (profile?.id)
        ids.add(profile.id);
    if (profile?.user_id)
        ids.add(profile.user_id);
    return ids;
}
function isSenderMember(senderIds, memberUserId) {
    return senderIds.has(memberUserId);
}
async function notifyDmRecipients(message, messageId) {
    if (message.is_deleted === true)
        return;
    if (message.is_optimistic === true)
        return;
    const conversationId = asString(message.conversation_id);
    const rawSenderId = asString(message.sender_id);
    if (!conversationId || !rawSenderId)
        return;
    const senderProfile = await resolveProfileRecord(rawSenderId);
    const senderIds = await senderIdentityIds(rawSenderId);
    const canonicalSenderId = senderProfile?.id || rawSenderId;
    const senderName = asString(senderProfile?.display_name) ||
        asString(senderProfile?.username) ||
        'Someone';
    const senderAvatar = asString(senderProfile?.avatar_url);
    const [convSnap, membersSnap] = await Promise.all([
        db.collection('conversations').doc(conversationId).get(),
        db.collection('conversation_members').where('conversation_id', '==', conversationId).get(),
    ]);
    const conversation = convSnap.data() || {};
    const isGroup = conversation.is_group === true;
    const title = isGroup ? (asString(conversation.name) || senderName) : senderName;
    const body = messagePreview(message);
    const type = isGroup ? 'group_message' : 'dm';
    const url = `/messages/${conversationId}`;
    const recipientUserIds = new Set();
    for (const doc of membersSnap.docs) {
        const member = doc.data();
        const memberUserId = asString(member.user_id);
        if (!memberUserId || member.is_muted === true)
            continue;
        if (isSenderMember(senderIds, memberUserId))
            continue;
        recipientUserIds.add(memberUserId);
    }
    // Deterministic 1:1 chats may only have member_ids on the conversation doc.
    if (!recipientUserIds.size) {
        const memberIds = conversation.member_ids;
        if (Array.isArray(memberIds)) {
            for (const id of memberIds) {
                const pid = asString(id);
                if (!pid || isSenderMember(senderIds, pid))
                    continue;
                recipientUserIds.add(pid);
            }
        }
    }
    await Promise.all([...recipientUserIds].map(async (recipientUserId) => {
        const recipientProfileId = await resolvePushTargetProfileId(recipientUserId);
        await db.collection('notifications').add({
            user_id: recipientProfileId,
            actor_id: canonicalSenderId,
            title,
            body,
            url,
            type,
            conversation_id: conversationId,
            sender_id: canonicalSenderId,
            message_id: messageId,
            created_at: new Date().toISOString(),
            read: false,
        });
        const pushResult = await dispatchDmPushToProfile(recipientProfileId, {
            title,
            body,
            url,
            tag: `vybe-dm-${conversationId}`,
            type,
            data: {
                conversationId,
                senderId: canonicalSenderId,
                senderName,
                senderAvatar: senderAvatar || '',
                messageId,
                preview: body,
                path: url,
            },
        });
        if (pushResult.sent === 0) {
            console.warn('[onDmMessageCreated] no push targets for', recipientProfileId, conversationId);
        }
    }));
}
async function notifyCallRecipients(call, callId) {
    if (asString(call.status) !== 'ringing')
        return;
    const callerId = asString(call.caller_id);
    const conversationId = asString(call.conversation_id);
    const receiverId = asString(call.receiver_id);
    const isGroup = call.is_group_call === true;
    const callType = asString(call.call_type) || 'audio';
    if (!callerId || !conversationId)
        return;
    const [callerSnap, convSnap] = await Promise.all([
        db.collection('profiles').doc(callerId).get(),
        db.collection('conversations').doc(conversationId).get(),
    ]);
    const caller = callerSnap.data() || {};
    const conversation = convSnap.data() || {};
    const callerName = asString(caller.display_name) || asString(caller.username) || 'Someone';
    const callTypeLabel = callType === 'video' ? 'FaceTime' : 'audio call';
    const title = isGroup
        ? `${asString(conversation.name) || 'Group'} • Incoming ${callTypeLabel}`
        : `Incoming ${callTypeLabel}`;
    const body = `${callerName} is calling…`;
    const url = `/messages/${conversationId}?call=${callId}`;
    const recipientIds = new Set();
    if (receiverId && receiverId !== callerId)
        recipientIds.add(receiverId);
    if (isGroup) {
        const members = await db
            .collection('conversation_members')
            .where('conversation_id', '==', conversationId)
            .get();
        for (const doc of members.docs) {
            const uid = asString(doc.data().user_id);
            if (uid && uid !== callerId)
                recipientIds.add(uid);
        }
    }
    const participantIds = call.participant_ids;
    if (Array.isArray(participantIds)) {
        for (const id of participantIds) {
            const pid = asString(id);
            if (pid && pid !== callerId)
                recipientIds.add(pid);
        }
    }
    await Promise.all([...recipientIds].map(async (recipientId) => {
        const recipientProfileId = await resolvePushTargetProfileId(recipientId);
        const pushResult = await dispatchCallPushToProfile(recipientProfileId, {
            title,
            body,
            url,
            tag: `vybe-call-${callId}`,
            type: 'call',
            data: {
                type: 'call',
                callId,
                conversationId,
                callType,
                callerId,
                callerName,
                path: url,
                action: 'open',
            },
        });
        if (pushResult.sent === 0) {
            console.warn('[onCallCreated] no push targets for', recipientProfileId);
        }
    }));
}
const ONESIGNAL_SECRETS = ['ONESIGNAL_APP_ID', 'ONESIGNAL_REST_API_KEY'];
/** Flat messages collection (primary DM path after Firebase migration). */
export const onDmMessageCreated = onDocumentCreated({ document: 'messages/{messageId}', region: 'us-central1', secrets: [...ONESIGNAL_SECRETS] }, async (event) => {
    const snap = event.data;
    if (!snap)
        return;
    try {
        await notifyDmRecipients(snap.data(), snap.id);
    }
    catch (err) {
        console.error('[onDmMessageCreated]', err);
    }
});
/** Subcollection path (future / dual-write). */
export const onConversationMessageCreated = onDocumentCreated({ document: 'conversations/{cid}/messages/{messageId}', region: 'us-central1' }, async (event) => {
    const snap = event.data;
    if (!snap)
        return;
    const data = snap.data();
    if (!data.conversation_id) {
        data.conversation_id = event.params.cid;
    }
    try {
        await notifyDmRecipients(data, snap.id);
    }
    catch (err) {
        console.error('[onConversationMessageCreated]', err);
    }
});
/** Incoming call ring — high-priority FCM to callee(s). */
export const onCallCreated = onDocumentCreated({ document: 'calls/{callId}', region: 'us-central1', secrets: [...ONESIGNAL_SECRETS] }, async (event) => {
    const snap = event.data;
    if (!snap)
        return;
    try {
        await notifyCallRecipients(snap.data(), snap.id);
    }
    catch (err) {
        console.error('[onCallCreated]', err);
    }
});
//# sourceMappingURL=pushTriggers.js.map