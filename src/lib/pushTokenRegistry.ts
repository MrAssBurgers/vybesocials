import { db } from '@/lib/firebase';
import { Capacitor } from '@capacitor/core';
import { isDespiaRuntime, despiaCall, isAndroidUA, isIOSUA } from '@/lib/despiaBridge';

export type NativePushPlatform = 'android' | 'ios' | 'web';

const VOIP_TOKEN_KEYS = [
  'voipToken',
  'voip_token',
  'pushKitToken',
  'pushkitToken',
  'apnsVoipToken',
];
const FCM_TOKEN_KEYS = ['fcmToken', 'fcm_token', 'deviceToken', 'firebaseToken'];

const VOIP_SCHEMES = [
  'getvoiptoken://',
  'getVoipToken://',
  'getpushkittoken://',
  'getPushKitToken://',
];

function normalizeId(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (!value || typeof value !== 'object') return '';
  const record = value as Record<string, unknown>;
  for (const key of [...VOIP_TOKEN_KEYS, ...FCM_TOKEN_KEYS]) {
    const id = normalizeId(record[key]);
    if (id) return id;
  }
  return '';
}

export function detectNativePushPlatform(): NativePushPlatform {
  if (isAndroidUA()) return 'android';
  if (isIOSUA()) return 'ios';
  if (Capacitor.getPlatform() === 'android') return 'android';
  if (Capacitor.getPlatform() === 'ios') return 'ios';
  return 'web';
}

async function probeVoipToken(): Promise<string> {
  if (typeof window === 'undefined') return '';
  const w = window as unknown as Record<string, unknown>;
  for (const key of VOIP_TOKEN_KEYS) {
    const t = normalizeId(w[key]);
    if (t) return t;
  }
  if (!isDespiaRuntime()) return '';
  for (const scheme of VOIP_SCHEMES) {
    const result = await despiaCall(scheme, VOIP_TOKEN_KEYS, 600);
    const t = normalizeId(result);
    if (t) return t;
  }
  return '';
}

/** Persist FCM + optional PushKit VoIP token for com.despia.vybe native shells. */
export async function upsertNativePushTokens(
  profileId: string,
  opts: {
    fcmToken?: string | null;
    voipToken?: string | null;
    platform?: NativePushPlatform;
  },
): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(profileId)) return;

  const platform = opts.platform ?? detectNativePushPlatform();
  if (platform === 'web') return;

  const fcmToken = opts.fcmToken?.trim() || null;
  const voipToken = opts.voipToken?.trim() || null;
  if (!fcmToken && !voipToken) return;

  const { error } = await db.from('push_tokens').upsert(
    {
      user_id: profileId,
      platform,
      token: fcmToken,
      voip_token: voipToken,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,platform' },
  );
  if (error) throw error;
}

/** Probe Despia bridges for VoIP token and merge with Capacitor FCM registration. */
export async function syncNativePushTokens(
  profileId: string,
  fcmToken?: string | null,
): Promise<void> {
  const voipToken = await probeVoipToken();
  await upsertNativePushTokens(profileId, {
    fcmToken,
    voipToken: voipToken || null,
    platform: detectNativePushPlatform(),
  });
}
