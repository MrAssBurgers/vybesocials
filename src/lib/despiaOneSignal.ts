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

const PUSH_REGISTRATION_URLS = ['registerpush://', 'registerPush://', 'requestpushpermission://'];
const PUSH_PERMISSION_CHECK_URLS = ['checkNativePushPermissions://', 'checknativepushpermissions://'];

async function requestNativePushRegistration(): Promise<boolean | null> {
  let permission: boolean | null = null;
  for (const url of PUSH_REGISTRATION_URLS) {
    await despiaCall(url, [], 1_500);
  }
  permission = await checkDespiaPushPermission();
  return permission;
}

export async function checkDespiaPushPermission(): Promise<boolean | null> {
  for (const checkUrl of PUSH_PERMISSION_CHECK_URLS) {
    const permissionResult = await despiaCall(checkUrl, ['nativePushEnabled'], 1_500);
    if (permissionResult && 'nativePushEnabled' in permissionResult) {
      return Boolean(permissionResult.nativePushEnabled);
    }
  }
  return null;
}

async function bindOneSignalExternalId(linkUrls: string[]): Promise<void> {
  for (const url of linkUrls) await despiaCall(url, [], 1_000);
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
  await supabase.from('push_tokens').delete().eq('user_id', profileId).eq('platform', 'despia');
  const { error } = await supabase.from('push_tokens').insert({
    user_id: profileId,
    platform: 'despia',
    token,
  });
  if (error) throw error;
}

export async function fetchDespiaOneSignalPlayerId(waitMs = 0): Promise<string> {
  if (!isDespiaRuntime()) return '';

  const deadline = Date.now() + Math.max(0, waitMs);
  do {
    const cached = readWindowPlayerId();
    if (cached) return cached;

    for (const scheme of ['getonesignalplayerid://', 'onesignalplayerid://']) {
      const result = await despiaCall(scheme, PLAYER_ID_KEYS, 1_200);
      const id = normalizeId(result);
      if (id) return id;
    }

    if (Date.now() < deadline) await delay(450);
  } while (Date.now() < deadline);

  return readWindowPlayerId();
}

export async function ensureDespiaOneSignalLinked(
  externalId: string,
  options: { requestPermission?: boolean; refreshRegistration?: boolean; waitForPlayerIdMs?: number; persistToken?: boolean } = {},
): Promise<{ linked: boolean; playerId: string; permission: boolean | null }> {
  if (!externalId || !isDespiaRuntime()) {
    return { linked: false, playerId: '', permission: null };
  }

  const encoded = encodeURIComponent(externalId);
  const linkUrls = [
    `setonesignalplayerid://?user_id=${encoded}`,
    `setonesignalexternaluserid://?external_id=${encoded}`,
    `setexternaluserid://?external_id=${encoded}`,
  ];
  let permission: boolean | null = null;

  // 1. Request push permission FIRST when asked — OneSignal can only create
  //    a real subscription after the OS prompt is accepted. Aliasing the
  //    external_id before a subscription exists creates an alias-only user
  //    with zero subscriptions, which is the exact failure the demo hit.
  if (options.requestPermission || options.refreshRegistration) {
    permission = await requestNativePushRegistration();
  }

  // 2. Bind external_id — try every known bridge variant; builds differ.
  await bindOneSignalExternalId(linkUrls);

  // 3. Background retry — Despia/OneSignal can take a beat to register the
  //    push token after the prompt is accepted. Repeating registration + link
  //    is harmless after permission is granted and avoids the stale
  //    "permission accepted but no device registered" state.
  [1_500, 4_000, 9_000, 15_000, 30_000].forEach((delayMs) => {
    window.setTimeout(() => {
      void (async () => {
        if (options.requestPermission || options.refreshRegistration || permission === true) {
          await requestNativePushRegistration();
        }
        await bindOneSignalExternalId(linkUrls);
      })();
    }, delayMs);
  });

  const playerId = await fetchDespiaOneSignalPlayerId(options.waitForPlayerIdMs ?? 1_500);
  if (options.persistToken !== false) {
    persistDespiaPushToken(externalId, playerId).catch((err) => {
      console.warn('[despiaOneSignal] push token marker save failed', err);
    });
  }
  return { linked: true, playerId, permission };
}