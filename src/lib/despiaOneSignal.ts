import { db } from '@/lib/firebase';
import { isDespiaRuntime, despiaCall, isAndroidUA, isIOSUA } from '@/lib/despiaBridge';
import { syncNativePushTokens, detectNativePushPlatform, upsertNativePushTokens } from '@/lib/pushTokenRegistry';

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

const REGISTER_SCHEMES = ['registerpush://', 'registerPush://', 'requestpushpermission://'];
const PLAYER_ID_SCHEMES = [
  'getonesignalplayerid://',
  'onesignalplayerid://',
  'getOneSignalPlayerId://',
  'oneSignalPlayerId://',
];

const BRIDGE_TIMEOUT_MS = isAndroidUA() ? 700 : 550;
const POLL_INTERVAL_MS = 180;

const delay = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

export async function checkDespiaPushPermission(): Promise<boolean | null> {
  return checkNativePushPermission();
}

async function checkNativePushPermission(): Promise<boolean | null> {
  for (const checkUrl of ['checkNativePushPermissions://', 'checknativepushpermissions://']) {
    const permissionResult = await despiaCall(checkUrl, ['nativePushEnabled'], 800);
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
  const { data } = await db.auth.getUser();
  const authUserId = data.user?.id;
  if (!authUserId) return null;

  const { data: profile } = await db
    .from('profiles')
    .select('id')
    .eq('user_id', authUserId)
    .maybeSingle();

  return profile?.id || authUserId;
}

export async function persistDespiaPushToken(profileId: string, playerId = ''): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(profileId)) return;
  const token = playerId || `despia:${profileId}`;
  const platform = isIOSUA() ? 'ios' : isAndroidUA() ? 'android' : 'despia';
  await upsertNativePushTokens(profileId, {
    fcmToken: token.startsWith('despia:') ? null : token,
    platform: platform as 'ios' | 'android',
  });
  // Keep legacy despia placeholder row for OneSignal external_id routing
  if (token.startsWith('despia:')) {
    const { error } = await db.from('push_tokens').upsert({
      user_id: profileId,
      platform: 'despia',
      token,
    }, { onConflict: 'user_id,platform' });
    if (error) throw error;
  }
}

export async function linkOneSignalUser(profileId: string, subscriptionId?: string): Promise<boolean> {
  const { data, error } = await db.functions.invoke('link-onesignal-user', {
    body: { profileId, subscriptionId: subscriptionId || undefined },
  });
  if (error) {
    console.warn('[OneSignal] link-onesignal-user invoke failed', error);
    return false;
  }
  const payload = data as { success?: boolean } | null;
  return payload?.success === true;
}

/** Fire all native bridges in parallel — much faster than serial awaits. */
async function fireDespiaPushBridges(externalId: string, includeRegister = true): Promise<void> {
  const urls = [
    ...(includeRegister ? REGISTER_SCHEMES : []),
    ...linkSchemes(externalId),
  ];
  await Promise.all(urls.map((url) => despiaCall(url, [], BRIDGE_TIMEOUT_MS)));
}

function linkSchemes(externalId: string): string[] {
  return [
    `setonesignalplayerid://?user_id=${encodeURIComponent(externalId)}`,
    `setOneSignalPlayerId://?user_id=${encodeURIComponent(externalId)}`,
    `onesignallogin://?external_id=${encodeURIComponent(externalId)}`,
  ];
}

async function probePlayerIdOnce(): Promise<string> {
  const cached = readWindowPlayerId();
  if (cached) return cached;

  const results = await Promise.all(
    PLAYER_ID_SCHEMES.map((scheme) => despiaCall(scheme, PLAYER_ID_KEYS, BRIDGE_TIMEOUT_MS)),
  );
  for (const result of results) {
    const id = normalizeId(result);
    if (id) return id;
  }
  return '';
}

/** Tight poll right after Allow — returns as soon as native exposes a subscription id. */
async function pollPlayerId(externalId: string, maxMs: number): Promise<string> {
  const deadline = Date.now() + Math.max(0, maxMs);
  let playerId = await probePlayerIdOnce();
  while (!playerId && Date.now() < deadline) {
    await delay(POLL_INTERVAL_MS);
    await fireDespiaPushBridges(externalId, false);
    playerId = await probePlayerIdOnce();
  }
  return playerId;
}

