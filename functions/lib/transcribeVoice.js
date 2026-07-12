import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { db } from './_shared/admin.js';
function asString(v) {
    return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}
/** Queue voice message transcription (status pending; external worker may fill text). */
export const transcribeVoiceMessage = onDocumentCreated({ document: 'messages/{messageId}', region: 'us-central1' }, async (event) => {
    const msg = event.data?.data();
    if (!msg)
        return;
    const mediaType = asString(msg.media_type);
    if (mediaType !== 'audio' && mediaType !== 'voice')
        return;
    const messageId = event.params.messageId;
    const now = new Date().toISOString();
    await db.collection('message_transcripts').doc(messageId).set({
        message_id: messageId,
        text: '',
        status: 'pending',
        language: null,
        segments: [],
        updated_at: now,
        created_at: now,
    }, { merge: true });
    await event.data?.ref.set({ transcript_status: 'pending', updated_at: now }, { merge: true });
});
//# sourceMappingURL=transcribeVoice.js.map