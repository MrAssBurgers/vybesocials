import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { db, requireAuth, rateLimit, enforceRateLimit } from './_shared/admin.js';
import { dispatchPushToProfile, dispatchCallPushToProfile, dispatchDmPushToProfile } from './_shared/fcmPush.js';
import {
  dispatchOneSignalToProfile,
  lookupOneSignalSubscriptionIdsForProfile,
  resolvePushTargetProfileId,
} from './_shared/onesignalPush.js';
import {
  isBlockedByQuietHours,
  isPushAllowedForType,
  loadNotificationPreferences,
  sanitizeDmPushBody,
} from './_shared/pushPreferences.js';

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || process.env.FIREBASE_VAPID_KEY;

/** get-vapid-key — returns the public VAPID key for web push. */
export const getVapidKey = onCall(async () => {
  return { vapid_key: VAPID_PUBLIC || null, publicKey: VAPID_PUBLIC || null };
});

const ONESIGNAL_SECRETS = ['ONESIGNAL_APP_ID', 'ONESIGNAL_REST_API_KEY'] as const;

const SKIP_BELL_PUSH_TYPES = new Set(['dm', 'call', 'group_message', 'typing']);

/** send-push-notification — sends FCM / Web Push (bell row skipped for DM/call/typing). */
export const sendPushNotification = onCall(
  { secrets: [...ONESIGNAL_SECRETS] },
  async (request) => {
  const callerUid = requireAuth(request);
  enforceRateLimit(await rateLimit(`push:${callerUid}`, 60, 60));
  const { userId, title, body, data: payload, url, type, tag, highPriority, subscriptionId, subscriptionIds } =
    (request.data || {}) as {
      userId?: string;
      title?: string;
      body?: string;
      data?: Record<string, string>;
      url?: string;
      type?: string;
      tag?: string;
      highPriority?: boolean;
      subscriptionId?: string;
      subscriptionIds?: string[];
    };
  if (!userId) throw new HttpsError('invalid-argument', 'userId required');

  const targetProfileId = await resolvePushTargetProfileId(userId);
  const prefs = await loadNotificationPreferences(targetProfileId);
  const pushType = type || payload?.type || 'general';

  if (!isPushAllowedForType(pushType, prefs)) {
    return { ok: true, success: false, sent: 0, skipped: 'preference_disabled' };
  }
  if (isBlockedByQuietHours(pushType, prefs)) {
    return { ok: true, success: false, sent: 0, skipped: 'quiet_hours' };
  }

  const sanitizedBody = sanitizeDmPushBody(body || '', pushType, prefs);
  const sanitizedTitle = title || 'VYBE';

  const explicitSubs = [
    subscriptionId,
    ...(Array.isArray(subscriptionIds) ? subscriptionIds : []),
  ].filter(
    (id): id is string =>
      typeof id === 'string' &&
      id.length >= 8 &&
      !id.startsWith('despia:') &&
      !id.startsWith('onesignal:'),
  );

  const skipBell =
    SKIP_BELL_PUSH_TYPES.has(pushType) || payload?.typing === 'true';
  if (!skipBell) {
    await db.collection('notifications').add({
      user_id: targetProfileId,
      title: sanitizedTitle,
      body: sanitizedBody,
      url: url || null,
      data: payload || null,
      created_at: new Date().toISOString(),
      read: false,
    });
  }

  if (explicitSubs.length > 0) {
    const os = await dispatchOneSignalToProfile(
      targetProfileId,
      {
        title: sanitizedTitle,
        body: sanitizedBody,
        url,
        tag,
        type: pushType || 'announcement',
        data: payload,
      },
      explicitSubs,
    );
    return {
      ok: os.sent > 0,
      success: os.sent > 0,
      sent: os.sent,
      onesignal: os.sent,
      mode: os.mode,
      ...(os.sent === 0 ? { error: 'No push tokens found' } : {}),
    };
  }

  const isCall = pushType === 'call' || !!highPriority;
  const result = isCall
    ? await dispatchCallPushToProfile(targetProfileId, {
        title: sanitizedTitle,
        body: sanitizedBody,
        url,
        tag,
        type: 'call',
        data: payload,
      })
    : await dispatchDmPushToProfile(targetProfileId, {
        title: sanitizedTitle,
        body: sanitizedBody,
        url,
        tag,
        type: pushType,
        data: payload,
      });

  return {
    ok: true,
    success: result.sent > 0,
    sent: result.sent,
    ...(result.sent === 0 ? { error: 'No push tokens found' } : {}),
    ...(isCall
      ? {
          android: (result as { android: number }).android,
          iosVoip: (result as { iosVoip: number }).iosVoip,
          iosFallback: (result as { iosFallback: number }).iosFallback,
          web: (result as { web: number }).web,
        }
      : { fcm: (result as { fcm: number }).fcm, web: (result as { web: number }).web }),
  };
});

/** Resolve profiles.id from Firebase Auth uid. */
async function resolveProfileIdForAuth(authUid: string, explicit?: string): Promise<string> {
  if (explicit && explicit !== authUid) return explicit;
  const idx = await db.collection('user_auth_index').doc(authUid).get();
  const fromIndex = idx.data()?.profile_id as string | undefined;
  if (fromIndex) return fromIndex;
  const prof = await db.collection('profiles').where('user_id', '==', authUid).limit(1).get();
  if (!prof.empty) return prof.docs[0].id;
  return authUid;
}

