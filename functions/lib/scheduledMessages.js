import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db } from './_shared/admin.js';
const BATCH = 40;
/** Deliver pending scheduled_messages via server message write. */
export const processDueScheduledMessages = onSchedule({ schedule: 'every 1 minutes', region: 'us-central1' }, async () => {
    const now = new Date().toISOString();
    const snap = await db
        .collection('scheduled_messages')
        .where('status', '==', 'pending')
        .where('scheduled_at', '<=', now)
        .limit(BATCH)
        .get();
    if (snap.empty)
        return;
    for (const doc of snap.docs) {
        const row = doc.data();
        const conversationId = row.conversation_id;
        const senderId = row.sender_id;
        if (!conversationId || !senderId) {
            await doc.ref.update({ status: 'failed', error: 'missing_fields', updated_at: now });
            continue;
        }
        const content = typeof row.content === 'string' ? row.content : '';
        const mediaUrl = typeof row.media_url === 'string' ? row.media_url : null;
        if (!content && !mediaUrl) {
            await doc.ref.update({ status: 'failed', error: 'empty_payload', updated_at: now });
            continue;
        }
        const viewMode = row.view_mode || 'permanent';
        const msgRef = db.collection('messages').doc();
        const message = {
            id: msgRef.id,
            conversation_id: conversationId,
            sender_id: senderId,
            content: content || null,
            media_url: mediaUrl,
            media_type: row.media_type ?? null,
            message_type: row.message_type ?? (mediaUrl ? 'media' : 'text'),
            view_mode: viewMode,
            expires_at: viewMode === '24h' ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : null,
            is_deleted: false,
            reply_to_id: row.reply_to_id ?? null,
            created_at: now,
        };
        await msgRef.set(message);
        await db.collection('conversations').doc(conversationId).set({ updated_at: now }, { merge: true });
        await doc.ref.update({ status: 'sent', sent_message_id: msgRef.id, updated_at: now });
    }
});
//# sourceMappingURL=scheduledMessages.js.map