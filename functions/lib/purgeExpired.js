import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db } from './_shared/admin.js';
const BATCH = 200;
/** Hard-delete expired DMs/snaps unless saved by either party. */
export const purgeExpiredMessages = onSchedule({ schedule: 'every 60 minutes', region: 'us-central1' }, async () => {
    const now = new Date().toISOString();
    const snap = await db
        .collection('messages')
        .where('expires_at', '<=', now)
        .limit(BATCH)
        .get();
    if (snap.empty)
        return;
    const batch = db.batch();
    let deleted = 0;
    for (const doc of snap.docs) {
        const data = doc.data();
        if (data.saved_by_sender === true || data.saved_by_recipient === true)
            continue;
        if (data.is_deleted === true) {
            batch.delete(doc.ref);
            deleted += 1;
            continue;
        }
        batch.delete(doc.ref);
        deleted += 1;
    }
    if (deleted > 0) {
        await batch.commit();
        console.log(`[purgeExpiredMessages] deleted ${deleted} messages`);
    }
});
//# sourceMappingURL=purgeExpired.js.map