/** link-onesignal-user — register OneSignal external_id + store push tokens. */
export const linkOnesignalUser = onCall(
  { secrets: ['ONESIGNAL_APP_ID', 'ONESIGNAL_REST_API_KEY'] },
  async (request) => {
  const authUid = requireAuth(request);
  const { onesignal_id, fcm_token, platform, voip_token, profile_id, profileId, subscriptionId } =
    (request.data || {}) as {
      onesignal_id?: string;
      fcm_token?: string;
      platform?: string;
      voip_token?: string;
      profile_id?: string;
      profileId?: string;
      subscriptionId?: string;
    };
  const resolvedProfileId = await resolveProfileIdForAuth(authUid, profile_id || profileId);
  const resolvedPlatform = (platform || (subscriptionId ? 'despia' : 'web')).toLowerCase();
  let subId =
    subscriptionId && subscriptionId.length >= 8 && !subscriptionId.startsWith('despia:')
      ? subscriptionId
      : undefined;
  if (!subId && onesignal_id && onesignal_id.length >= 8 && !onesignal_id.startsWith('despia:')) {
    subId = onesignal_id;
  }
  if (!subId && fcm_token && fcm_token.length >= 8 && !fcm_token.startsWith('despia:')) {
    subId = fcm_token;
  }

  const appId = process.env.ONESIGNAL_APP_ID;
  const restKey = process.env.ONESIGNAL_REST_API_KEY;
  let onesignalLinked = false;

  if (appId && restKey) {
    const linkBody: Record<string, unknown> = {
      identity: { external_id: resolvedProfileId },
    };
    if (subId) {
      linkBody.subscriptions = [{ id: subId, enabled: true }];
    }
    try {
      const res = await fetch(`https://api.onesignal.com/apps/${appId}/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Key ${restKey}`,
          Accept: 'application/json',
        },
        body: JSON.stringify(linkBody),
      });
      onesignalLinked = res.ok;
      if (!res.ok && subId) {
        const patchRes = await fetch(
          `https://api.onesignal.com/apps/${appId}/users/by/external_id/${encodeURIComponent(resolvedProfileId)}`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Key ${restKey}`,
              Accept: 'application/json',
            },
            body: JSON.stringify({
              identity: { external_id: resolvedProfileId },
              subscriptions: [{ id: subId, enabled: true }],
            }),
          },
        );
        onesignalLinked = patchRes.ok;
        if (!patchRes.ok) {
          const patchErr = await patchRes.text().catch(() => '');
          console.warn('[linkOnesignalUser] PATCH', patchRes.status, patchErr.slice(0, 200));
        }
      } else if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        console.warn('[linkOnesignalUser] OneSignal API', res.status, errBody.slice(0, 200));
      }
    } catch (err) {
      console.warn('[linkOnesignalUser] OneSignal request failed', err);
    }

    if (!subId) {
      const found = await lookupOneSignalSubscriptionIdsForProfile(appId, restKey, resolvedProfileId);
      if (found.length > 0) {
        subId = found[0];
        onesignalLinked = true;
      }
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

  if (subId) {
    await db.collection('push_tokens').doc(`${resolvedProfileId}_despia`).set({
      user_id: resolvedProfileId,
      platform: 'despia',
      token: subId,
      updated_at: new Date().toISOString(),
    }, { merge: true });
  }

  return {
    ok: true,
    success: onesignalLinked || !!subId,
    linked: onesignalLinked || !!subId,
    subscriptionId: subId || null,
  };
});

/** get-push-subscription-status — OneSignal subscription ids for profiles.id (Despia test flow). */
export const getPushSubscriptionStatus = onCall(
  { secrets: [...ONESIGNAL_SECRETS] },
  async (request) => {
    const authUid = requireAuth(request);
    const { profile_id, profileId } = (request.data || {}) as {
      profile_id?: string;
      profileId?: string;
    };
    const resolvedProfileId = await resolveProfileIdForAuth(authUid, profile_id || profileId);
    const appId = process.env.ONESIGNAL_APP_ID;
    const restKey = process.env.ONESIGNAL_REST_API_KEY;
    if (!appId || !restKey) {
      return {
        ok: false,
        profileId: resolvedProfileId,
        subscriptionIds: [],
        count: 0,
        error: 'onesignal_not_configured',
      };
    }
    const subscriptionIds = await lookupOneSignalSubscriptionIdsForProfile(
      appId,
      restKey,
      resolvedProfileId,
    );
    return {
      ok: true,
      profileId: resolvedProfileId,
      subscriptionIds,
      count: subscriptionIds.length,
    };
  },
);

/** send-brief-notification — push the user's daily brief. */
export const sendBriefNotification = onCall(
  { secrets: [...ONESIGNAL_SECRETS] },
  async (request) => {
  const uid = requireAuth(request);
  const { title = 'Your daily brief is ready', body = 'Tap to read what\'s new' } =
    (request.data || {}) as { title?: string; body?: string };
  const result = await dispatchPushToProfile(uid, { title, body, type: 'brief' });
  return { ok: true, sent: result.sent };
});

/** sitemap-dynamic — public HTTP endpoint serving sitemap.xml. */
export const sitemapDynamic = onRequest({ cors: true }, async (_req, res) => {
  const snap = await db.collection('posts').where('visibility', '==', 'public').orderBy('created_at', 'desc').limit(5000).get();
  const urls = snap.docs.map((d) => `<url><loc>https://vybehub.app/post/${d.id}</loc><lastmod>${new Date((d.data() as any).created_at || Date.now()).toISOString()}</lastmod></url>`).join('');
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
  const { muted } = (request.data || {}) as { muted?: boolean };
  await db.collection('profiles').doc(uid).set({ smart_pings_muted: !!muted, updated_at: new Date().toISOString() }, { merge: true });
  return { ok: true };
});
