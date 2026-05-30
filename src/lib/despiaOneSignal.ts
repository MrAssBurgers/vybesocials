import { supabase } from '@/integrations/supabase/client';
import { despiaCall, isDespiaRuntime } from '@/lib/despiaBridge';

const PLAYER_ID_KEYS = [
  'oneSignalPlayerId',
  'onesignalPlayerId',
  'OneSignalPlayerId',
  'OneSignalPlayerID',
  'oneSignalPlayerID',
  'playerId',
  'player_id',
  'onesignal_player_id',
  'oneSignalSubscriptionID',
  'subscriptionId',
  'subscription_id',
  'oneSignalSubscriptionId',
  'onesignalSubscriptionId',
  'pushSubscriptionId',
  'push_subscription_id',
];

const delay = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

export async function checkDespiaPushPermission(): Promise<boolean | null> {
  return checkNativePushPermission();
}

async function checkNativePushPermission(): Promise<boolean | null> {
  for (const checkUrl of ['checkNativePushPermissions://', 'checknativepushpermissions://']) {
    const permissionResult = await despiaCall(checkUrl, ['nativePushEnabled'], 1_500);
    if (permissionResult && 'nativePushEnabled' in permissionResult) {
      return Boolean(permissionResult.nativePushEnabled);
    }
  }
  return null;
}

function normalizeId(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (!value || typeof value !== 'object') return '';
  const record = value as Record<string, unknown>;
  for (const key of PLAYER_ID_KEYS) {
    const id = normalizeId(record[key]);
    if (id) return id;
  }
  return '';
}

function readWindowPlayerId(): string {
  if (typeof window === 'undefined') return '';
  const w = window as unknown as Record<string, unknown>;
  for (const key of PLAYER_ID_KEYS) {
    const id = normalizeId(w[key]);
    if (id) return id;
  }
  const oneSignal = w.OneSignal as Record<string, unknown> | undefined;
  const user = oneSignal?.User as Record<string, unknown> | undefined;
  const pushSubscription = user?.PushSubscription as Record<string, unknown> | undefined;
  const sdkId = normalizeId(pushSubscription?.id || pushSubscription?.subscriptionId);
  if (sdkId) return sdkId;
  return '';
}

export async function resolveCurrentOneSignalExternalId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  const authUserId = data.user?.id;
  if (!authUserId) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('user_id', authUserId)
    .maybeSingle();

  return profile?.id || authUserId;
}

export async function persistDespiaPushToken(profileId: string, playerId = ''): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(profileId)) return;
  const token = playerId || `despia:${profileId}`;
  const { error } = await supabase.from('push_tokens').upsert({
    user_id: profileId,
    platform: 'despia',
    token,
  }, { onConflict: 'user_id,token' });
  if (error) throw error;
}

export async function fetchDespiaOneSignalPlayerId(waitMs = 0): Promise<string> {
  if (!isDespiaRuntime()) return '';

  const deadline = Date.now() + Math.max(0, waitMs);
  do {
    const cached = readWindowPlayerId();
    if (cached) return cached;

    for (const scheme of [
      'getonesignalplayerid://',
      'onesignalplayerid://',
      'getOneSignalPlayerId://',
      'oneSignalPlayerId://',
    ]) {
      const result = await despiaCall(scheme, PLAYER_ID_KEYS, 1_200);
      const id = normalizeId(result);
      if (id) return id;
    }

    if (Date.now() < deadline) await delay(450);
  } while (Date.now() < deadline);

  return readWindowPlayerId();
}

const LINK_SCHEMES = (externalId: string) => [
  `setonesignalplayerid://?user_id=${encodeURIComponent(externalId)}`,
  `setOneSignalPlayerId://?user_id=${encodeURIComponent(externalId)}`,
  `onesignallogin://?external_id=${encodeURIComponent(externalId)}`,
];

async function bindDespiaOneSignalUser(externalId: string): Promise<void> {
  for (const url of LINK_SCHEMES(externalId)) {
    await despiaCall(url, [], 900);
  }
}

async function requestDespiaPushPermission(): Promise<boolean | null> {
  for (const url of ['registerpush://', 'registerPush://', 'requestpushpermission://']) {
    await despiaCall(url, [], 1_500);
  }
  return checkNativePushPermission();
}

export async function ensureDespiaOneSignalLinked(
  externalId: string,
  options: { requestPermission?: boolean; waitForPlayerIdMs?: number; persistToken?: boolean } = {},
): Promise<{ linked: boolean; playerId: string; permission: boolean | null }> {
  if (!externalId || !isDespiaRuntime()) {
    return { linked: false, playerId: '', permission: null };
  }

  let permission: boolean | null = await checkNativePushPermission();

  // Bind external_id before and after permission so Despia/OneSignal always
  // associates this device with the VYBE profile id (profiles.id).
  await bindDespiaOneSignalUser(externalId);

  if (options.requestPermission && permission !== true) {
    permission = await requestDespiaPushPermission();
  }

  await bindDespiaOneSignalUser(externalId);

  // Despia/OneSignal may create the subscription shortly after permission is granted.
  window.setTimeout(() => void bindDespiaOneSignalUser(externalId), 2_500);
  window.setTimeout(() => void bindDespiaOneSignalUser(externalId), 6_000);

  const playerId = await fetchDespiaOneSignalPlayerId(options.waitForPlayerIdMs ?? 2_500);
  if (options.persistToken !== false) {
    persistDespiaPushToken(externalId, playerId).catch((err) => {
      console.warn('[despiaOneSignal] push token marker save failed', err);
    });
  }

  if (!playerId) {
    window.setTimeout(() => {
      void fetchDespiaOneSignalPlayerId(4_000).then((lateId) => {
        if (lateId) {
          persistDespiaPushToken(externalId, lateId).catch(() => {});
        }
      });
    }, 3_000);
  }

  return { linked: true, playerId, permission };
}