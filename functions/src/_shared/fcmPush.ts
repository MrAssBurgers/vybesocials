import type { Message, MulticastMessage } from 'firebase-admin/messaging';
import { db, messaging } from './admin.js';
import { dispatchOneSignalToProfile, resolvePushTargetProfileId } from './onesignalPush.js';

export interface PushDispatchPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  type?: string;
  data?: Record<string, string>;
  /** @deprecated Use dispatchCallPushToProfile for calls */
  highPriority?: boolean;
}

export type PushPlatform = 'android' | 'ios' | 'web' | 'despia' | string;

export interface PushDeviceTarget {
  docId: string;
  platform: PushPlatform;
  fcmToken?: string;
  voipToken?: string;
  webSubscription?: string;
}

const IOS_VOIP_TOPIC = process.env.IOS_VOIP_BUNDLE_TOPIC || 'com.despia.vybe.voip';

function asString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  return undefined;
}

function normalizePlatform(raw: unknown): PushPlatform {
  const p = asString(raw)?.toLowerCase() || 'web';
  if (p === 'despia') {
    return 'despia';
  }
  if (p.includes('android')) return 'android';
  if (p.includes('ios') || p === 'iphone' || p === 'ipad') return 'ios';
  return p;
}

function isWebPushSubscriptionJson(token: string): boolean {
  const t = token.trim();
  return t.startsWith('{') && t.includes('"endpoint"');
}

function isSkippableFcmToken(token: string): boolean {
  const t = token.trim();
  if (!t || t.length < 8) return true;
  if (t.startsWith('despia:')) return true;
  if (t.startsWith('onesignal:')) return true;
  return false;
}

function looksLikeFcmToken(token: string): boolean {
  const t = token.trim();
  if (isWebPushSubscriptionJson(t)) return false;
  if (isSkippableFcmToken(t)) return false;
  return t.length >= 20 && !t.startsWith('http');
}

function callDataPayload(payload: PushDispatchPayload): Record<string, string> {
  const data: Record<string, string> = {
    ...(payload.data || {}),
    type: 'call',
    title: payload.title,
    body: payload.body,
  };
  if (payload.url) {
    data.url = payload.url;
    data.path = payload.url;
  }
  if (payload.tag) data.tag = payload.tag;
  return data;
}

async function deleteTokensMatching(token: string): Promise<void> {
  const snap = await db.collection('push_tokens').where('token', '==', token).get();
  if (snap.empty) return;
  const batch = db.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

async function deleteVoipToken(token: string): Promise<void> {
  const snap = await db.collection('push_tokens').where('voip_token', '==', token).get();
  if (snap.empty) return;
  const batch = db.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

function isStaleTokenError(code: string | undefined): boolean {
  return (
    code === 'messaging/registration-token-not-registered' ||
    code === 'messaging/invalid-registration-token' ||
    code === 'messaging/invalid-argument'
  );
}

/** Platform-aware device list for a profile id (+ legacy auth uid docs). */
export async function getPushDevicesForProfile(profileId: string): Promise<PushDeviceTarget[]> {
  const byDoc = new Map<string, PushDeviceTarget>();

  const ingestDoc = (docId: string, data: Record<string, unknown>) => {
    const platform = normalizePlatform(data.platform);
    const token = asString(data.token);
    const voip = asString(data.voip_token);

    const existing = byDoc.get(docId) || { docId, platform };
    if (token) {
      if (isWebPushSubscriptionJson(token)) existing.webSubscription = token;
      else if (looksLikeFcmToken(token)) existing.fcmToken = token;
    }
    if (voip && looksLikeFcmToken(voip)) existing.voipToken = voip;
    existing.platform = platform;
    byDoc.set(docId, existing);
  };

  const primary = await db.collection('push_tokens').where('user_id', '==', profileId).get();
  for (const doc of primary.docs) ingestDoc(doc.id, doc.data());

  const prof = await db.collection('profiles').doc(profileId).get();
  const authUid = asString(prof.data()?.user_id);
  if (authUid && authUid !== profileId) {
    const legacy = await db.collection('push_tokens').where('user_id', '==', authUid).get();
    for (const doc of legacy.docs) ingestDoc(doc.id, doc.data());
  }

  return [...byDoc.values()].filter(
    (d) => d.fcmToken || d.voipToken || d.webSubscription,
  );
}

/** @deprecated Prefer getPushDevicesForProfile */
export async function getPushTargetsForProfile(profileId: string): Promise<{
  fcmTokens: string[];
  webSubscriptions: string[];
}> {
  const devices = await getPushDevicesForProfile(profileId);
  const fcmTokens = new Set<string>();
  const webSubscriptions = new Set<string>();
  for (const d of devices) {
    if (d.fcmToken) fcmTokens.add(d.fcmToken);
    if (d.voipToken) fcmTokens.add(d.voipToken);
    if (d.webSubscription) webSubscriptions.add(d.webSubscription);
  }
  return { fcmTokens: [...fcmTokens], webSubscriptions: [...webSubscriptions] };
}

async function sendWebPushBatch(
  subscriptions: string[],
  payload: PushDispatchPayload,
  highPriority: boolean,
): Promise<number> {
  const publicKey = process.env.VAPID_PUBLIC_KEY || process.env.FIREBASE_VAPID_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey || !subscriptions.length) return 0;

  let sent = 0;
  try {
    const webpush = await import('web-push') as typeof import('web-push');
    webpush.setVapidDetails('mailto:noreply@vybehub.app', publicKey, privateKey);

    const route = payload.url || '/';
    const pushPayload = JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: route,
      tag: payload.tag,
      type: payload.type,
      ...payload.data,
    });

    for (const raw of subscriptions) {
      try {
        const sub = JSON.parse(raw) as { endpoint: string; keys?: { p256dh?: string; auth?: string } };
        if (!sub?.endpoint) continue;
        await webpush.sendNotification(sub, pushPayload, {
          TTL: highPriority ? 45 : 86400,
          urgency: highPriority ? 'high' : 'normal',
        });
        sent += 1;
      } catch (err: unknown) {
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) await deleteTokensMatching(raw).catch(() => {});
      }
    }
  } catch (err) {
    console.warn('[fcmPush] web-push unavailable:', err);
  }
  return sent;
}

