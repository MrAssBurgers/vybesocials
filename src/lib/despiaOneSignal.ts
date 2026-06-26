import { db } from '@/lib/firebase';
import { isDespiaRuntime, despiaCall, isAndroidUA, isIOSUA } from '@/lib/despiaBridge';
import { sendInstantLocalPush } from '@/lib/despiaPush';
import { syncNativePushTokens, upsertNativePushTokens } from '@/lib/pushTokenRegistry';

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

const BRIDGE_TIMEOUT_MS = isAndroidUA() ? 650 : 500;
const TIGHT_POLL_MS = 90;
const POST_GRANT_WAIT_MS = 1_400;
const BG_INTERVAL_MS = 450;

const delay = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

/** Fire a Despia deep link synchronously (official despia-native pattern). */
export function fireDespiaScheme(scheme: string): void {
  if (!isDespiaRuntime()) return;
  try {
    void import('despia-native').then((mod) => {
      const despia = (mod as { default?: (url: string) => void }).default ?? mod;
      if (typeof despia === 'function') despia(scheme);
    });
  } catch {
    /* ignore */
  }
}

/**
 * Official Despia OneSignal link — call on every authenticated load.
 * https://setup.despia.com — setonesignalplayerid://?user_id=YOUR_USER_ID
 */
export function linkDespiaExternalId(externalId: string, trigger = 'link'): void {
  if (!externalId || !isDespiaRuntime()) return;
  const encoded = encodeURIComponent(externalId);
  fireDespiaScheme(`setonesignalplayerid://?user_id=${encoded}`);
  fireDespiaScheme(`setOneSignalPlayerId://?user_id=${encoded}`);
  console.log(`[OneSignal:${trigger}] linked external_id=${externalId}`);
  void linkOneSignalUser(externalId).catch(() => {});
}

/**
 * User tapped "Enable notifications" — register (if needed) then instantly link external_id.
 */
export async function acceptDespiaPushPermission(externalId: string): Promise<{
  granted: boolean;
  linked: boolean;
}> {
  if (!externalId || !isDespiaRuntime()) {
    return { granted: false, linked: false };
  }

  linkDespiaExternalId(externalId, 'pre-register');

  let permission = await checkDespiaPushPermission();
  if (permission !== true) {
    await despiaCall('registerpush://', [], 1_200);
    linkDespiaExternalId(externalId, 'post-register');
    permission = await checkDespiaPushPermission();
  }

  void persistDespiaPushToken(externalId, '').catch(() => {});
  startBackgroundPlayerIdSync(externalId);

  return { granted: permission === true, linked: true };
}

