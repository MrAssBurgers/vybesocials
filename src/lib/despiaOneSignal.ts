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
  }, { onConflict: 'user_id,platform' });
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
  options: {
    requestPermission?: boolean;
    waitForPlayerIdMs?: number;
    persistToken?: boolean;
    /** Optional Supabase auth.uid — logged + stored as backup alias only. profile.id remains the primary external_id. */
    authUserId?: string;
    /** Label for logs: 'cold-start' | 'login' | 'token-refresh' | 'permission-grant' | etc. */
    trigger?: string;
  } = {},
): Promise<{ linked: boolean; playerId: string; permission: boolean | null }> {
  const isNative = isDespiaRuntime();
  const tag = `[OneSignal:${options.trigger ?? 'manual'}]`;

  console.log(`${tag} link request`, {
    primaryExternalId: externalId,
    backupAuthUid: options.authUserId ?? null,
    despiaNative: isNative,
  });

  if (!externalId || !isNative) {
    if (!externalId) console.warn(`${tag} skipped — no external id`);
    if (!isNative) console.log(`${tag} skipped — not Despia native runtime (web/PWA path handled separately)`);
    return { linked: false, playerId: '', permission: null };
  }

  const encoded = encodeURIComponent(externalId);
  const linkUrl = `setonesignalplayerid://?user_id=${encoded}`;
  let permission: boolean | null = null;

  // Bind immediately. Despia's OneSignal command is queued and may not return
  // a player id synchronously, so we also retry below.
  console.log(`${tag} initial bind → ${linkUrl}`);
  await despiaCall(linkUrl, [], 1_000);

  permission = await checkNativePushPermission();
  console.log(`${tag} push permission =`, permission);

  if (options.requestPermission && permission !== true) {
    console.log(`${tag} requesting push permission via registerpush://`);
    await despiaCall('registerpush://', [], 1_500);
    permission = await checkNativePushPermission();
    console.log(`${tag} permission after prompt =`, permission);
  }

  // Second immediate bind (covers race where permission just flipped).
  await despiaCall(linkUrl, [], 1_200);

  // Aggressive background retry loop: 5 attempts, 2s apart. Despia's OneSignal
  // bridge can take many seconds after permission grant to create the
  // subscription record; without retries the external_id never lands and
  // targeted pushes silently fail.
  const MAX_RETRIES = 5;
  const RETRY_DELAY_MS = 2_000;
  void (async () => {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      await delay(RETRY_DELAY_MS);
      try {
        await despiaCall(linkUrl, [], 1_200);
        const currentPlayerId = await fetchDespiaOneSignalPlayerId(0);
        console.log(`${tag} retry ${attempt}/${MAX_RETRIES}`, {
          playerIdResolved: !!currentPlayerId,
          playerId: currentPlayerId || null,
        });
        if (currentPlayerId && options.persistToken !== false) {
          // Persist updated marker token so backend knows the device is bound.
          persistDespiaPushToken(externalId, currentPlayerId).catch(() => {});
          break; // success — stop retrying
        }
      } catch (err) {
        console.warn(`${tag} retry ${attempt} error`, err);
      }
    }
  })();

  const playerId = await fetchDespiaOneSignalPlayerId(options.waitForPlayerIdMs ?? 1_500);
  console.log(`${tag} immediate fetch playerId =`, playerId || '(empty — retry loop will keep trying)');

  if (options.persistToken !== false) {
    persistDespiaPushToken(externalId, playerId).catch((err) => {
      console.warn(`${tag} push token marker save failed`, err);
    });
  }
  return { linked: true, playerId, permission };
}