async function sendFcmMulticast(tokens: string[], message: Omit<MulticastMessage, 'tokens'>): Promise<number> {
  if (!tokens.length) return 0;
  const res = await messaging.sendEachForMulticast({ ...message, tokens });
  const stale: string[] = [];
  res.responses.forEach((r, i) => {
    if (!r.success && isStaleTokenError(r.error?.code)) stale.push(tokens[i]);
  });
  for (const token of stale) await deleteTokensMatching(token).catch(() => {});
  return res.successCount;
}

async function sendFcmSingle(token: string, message: Omit<Message, 'token' | 'topic' | 'condition'>): Promise<boolean> {
  try {
    await messaging.send({ ...message, token });
    return true;
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (isStaleTokenError(code)) await deleteTokensMatching(token).catch(() => {});
    console.warn('[fcmPush] send failed:', code, (err as Error)?.message);
    return false;
  }
}

/** Android incoming call — data-only, high priority (no notification tray). */
async function sendAndroidCallData(token: string, payload: PushDispatchPayload): Promise<boolean> {
  return sendFcmSingle(token, {
    data: callDataPayload(payload),
    android: {
      priority: 'high',
      ttl: 45_000,
    },
  });
}

async function sendIosVoipPush(voipToken: string, payload: PushDispatchPayload): Promise<boolean> {
  const data = callDataPayload(payload);
  try {
    return await sendFcmSingle(voipToken, {
      data,
      apns: {
        headers: {
          'apns-push-type': 'voip',
          'apns-priority': '10',
          'apns-topic': IOS_VOIP_TOPIC,
        },
        payload: {
          aps: { 'content-available': 1 },
          ...data,
        },
      },
    });
  } catch {
    await deleteVoipToken(voipToken).catch(() => {});
    return false;
  }
}

/** iOS fallback when no VoIP token — alert push on standard FCM token. */
async function sendIosCallAlert(token: string, payload: PushDispatchPayload): Promise<boolean> {
  const data = callDataPayload(payload);
  return sendFcmSingle(token, {
    notification: { title: payload.title, body: payload.body },
    data,
    apns: {
      headers: { 'apns-priority': '10', 'apns-push-type': 'alert' },
      payload: {
        aps: {
          alert: { title: payload.title, body: payload.body },
          sound: 'default',
          'content-available': 1,
        },
      },
    },
  });
}

async function sendDmFcmBatch(tokens: string[], payload: PushDispatchPayload): Promise<number> {
  const data: Record<string, string> = {
    ...(payload.data || {}),
    type: payload.type || 'dm',
    title: payload.title,
    body: payload.body,
  };
  if (payload.url) {
    data.url = payload.url;
    data.path = payload.url;
  }
  if (payload.tag) data.tag = payload.tag;

  return sendFcmMulticast(tokens, {
    notification: { title: payload.title, body: payload.body },
    data,
    webpush: payload.url
      ? { fcmOptions: { link: `https://vybehub.app${payload.url}` } }
      : undefined,
  });
}

