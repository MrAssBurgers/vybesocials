import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { db, messaging, requireAuth, rateLimit, enforceRateLimit } from './_shared/admin.js';
const FCM_VAPID_KEY = process.env.FIREBASE_VAPID_KEY;
/** get-vapid-key — returns the public VAPID key for web push. */
export const getVapidKey = onCall(async () => {
    return { vapid_key: FCM_VAPID_KEY || null };
});
/** send-push-notification — writes notification doc + sends FCM. */
export const sendPushNotification = onCall(async (request) => {
    const callerUid = requireAuth(request);
    enforceRateLimit(await rateLimit(`push:${callerUid}`, 60, 60));
    const { userId, title, body, data: payload, url } = (request.data || {});
    if (!userId)
        throw new HttpsError('invalid-argument', 'userId required');
    await db.collection('notifications').add({
        user_id: userId,
        title: title || 'VYBE',
        body: body || '',
        url: url || null,
        data: payload || null,
        created_at: new Date().toISOString(),
        read: false,
    });
    const tokensSnap = await db.collection('push_tokens').where('user_id', '==', userId).get();
    const tokens = tokensSnap.docs.map((d) => d.data().token).filter(Boolean);
    if (!tokens.length)
        return { ok: true, sent: 0 };
    const res = await messaging.sendEachForMulticast({
        tokens,
        notification: { title: title || 'VYBE', body: body || '' },
        data: { ...(payload || {}), ...(url ? { url } : {}) },
        webpush: url ? { fcmOptions: { link: url } } : undefined,
    });
    // Clean up invalid tokens
    const toDelete = [];
    res.responses.forEach((r, i) => {
        if (!r.success && (r.error?.code === 'messaging/registration-token-not-registered' || r.error?.code === 'messaging/invalid-registration-token')) {
            toDelete.push(tokens[i]);
        }
    });
    if (toDelete.length) {
        const batch = db.batch();
        const delSnap = await db.collection('push_tokens').where('token', 'in', toDelete.slice(0, 10)).get();
        delSnap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
    }
    return { ok: true, sent: res.successCount, failed: res.failureCount };
});
/** link-onesignal-user — store mapping for legacy OneSignal during cutover. */
export const linkOnesignalUser = onCall(async (request) => {
    const uid = requireAuth(request);
    const { onesignal_id, fcm_token, platform } = (request.data || {});
    await db.collection('push_tokens').doc(`${uid}_${platform || 'web'}`).set({
        user_id: uid,
        onesignal_id: onesignal_id || null,
        token: fcm_token || null,
        platform: platform || 'web',
        updated_at: new Date().toISOString(),
    }, { merge: true });
    return { ok: true };
});
/** send-brief-notification — push the user's daily brief. */
export const sendBriefNotification = onCall(async (request) => {
    const uid = requireAuth(request);
    const { title = 'Your daily brief is ready', body = 'Tap to read what\'s new' } = (request.data || {});
    const tokens = (await db.collection('push_tokens').where('user_id', '==', uid).get())
        .docs.map((d) => d.data().token).filter(Boolean);
    if (!tokens.length)
        return { ok: true, sent: 0 };
    const r = await messaging.sendEachForMulticast({ tokens, notification: { title, body } });
    return { ok: true, sent: r.successCount };
});
/** sitemap-dynamic — public HTTP endpoint serving sitemap.xml. */
export const sitemapDynamic = onRequest({ cors: true }, async (_req, res) => {
    const snap = await db.collection('posts').where('visibility', '==', 'public').orderBy('created_at', 'desc').limit(5000).get();
    const urls = snap.docs.map((d) => `<url><loc>https://vybehub.app/post/${d.id}</loc><lastmod>${new Date(d.data().created_at || Date.now()).toISOString()}</lastmod></url>`).join('');
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>https://vybehub.app/</loc><priority>1.0</priority></url>
${urls}
</urlset>`;
    res.set('Content-Type', 'application/xml').send(xml);
});
/** notify-expiring-streaks — scheduled-ish helper (call via cron later). */
export const notifyExpiringStreaks = onCall(async (request) => {
    requireAuth(request);
    // TODO: full streak-window logic. Returns count so callers behave.
    return { notified: 0 };
});
/** mute-smart-pings — flip user preference. */
export const muteSmartPings = onCall(async (request) => {
    const uid = requireAuth(request);
    const { muted } = (request.data || {});
    await db.collection('profiles').doc(uid).set({ smart_pings_muted: !!muted, updated_at: new Date().toISOString() }, { merge: true });
    return { ok: true };
});
//# sourceMappingURL=push.js.map