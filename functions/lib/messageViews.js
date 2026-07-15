import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { db } from './_shared/admin.js';
function asString(v) {
    return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}
/** Enforce view-once / replay-once limits when a message view is recorded. */
export const onMessageViewCreated = onDocumentCreated({ document: 'message_views/{viewId}', region: 'us-central1' }, async (event) => {
    const view = event.data?.data();
    if (!view)
        return;
    const messageId = asString(view.message_id);
    const viewerId = asString(view.viewer_id) || asString(view.user_id);
    if (!messageId)
        return;
    const msgRef = db.collection('messages').doc(messageId);
    const msgSnap = await msgRef.get();
    if (!msgSnap.exists)
        return;
    const msg = msgSnap.data() || {};
    const viewMode = asString(msg.view_mode) || 'permanent';
    const now = new Date().toISOString();
    if (viewMode === 'view_once') {
        await msgRef.set({
            expires_at: now,
            replay_count: (typeof msg.replay_count === 'number' ? msg.replay_count : 0) + 1,
            updated_at: now,
        }, { merge: true });
        return;
    }
    if (viewMode === '24h' || viewMode === 'timed') {
        const saved = msg.saved_by_sender === true || msg.saved_by_recipient === true;
        if (!saved) {
            const existing = asString(msg.expires_at);
            // Start (or refresh) the 24h clock from first open — not send time.
            if (!existing) {
                await msgRef.set({
                    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                    viewed_at: now,
                    updated_at: now,
                }, { merge: true });
            }
        }
    }
    if (viewMode === 'replay_once') {
        const maxReplays = typeof msg.max_replays === 'number' ? msg.max_replays : 1;
        const replayCount = (typeof msg.replay_count === 'number' ? msg.replay_count : 0) + 1;
        const updates = {
            replay_count: replayCount,
            updated_at: now,
        };
        if (replayCount >= maxReplays) {
            updates.expires_at = now;
        }
        await msgRef.set(updates, { merge: true });
    }
    if (viewerId) {
        await event.data?.ref.set({ replay_used: true, viewer_id: viewerId }, { merge: true });
    }
});
//# sourceMappingURL=messageViews.js.map