function startBackgroundPushFinish(
  externalId: string,
  options: { persistToken?: boolean; trigger?: string },
): void {
  const tag = `[OneSignal:${options.trigger ?? 'manual'}:bg]`;
  void (async () => {
    for (let attempt = 1; attempt <= 8; attempt++) {
      await delay(1_500);
      try {
        await fireDespiaPushBridges(externalId);
        const playerId = await probePlayerIdOnce();
        if (!playerId) continue;
        if (options.persistToken !== false) {
          await persistDespiaPushToken(externalId, playerId);
        }
        await linkOneSignalUser(externalId, playerId);
        console.log(`${tag} linked playerId on attempt ${attempt}`);
        return;
      } catch (err) {
        console.warn(`${tag} attempt ${attempt} failed`, err);
      }
    }
  })();
}

export async function fetchDespiaOneSignalPlayerId(waitMs = 0): Promise<string> {
  if (!isDespiaRuntime()) return '';
  if (waitMs <= 0) return probePlayerIdOnce();
  const externalId = (await resolveCurrentOneSignalExternalId()) ?? '';
  return pollPlayerId(externalId, waitMs);
}

async function primeServerLink(externalId: string, persistToken: boolean): Promise<void> {
  await Promise.all([
    persistToken ? persistDespiaPushToken(externalId, '') : Promise.resolve(),
    linkOneSignalUser(externalId),
  ]);
}

export async function ensureDespiaOneSignalLinked(
  externalId: string,
  options: {
    requestPermission?: boolean;
    waitForPlayerIdMs?: number;
    persistToken?: boolean;
    authUserId?: string;
    trigger?: string;
    /** Return as soon as permission is granted — finish player id in background. */
    fastReturn?: boolean;
  } = {},
): Promise<{ linked: boolean; playerId: string; permission: boolean | null }> {
  const isNative = isDespiaRuntime();
  const tag = `[OneSignal:${options.trigger ?? 'manual'}]`;
  const persistToken = options.persistToken !== false;

  if (!externalId || !isNative) {
    if (!externalId) console.warn(`${tag} skipped — no external id`);
    if (!isNative) console.log(`${tag} skipped — not Despia native runtime`);
    return { linked: false, playerId: '', permission: null };
  }

  console.log(`${tag} fast link`, { externalId, authUserId: options.authUserId ?? null });

  // Server knows this user immediately — don't wait for native player id.
  await primeServerLink(externalId, persistToken);

  let permission: boolean | null = await checkNativePushPermission();
  await fireDespiaPushBridges(externalId);

  if (options.requestPermission && permission !== true) {
    await Promise.all(REGISTER_SCHEMES.map((url) => despiaCall(url, [], 1_200)));
    permission = await checkNativePushPermission();
    await fireDespiaPushBridges(externalId);
  }

  const instantPlayerId = await probePlayerIdOnce();

  if (options.fastReturn && permission !== false) {
    if (instantPlayerId && persistToken) {
      await persistDespiaPushToken(externalId, instantPlayerId);
      await linkOneSignalUser(externalId, instantPlayerId);
    }
    startBackgroundPushFinish(externalId, options);
    console.log(`${tag} fast return`, { permission, playerId: instantPlayerId || '(background)' });
    return { linked: true, playerId: instantPlayerId, permission };
  }

  const defaultWait = options.requestPermission ? 4_500 : 1_200;
  const waitMs = options.waitForPlayerIdMs ?? defaultWait;
  const playerId = instantPlayerId || await pollPlayerId(externalId, waitMs);

  if (playerId && persistToken) {
    await persistDespiaPushToken(externalId, playerId);
    await syncNativePushTokens(externalId, playerId).catch(() => {});
    await linkOneSignalUser(externalId, playerId);
  }

  startBackgroundPushFinish(externalId, options);

  console.log(`${tag} done`, { permission, playerId: playerId || '(pending background)' });
  return { linked: true, playerId, permission };
}

/** Non-blocking relink for foreground/cold-start — never stalls UI. */
export function relinkDespiaPushInBackground(
  externalId: string,
  trigger: string,
  requestPermission = false,
): void {
  void ensureDespiaOneSignalLinked(externalId, {
    requestPermission,
    fastReturn: requestPermission,
    waitForPlayerIdMs: requestPermission ? 3_500 : 800,
    persistToken: true,
    trigger,
  }).catch((err) => console.warn(`[OneSignal:${trigger}] background link failed`, err));
}