export async function checkDespiaPushPermission(): Promise<boolean | null> {
  for (const checkUrl of ['checkNativePushPermissions://', 'checknativepushpermissions://']) {
    const permissionResult = await despiaCall(checkUrl, ['nativePushEnabled'], 600);
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
  return normalizeId(pushSubscription?.id || pushSubscription?.subscriptionId);
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
  const platform = isIOSUA() ? 'ios' : isAndroidUA() ? 'android' : 'despia';
  const token = playerId || `despia:${profileId}`;
  const hasRealId = playerId.length >= 8 && !playerId.startsWith('despia:');

  if (hasRealId) {
    await Promise.all([
      upsertNativePushTokens(profileId, {
        fcmToken: playerId,
        platform: platform as 'ios' | 'android',
      }),
      db.from('push_tokens').upsert(
        { user_id: profileId, platform: 'despia', token: playerId },
        { onConflict: 'user_id,platform' },
      ),
    ]);
    return;
  }

  const { error } = await db.from('push_tokens').upsert(
    { user_id: profileId, platform: 'despia', token },
    { onConflict: 'user_id,platform' },
  );
  if (error) throw error;
}

export async function linkOneSignalUser(profileId: string, subscriptionId?: string): Promise<boolean> {
  const { data, error } = await db.functions.invoke('link-onesignal-user', {
    body: { profileId, profile_id: profileId, subscriptionId: subscriptionId || undefined },
  });
  if (error) {
    console.warn('[OneSignal] link-onesignal-user invoke failed', error);
    return false;
  }
  const payload = data as { success?: boolean; linked?: boolean } | null;
  return payload?.linked === true || payload?.success === true;
}

function linkSchemes(externalId: string): string[] {
  return [
    `setonesignalplayerid://?user_id=${encodeURIComponent(externalId)}`,
    `setOneSignalPlayerId://?user_id=${encodeURIComponent(externalId)}`,
    `onesignallogin://?external_id=${encodeURIComponent(externalId)}`,
  ];
}

/** Fire register + link + player-id probes in parallel. */
async function fireDespiaPushBridges(externalId: string, includeRegister = true): Promise<void> {
  const urls = [
    ...(includeRegister ? REGISTER_SCHEMES : []),
    ...linkSchemes(externalId),
    ...PLAYER_ID_SCHEMES,
  ];
  await Promise.all(urls.map((url) => despiaCall(url, PLAYER_ID_KEYS, BRIDGE_TIMEOUT_MS)));
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

async function commitPlayerId(externalId: string, playerId: string, persistToken: boolean): Promise<void> {
  if (!playerId) return;
  if (persistToken) {
    await persistDespiaPushToken(externalId, playerId);
    await syncNativePushTokens(externalId, playerId).catch(() => {});
  }
  await linkOneSignalUser(externalId, playerId);
}

function startBackgroundPlayerIdSync(externalId: string): void {
  startBackgroundPushFinish(externalId, { persistToken: true, trigger: 'bg-sync' });
}

function startBackgroundPushFinish(
  externalId: string,
  options: { persistToken?: boolean; trigger?: string },
): void {
  const tag = `[OneSignal:${options.trigger ?? 'manual'}:bg]`;
  void (async () => {
    for (let attempt = 1; attempt <= 12; attempt++) {
      await delay(BG_INTERVAL_MS);
      try {
        linkDespiaExternalId(externalId, `${options.trigger ?? 'manual'}:bg-${attempt}`);
        await fireDespiaPushBridges(externalId, false);
        const playerId = await probePlayerIdOnce();
        if (!playerId) continue;
        await commitPlayerId(externalId, playerId, options.persistToken !== false);
        console.log(`${tag} linked on attempt ${attempt}`);
        return;
      } catch (err) {
        console.warn(`${tag} attempt ${attempt} failed`, err);
      }
    }
  })();
}

/**
 * Connect push — delegates to official external_id link; optional register on prompt.
 */
export async function connectDespiaPushInstant(
  externalId: string,
  options: {
    requestPermission?: boolean;
    maxWaitMs?: number;
    persistToken?: boolean;
    trigger?: string;
  } = {},
): Promise<{ linked: boolean; playerId: string; permission: boolean | null }> {
  if (!externalId || !isDespiaRuntime()) {
    return { linked: false, playerId: '', permission: null };
  }

  if (options.requestPermission) {
    const accepted = await acceptDespiaPushPermission(externalId);
    const permission = await checkDespiaPushPermission();
    const playerId = readWindowPlayerId() || (await probePlayerIdOnce());
    if (playerId && options.persistToken !== false) {
      void commitPlayerId(externalId, playerId, true);
    }
    return {
      linked: accepted.linked,
      playerId,
      permission,
    };
  }

  linkDespiaExternalId(externalId, options.trigger ?? 'connect');
  if (options.persistToken !== false) {
    void persistDespiaPushToken(externalId, '').catch(() => {});
  }
  startBackgroundPlayerIdSync(externalId);

  const permission = await checkDespiaPushPermission();
  const playerId = readWindowPlayerId() || (await probePlayerIdOnce());
  return { linked: true, playerId, permission };
}

/** @deprecated Prefer connectDespiaPushInstant */
export async function ensureDespiaOneSignalLinked(
  externalId: string,
  options: {
    requestPermission?: boolean;
    waitForPlayerIdMs?: number;
    persistToken?: boolean;
    authUserId?: string;
    trigger?: string;
    fastReturn?: boolean;
  } = {},
): Promise<{ linked: boolean; playerId: string; permission: boolean | null }> {
  const maxWaitMs = options.fastReturn
    ? Math.min(options.waitForPlayerIdMs ?? 400, 500)
    : (options.waitForPlayerIdMs ?? POST_GRANT_WAIT_MS);
  return connectDespiaPushInstant(externalId, {
    requestPermission: options.requestPermission,
    maxWaitMs,
    persistToken: options.persistToken,
    trigger: options.trigger,
  });
}

export async function fetchDespiaOneSignalPlayerId(waitMs = 0): Promise<string> {
  if (!isDespiaRuntime()) return '';
  if (waitMs <= 0) return probePlayerIdOnce();
  const externalId = (await resolveCurrentOneSignalExternalId()) ?? '';
  if (!externalId) return probePlayerIdOnce();

  const deadline = Date.now() + waitMs;
  let playerId = await probePlayerIdOnce();
  while (!playerId && Date.now() < deadline) {
    await delay(TIGHT_POLL_MS);
    await fireDespiaPushBridges(externalId, false);
    playerId = await probePlayerIdOnce();
  }
  return playerId;
}

export async function fetchPushSubscriptionStatus(profileId: string): Promise<{
  subscriptionIds: string[];
  count: number;
}> {
  const { data, error } = await db.functions.invoke('get-push-subscription-status', {
    body: { profileId, profile_id: profileId },
  });
  if (error) {
    return { subscriptionIds: [], count: 0 };
  }
  const payload = data as { subscriptionIds?: string[]; count?: number } | null;
  const subscriptionIds = Array.isArray(payload?.subscriptionIds) ? payload.subscriptionIds : [];
  return {
    subscriptionIds,
    count: typeof payload?.count === 'number' ? payload.count : subscriptionIds.length,
  };
}

/** Fast resolve — one connect pass + optional server lookup (no 6× retry loop). */
export async function resolveLinkedSubscriptionId(
  externalId: string,
  initialId = '',
): Promise<string> {
  if (!isDespiaRuntime() || !externalId) return '';

  const cached = initialId || readWindowPlayerId() || (await probePlayerIdOnce());
  if (cached) {
    await commitPlayerId(externalId, cached, true);
    return cached;
  }

  const link = await connectDespiaPushInstant(externalId, {
    requestPermission: false,
    maxWaitMs: 900,
    trigger: 'resolve-sub',
  });
  if (link.playerId) return link.playerId;

  const status = await fetchPushSubscriptionStatus(externalId);
  return status.subscriptionIds[0] || '';
}

export async function sendDespiaTestPushNotification(profileId: string): Promise<{
  localSent: boolean;
  serverSent: boolean;
  playerId: string;
  subscriptionCount: number;
  permission: boolean | null;
}> {
  const permission = await checkDespiaPushPermission();
  if (permission === false) {
    return {
      localSent: false,
      serverSent: false,
      playerId: '',
      subscriptionCount: 0,
      permission,
    };
  }

  linkDespiaExternalId(profileId, 'test-push');

  const localSent = sendInstantLocalPush(
    'VYBE test push 🚀',
    'If you see this, notifications work on this device.',
    '/settings?tab=notifications',
  );

  const result = await db.functions.invoke('send-push-notification', {
    body: {
      userId: profileId,
      title: 'VYBE test push 🚀',
      body: 'If you see this, push is working on this device.',
      tag: 'test-push',
      type: 'announcement',
    },
  });

  const payload = result.data as { sent?: number; success?: boolean } | null;
  const serverSent =
    !result.error &&
    (payload?.success === true || (typeof payload?.sent === 'number' && payload.sent > 0));

  return {
    localSent,
    serverSent,
    playerId: profileId,
    subscriptionCount: serverSent ? 1 : 0,
    permission,
  };
}

export function relinkDespiaPushInBackground(
  externalId: string,
  trigger: string,
  _requestPermission = false,
): void {
  linkDespiaExternalId(externalId, trigger);
  startBackgroundPlayerIdSync(externalId);
}
