import { supabase } from '@/integrations/supabase/client';
import { despiaCall, isDespiaRuntime } from '@/lib/despiaBridge';

const PLAYER_ID_KEYS = [
  'oneSignalPlayerId',
  'onesignalPlayerId',
  'OneSignalPlayerId',
  'OneSignalPlayerID',
  'playerId',
  'player_id',
  'onesignal_player_id',
  'subscriptionId',
  'subscription_id',
  'oneSignalSubscriptionId',
];

const delay = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

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
  options: { requestPermission?: boolean; waitForPlayerIdMs?: number; persistToken?: boolean } = {},
): Promise<{ linked: boolean; playerId: string; permission: boolean | null }> {
  if (!externalId || !isDespiaRuntime()) {
    return { linked: false, playerId: '', permission: null };
  }

  const encoded = encodeURIComponent(externalId);
  const linkUrl = `setonesignalplayerid://?user_id=${encoded}&external_id=${encoded}`;
  let permission: boolean | null = null;

  if (options.requestPermission) {
    void despiaCall('registerpush://', [], 1_200);
    const permissionResult = await despiaCall('checknativepushpermissions://', ['nativePushEnabled'], 2_000);
    if (permissionResult && 'nativePushEnabled' in permissionResult) {
      permission = Boolean(permissionResult.nativePushEnabled);
    }
  }

  await despiaCall(linkUrl, [], 1_200);

  // Despia/OneSignal may create the subscription shortly after permission is granted.
  // Retry in the background so manual linking never blocks the UI forever.
  window.setTimeout(() => void despiaCall(linkUrl, [], 1_200), 2_500);

  const playerId = await fetchDespiaOneSignalPlayerId(options.waitForPlayerIdMs ?? 1_500);
  if (options.persistToken !== false) {
    persistDespiaPushToken(externalId, playerId).catch((err) => {
      console.warn('[despiaOneSignal] push token marker save failed', err);
    });
  }
  return { linked: true, playerId, permission };
}