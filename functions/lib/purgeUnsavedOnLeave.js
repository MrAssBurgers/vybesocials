import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, requireAuth } from './_shared/admin.js';
async function resolveProfileId(uid) {
    const byId = await db.collection('profiles').doc(uid).get();
    if (byId.exists)
        return uid;
    const snap = await db.collection('profiles').where('user_id', '==', uid).limit(1).get();
    if (!snap.empty)
        return snap.docs[0].id;
    return uid;
}
/**
 * purge_unsaved_on_leave — hard-delete unsaved ephemeral messages when leaving a DM.
 * - Always removes messages with view_mode === 'on_close' that neither party saved
 * - If the caller's dm_settings.delete_unsaved_on_leave is true, removes ALL unsaved in the chat
 */
export const purgeUnsavedOnLeave = onCall(async (request) => {
    const uid = requireAuth(request);
    const { conversationId } = (request.data || {});
    if (!conversationId)
        throw new HttpsError('invalid-argument', 'conversationId required');
    const profileId = await resolveProfileId(uid);
    // Membership check: caller MUST be a participant of this conversation.
    // Without this, any signed-in user could hard-delete unsaved messages in
    // strangers' DMs by supplying an arbitrary conversationId.
    const memberSnap = await db
        .collection('conversation_members')
        .where('conversation_id', '==', conversationId)
        .where('user_id', '==', profileId)
        .limit(1)
        .get();
    if (memberSnap.empty) {
        throw new HttpsError('permission-denied', 'Not a participant of this conversation');
    }
    const settingsSnap = await db
        .collection('dm_settings')
        .where('conversation_id', '==', conversationId)
        .where('user_id', '==', profileId)
        .limit(1)
        .get();
    const settings = settingsSnap.empty
        ? null
        : settingsSnap.docs[0].data();
    const purgeAllUnsaved = settings?.delete_unsaved_on_leave === true;
    const msgs = await db
        .collection('messages')
        .where('conversation_id', '==', conversationId)
        .limit(500)
        .get();
    let deleted = 0;
    let batch = db.batch();
    let ops = 0;
    const commitBatch = async () => {
        if (ops === 0)
            return;
        await batch.commit();
        batch = db.batch();
        ops = 0;
    };
    for (const doc of msgs.docs) {
        const m = doc.data();
        if (m.is_deleted === true)
            continue;
        if (m.saved_by_sender === true || m.saved_by_recipient === true)
            continue;
        const mode = String(m.view_mode || '');
        if (!(purgeAllUnsaved || mode === 'on_close'))
            continue;
        batch.delete(doc.ref);
        deleted += 1;
        ops += 1;
        if (ops >= 400)
            await commitBatch();
    }
    await commitBatch();
    return { ok: true, deleted, purgeAllUnsaved };
});
//# sourceMappingURL=purgeUnsavedOnLeave.js.map