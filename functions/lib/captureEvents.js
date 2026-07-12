import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { db } from './_shared/admin.js';
function asString(v) {
    return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}
/** Dedupe capture events, insert system message, notify participants. */
export const onCaptureEventCreated = onDocumentCreated({ document: 'capture_events/{eventId}', region: 'us-central1' }, async (event) => {
    const data = event.data?.data();
    if (!data)
        return;
    const eventKey = asString(data.event_key);
    if (eventKey) {
        const dupe = await db
            .collection('capture_events')
            .where('event_key', '==', eventKey)
            .limit(2)
            .get();
        if (dupe.size > 1) {
            await event.data?.ref.delete();
            return;
        }
    }
    const conversationId = asString(data.conversation_id);
    const capturedBy = asString(data.captured_by) || asString(data.user_id);
    const eventType = asString(data.event_type) || 'screenshot_chat';
    const now = new Date().toISOString();
    if (!conversationId)
        return;
    const isRecording = eventType.includes('record');
    const content = isRecording
        ? 'may have started screen recording'
        : 'took a screenshot';
    const msgRef = db.collection('messages').doc();
    await msgRef.set({
        id: msgRef.id,
        conversation_id: conversationId,
        sender_id: capturedBy || 'system',
        content,
        message_type: isRecording ? 'screen_recording_notification' : 'screenshot_notification',
        media_url: null,
        media_type: null,
        view_mode: 'permanent',
        is_deleted: false,
        created_at: now,
    });
    if (capturedBy) {
        await db.collection('screenshot_notifications').add({
            conversation_id: conversationId,
            user_id: capturedBy,
            message_id: msgRef.id,
            event_type: eventType,
            created_at: now,
        });
    }
});
//# sourceMappingURL=captureEvents.js.map