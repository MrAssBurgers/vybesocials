import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { db, requireAuth, rateLimit, enforceRateLimit } from './_shared/admin.js';
import { dispatchPushToProfile, dispatchCallPushToProfile, dispatchDmPushToProfile } from './_shared/fcmPush.js';
const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || process.env.FIREBASE_VAPID_KEY;
/** get-vapid-key — returns the public VAPID key for web push. */
export const getVapidKey = onCall(async () => {
    return { vapid_key: VAPID_PUBLIC || null, publicKey: VAPID_PUBLIC || null };
});
/** send-push-notification — writes notification doc + sends FCM / Web Push. */
export const sendPushNotification = onCall(async (request) => {
    const callerUid = requireAuth(request);
    enforceRateLimit(await rateLimit(`push:${callerUid}`, 60, 60));
    const { userId, title, body, data: payload, url, type, tag, highPriority } = (request.data || {});
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
    const isCall = type === 'call' || !!highPriority;
    const result = isCall
        ? await dispatchCallPushToProfile(userId, {
            title: title || 'VYBE',
            body: body || '',
            url,
            tag,
            type: 'call',
            data: payload,
        })
        : await dispatchDmPushToProfile(userId, {
            title: title || 'VYBE',
            body: body || '',
            url,
            tag,
            type,
            data: payload,
        });
    return {
        ok: true,
        success: result.sent > 0,
        sent: result.sent,
        ...(isCall
            ? {
                android: result.android,
                iosVoip: result.iosVoip,
                iosFallback: result.iosFallback,
                web: result.web,
            }
            : { fcm: result.fcm, web: result.web }),
    };
});
/** Resolve profiles.id from Firebase Auth uid. */
async function resolveProfileIdForAuth(authUid, explicit) {
    if (explicit && explicit !== authUid)
        return explicit;
    const idx = await db.collection('user_auth_index').doc(authUid).get();
    const fromIndex = idx.data()?.profile_id;
    if (fromIndex)
        return fromIndex;
    const prof = await db.collection('profiles').where('user_id', '==', authUid).limit(1).get();
    if (!prof.empty)
        return prof.docs[0].id;
    return authUid;
}
/** link-onesignal-user — register OneSignal external_id + store push tokens. */
export const linkOnesignalUser = onCall({ secrets: ['ONESIGNAL_APP_ID', 'ONESIGNAL_REST_API_KEY'] }, async (request) => {
    const authUid = requireAuth(request);
    const { onesignal_id, fcm_token, platform, voip_token, profile_id, profileId, subscriptionId } = (request.data || {});
    const resolvedProfileId = await resolveProfileIdForAuth(authUid, profile_id || profileId);
    const resolvedPlatform = (platform || 'web').toLowerCase();
    const subId = subscriptionId || onesignal_id || fcm_token;
    const appId = process.env.ONESIGNAL_APP_ID;
    const restKey = process.env.ONESIGNAL_REST_API_KEY;
    let onesignalLinked = false;
    if (appId && restKey) {
        const body = {
            identity: { external_id: resolvedProfileId },
        };
        if (subId && subId.length >= 8 && !subId.startsWith('despia:')) {
            body.subscriptions = [{ id: subId, enabled: true }];
        }
        try {
            const res = await fetch(`https://api.onesignal.com/apps/${appId}/users`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Key ${restKey}`,
                    Accept: 'application/json',
                },
                body: JSON.stringify(body),
            });
            onesignalLinked = res.ok;
            if (!res.ok) {
                const errBody = await res.text().catch(() => '');
                console.warn('[linkOnesignalUser] OneSignal API', res.status, errBody.slice(0, 200));
            }
        }
        catch (err) {
            console.warn('[linkOnesignalUser] OneSignal request failed', err);
        }
    }
    await db.collection('push_tokens').doc(`${resolvedProfileId}_${resolvedPlatform}`).set({
        user_id: resolvedProfileId,
        onesignal_id: subId || null,
        token: fcm_token || subId || null,
        voip_token: voip_token || null,
        platform: resolvedPlatform,
        updated_at: new Date().toISOString(),
    }, { merge: true });
    if (subId && !subId.startsWith('despia:')) {
        await db.collection('push_tokens').doc(`${resolvedProfileId}_despia`).set({
            user_id: resolvedProfileId,
            platform: 'despia',
            token: subId,
            updated_at: new Date().toISOString(),
        }, { merge: true });
    }
    return { ok: true, success: true, linked: onesignalLinked };
});
/** send-brief-notification — push the user's daily brief. */
export const sendBriefNotification = onCall(async (request) => {
    const uid = requireAuth(request);
    const { title = 'Your daily brief is ready', body = 'Tap to read what\'s new' } = (request.data || {});
    const result = await dispatchPushToProfile(uid, { title, body, type: 'brief' });
    return { ok: true, sent: result.sent };
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