import { db } from './admin.js';
const PUSH_SUBSCRIPTION_TYPES = ['iOSPush', 'AndroidPush', 'ChromePush', 'FirefoxPush', 'SafariPush', 'HuaweiPush'];
function asString(value) {
    if (typeof value === 'string' && value.trim())
        return value.trim();
    return undefined;
}
async function fetchJsonWithTimeout(url, init, timeoutMs = 4_000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...init, signal: controller.signal });
    }
    finally {
        clearTimeout(timer);
    }
}
/** push_tokens + OneSignal external_id use profiles.id — accept auth uid too. */
export async function resolvePushTargetProfileId(userId) {
    const direct = await db.collection('profiles').doc(userId).get();
    if (direct.exists)
        return userId;
    const byAuth = await db.collection('profiles').where('user_id', '==', userId).limit(1).get();
    if (!byAuth.empty)
        return byAuth.docs[0].id;
    const idx = await db.collection('user_auth_index').doc(userId).get();
    const fromIndex = asString(idx.data()?.profile_id);
    if (fromIndex)
        return fromIndex;
    return userId;
}
function isActivePushSubscription(sub) {
    if (!sub?.id || !sub.type || !PUSH_SUBSCRIPTION_TYPES.includes(sub.type))
        return false;
    return sub.enabled !== false && (sub.notification_types ?? 1) > 0;
}
export async function lookupOneSignalSubscriptionIdsForProfile(appId, restKey, profileId) {
    let ids = await lookupOneSignalSubscriptionIds(appId, restKey, profileId);
    if (ids.length > 0)
        return ids;
    const prof = await db.collection('profiles').doc(profileId).get();
    const authUid = asString(prof.data()?.user_id);
    if (authUid && authUid !== profileId) {
        ids = await lookupOneSignalSubscriptionIds(appId, restKey, authUid);
    }
    return ids;
}
async function lookupOneSignalSubscriptionIds(appId, restKey, externalId) {
    const res = await fetchJsonWithTimeout(`https://api.onesignal.com/apps/${appId}/users/by/external_id/${encodeURIComponent(externalId)}`, { headers: { Authorization: `Key ${restKey}`, Accept: 'application/json' } });
    if (!res.ok)
        return [];
    const user = await res.json().catch(() => null);
    const subs = Array.isArray(user?.subscriptions) ? user.subscriptions : [];
    return subs.filter(isActivePushSubscription).map((sub) => String(sub.id));
}
function subscriptionIdsFromPushTokens(rows) {
    return rows
        .map((row) => row.token)
        .filter((token) => typeof token === 'string' &&
        token.length >= 8 &&
        !token.startsWith('despia:') &&
        !token.startsWith('onesignal:') &&
        !token.startsWith('{'));
}
/** Despia / native shells — OneSignal external_id = profiles.id (Snapchat-style DM alerts). */
export async function dispatchOneSignalToProfile(profileId, payload, forcedSubscriptionIds) {
    const appId = process.env.ONESIGNAL_APP_ID;
    const restKey = process.env.ONESIGNAL_REST_API_KEY;
    if (!appId || !restKey)
        return { sent: 0 };
    const targetProfileId = await resolvePushTargetProfileId(profileId);
    const routePath = payload.url || '/notifications';
    const mergedData = {
        type: payload.type || 'dm',
        url: routePath,
        path: routePath,
        ...(payload.data || {}),
    };
    const isCall = payload.type === 'call';
    const isDm = payload.type === 'dm' || payload.type === 'group_message';
    const conversationId = mergedData.conversationId;
    const senderAvatar = mergedData.senderAvatar || mergedData.image_url;
    const dmChannelId = process.env.ONESIGNAL_DM_CHANNEL_ID;
    const socialChannelId = process.env.ONESIGNAL_SOCIAL_CHANNEL_ID;
    const callChannelId = process.env.ONESIGNAL_CALL_CHANNEL_ID;
    let subscriptionIds = forcedSubscriptionIds?.filter(Boolean) ?? [];
    if (subscriptionIds.length === 0) {
        subscriptionIds = await lookupOneSignalSubscriptionIds(appId, restKey, targetProfileId);
    }
    if (subscriptionIds.length === 0 && targetProfileId !== profileId) {
        subscriptionIds = await lookupOneSignalSubscriptionIds(appId, restKey, profileId);
    }
    if (subscriptionIds.length === 0) {
        const prof = await db.collection('profiles').doc(targetProfileId).get();
        const authUid = asString(prof.data()?.user_id);
        if (authUid && authUid !== targetProfileId) {
            subscriptionIds = await lookupOneSignalSubscriptionIds(appId, restKey, authUid);
        }
    }
    const tokenSnap = await db.collection('push_tokens').where('user_id', '==', targetProfileId).get();
    if (subscriptionIds.length === 0) {
        subscriptionIds = subscriptionIdsFromPushTokens(tokenSnap.docs.map((d) => d.data()));
    }
    const externalIds = [targetProfileId];
    if (profileId !== targetProfileId)
        externalIds.push(profileId);
    const profSnap = await db.collection('profiles').doc(targetProfileId).get();
    const authUidForAlias = asString(profSnap.data()?.user_id);
    if (authUidForAlias && !externalIds.includes(authUidForAlias)) {
        externalIds.push(authUidForAlias);
    }
    const notificationBase = {
        app_id: appId,
        target_channel: 'push',
        headings: { en: payload.title },
        contents: { en: payload.body },
        large_icon: senderAvatar,
        big_picture: senderAvatar,
        ios_attachments: senderAvatar ? { id1: senderAvatar } : undefined,
        chrome_web_image: senderAvatar,
        url: routePath,
        web_url: routePath,
        data: mergedData,
        ios_sound: isCall ? 'ringtone.caf' : 'default',
        ios_interruption_level: isCall ? 'time_sensitive' : 'active',
        android_visibility: 1,
        mutable_content: true,
        content_available: true,
        priority: 10,
        ttl: isCall ? 45 : 86400,
        collapse_id: payload.tag || undefined,
        thread_id: isDm && conversationId ? conversationId : undefined,
        android_group: isDm ? 'vybe_chats' : undefined,
    };
    const channelExtras = isCall
        ? { ...(callChannelId ? { android_channel_id: callChannelId } : {}) }
        : isDm
            ? { ...(dmChannelId ? { android_channel_id: dmChannelId } : {}) }
            : { ...(socialChannelId ? { android_channel_id: socialChannelId } : {}) };
    const body = subscriptionIds.length === 0
        ? {
            ...notificationBase,
            ...channelExtras,
            include_aliases: { external_id: externalIds.slice(0, 20) },
        }
        : {
            ...notificationBase,
            ...channelExtras,
            include_subscription_ids: subscriptionIds,
        };
    try {
        const res = await fetchJsonWithTimeout('https://api.onesignal.com/notifications', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Key ${restKey}`,
            },
            body: JSON.stringify(body),
        });
        const json = await res.json().catch(() => null);
        const recipients = Number(json?.recipients ?? 0);
        const delivered = res.ok && !json?.errors && recipients > 0;
        if (!delivered) {
            console.warn('[onesignalPush] delivery weak', targetProfileId, res.status, JSON.stringify(json).slice(0, 200));
        }
        return {
            sent: delivered ? Math.max(recipients, 1) : 0,
            mode: subscriptionIds.length === 0 ? 'external_id' : 'subscription_ids',
        };
    }
    catch (err) {
        console.warn('[onesignalPush] send failed:', err);
        return { sent: 0 };
    }
}
//# sourceMappingURL=onesignalPush.js.map