/** DM / social — OneSignal (native/Despia) + FCM + Web Push. */
export async function dispatchDmPushToProfile(
  profileId: string,
  payload: PushDispatchPayload,
): Promise<{ sent: number; fcm: number; web: number; onesignal: number }> {
  const resolvedId = await resolvePushTargetProfileId(profileId);
  const devices = await getPushDevicesForProfile(resolvedId);
  const fcmTokens = new Set<string>();
  const webSubs = new Set<string>();

  for (const d of devices) {
    if (d.webSubscription) webSubs.add(d.webSubscription);
    if (d.fcmToken) fcmTokens.add(d.fcmToken);
    // VoIP token is not used for DMs
  }

  const [onesignalResult, fcm, web] = await Promise.all([
    dispatchOneSignalToProfile(resolvedId, {
      title: payload.title,
      body: payload.body,
      url: payload.url,
      tag: payload.tag,
      type: payload.type,
      data: payload.data,
    }),
    sendDmFcmBatch([...fcmTokens], payload),
    sendWebPushBatch([...webSubs], payload, false),
  ]);
  return {
    sent: onesignalResult.sent + fcm + web,
    onesignal: onesignalResult.sent,
    fcm,
    web,
  };
}

export interface CallPushResult {
  sent: number;
  android: number;
  iosVoip: number;
  iosFallback: number;
  web: number;
}

/**
 * Incoming call — dual-platform routing:
 * - Android: data-only high-priority FCM
 * - iOS: VoIP push on voip_token, else alert on fcm token
 * - Web: high-urgency web push / notification
 */
export async function dispatchCallPushToProfile(
  profileId: string,
  payload: PushDispatchPayload,
): Promise<CallPushResult> {
  const resolvedId = await resolvePushTargetProfileId(profileId);
  const devices = await getPushDevicesForProfile(resolvedId);
  const result: CallPushResult = { sent: 0, android: 0, iosVoip: 0, iosFallback: 0, web: 0 };

  const onesignal = await dispatchOneSignalToProfile(resolvedId, {
    title: payload.title,
    body: payload.body,
    url: payload.url,
    tag: payload.tag || 'vybe-call',
    type: 'call',
    data: payload.data,
  });
  result.sent += onesignal.sent;

  await Promise.all(
    devices.map(async (device) => {
      const platform = device.platform;

      if (platform === 'android' && device.fcmToken) {
        if (await sendAndroidCallData(device.fcmToken, payload)) {
          result.android += 1;
          result.sent += 1;
        }
        return;
      }

      if (platform === 'ios') {
        if (device.voipToken) {
          if (await sendIosVoipPush(device.voipToken, payload)) {
            result.iosVoip += 1;
            result.sent += 1;
          }
          return;
        }
        if (device.fcmToken) {
          if (await sendIosCallAlert(device.fcmToken, payload)) {
            result.iosFallback += 1;
            result.sent += 1;
          }
        }
        return;
      }

      if (device.webSubscription) {
        const n = await sendWebPushBatch([device.webSubscription], payload, true);
        result.web += n;
        result.sent += n;
        return;
      }

      // Capacitor / unknown native — infer from platform or try data-only
      if (device.fcmToken) {
        const inferred = platform === 'web' ? 'web' : platform;
        if (inferred === 'android' || platform === 'despia') {
          if (await sendAndroidCallData(device.fcmToken, payload)) {
            result.android += 1;
            result.sent += 1;
          }
        } else if (await sendIosCallAlert(device.fcmToken, payload)) {
          result.iosFallback += 1;
          result.sent += 1;
        }
      }
    }),
  );

  return result;
}

/** Route DM vs call automatically. */
export async function dispatchPushToProfile(
  profileId: string,
  payload: PushDispatchPayload,
): Promise<{ sent: number; fcm: number; web: number }> {
  const isCall = payload.type === 'call' || payload.highPriority === true;
  if (isCall) {
    const callResult = await dispatchCallPushToProfile(profileId, payload);
    return { sent: callResult.sent, fcm: callResult.android + callResult.iosVoip + callResult.iosFallback, web: callResult.web };
  }
  return dispatchDmPushToProfile(profileId, payload);
}

export function messagePreview(data: Record<string, unknown>): string {
  const mediaType = asString(data.media_type);
  if (mediaType === 'image') return '📷 Photo';
  if (mediaType === 'voice') return '🎤 Voice message';
  if (mediaType === 'video') return '🎬 Video';
  if (mediaType === 'vybe') return '✨ VYBE';
  const content = asString(data.content);
  if (content) return content.length > 100 ? `${content.slice(0, 100)}…` : content;
  return 'New message';
}
