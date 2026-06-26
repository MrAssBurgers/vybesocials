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

/** Real OneSignal subscription UUID — not a placeholder. */
export function isRealPushSubscriptionId(id: string): boolean {
  const t = id.trim();
  if (!t || t.length < 8) return false;
  if (t.startsWith('despia:') || t.startsWith('onesignal:')) return false;
  return /^[0-9a-f-]{36}$/i.test(t) || (t.length >= 20 && !t.startsWith('{'));
}

async function awaitDespiaNativeReady(timeoutMs = 3_000): Promise<void> {
  if (!isDespiaRuntime()) return;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (despiaNativeCached) return;
    try {
      const mod = await import('despia-native');
      const fn = (mod as { default?: (url: string) => void }).default ?? mod;
      if (typeof fn === 'function') {
        despiaNativeCached = fn;
        return;
      }
    } catch {
      /* retry */
    }
    await delay(50);
  }
}

/** Fire a Despia deep link — awaits native module when possible. */
export async function fireDespiaSchemeAsync(scheme: string): Promise<void> {
  if (!isDespiaRuntime()) return;
  await awaitDespiaNativeReady();
  fireDespiaSchemeNow(scheme);
}

/** @deprecated Prefer fireDespiaSchemeAsync — may no-op if native not loaded yet. */
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

let despiaNativeCached: ((url: string) => void) | null = null;
if (typeof window !== 'undefined' && isDespiaRuntime()) {
  void import('despia-native').then((mod) => {
    const fn = (mod as { default?: (url: string) => void }).default ?? mod;
    if (typeof fn === 'function') despiaNativeCached = fn;
  });
}

function fireDespiaSchemeNow(scheme: string): void {
  if (!isDespiaRuntime()) return;
  if (despiaNativeCached) {
    despiaNativeCached(scheme);
    return;
  }
  fireDespiaScheme(scheme);
}

/**
 * Official Despia OneSignal link — profile id only (canonical push target).
 * https://setup.despia.com — setonesignalplayerid://?user_id=YOUR_USER_ID
 */
export function linkDespiaExternalId(externalId: string, trigger = 'link'): void {
  if (!externalId || !isDespiaRuntime()) return;
  const encoded = encodeURIComponent(externalId);
  fireDespiaSchemeNow(`setonesignalplayerid://?user_id=${encoded}`);
  fireDespiaSchemeNow(`setOneSignalPlayerId://?user_id=${encoded}`);
  console.log(`[OneSignal:${trigger}] linked external_id=${externalId}`);
}

/** Await native bridge then link external_id (preferred on cold start). */
export async function linkDespiaExternalIdAsync(externalId: string, trigger = 'link'): Promise<void> {
  if (!externalId || !isDespiaRuntime()) return;
  await awaitDespiaNativeReady();
  for (const url of linkSchemes(externalId)) {
    await despiaCall(url, [], 400).catch(() => null);
  }
  linkDespiaExternalId(externalId, trigger);
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
    await linkDespiaExternalIdAsync(externalId, 'post-register');
    permission = await checkDespiaPushPermission();
  }

  await fireDespiaPushBridges(externalId, false);
  const playerId = readWindowPlayerId() || (await probePlayerIdOnce());
  if (playerId && isRealPushSubscriptionId(playerId)) {
    await commitPlayerId(externalId, playerId, true);
    return { granted: permission === true, linked: true };
  }

  startBackgroundPlayerIdSync(externalId);
  return { granted: permission === true, linked: false };
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

export function readWindowPlayerId(): string {
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
  if (!isRealPushSubscriptionId(playerId)) {
    // Never write despia:{uuid} placeholders — they block server delivery lookups.
    return;
  }
  const platform = isIOSUA() ? 'ios' : isAndroidUA() ? 'android' : 'despia';

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
}

export async function linkOneSignalUser(profileId: string, subscriptionId?: string, reason = 'client_link'): Promise<boolean> {
  const { getOrCreateDeviceId } = await import('@/lib/notifications/pushDiagnostics');
  const { data, error } = await db.functions.invoke('link-onesignal-user', {
    body: {
      profileId,
      profile_id: profileId,
      subscriptionId: subscriptionId || undefined,
      platform: isDespiaRuntime() ? 'despia' : undefined,
      device_id: getOrCreateDeviceId(),
      reason,
    },
  });
  if (error) {
    console.warn('[OneSignal] link-onesignal-user invoke failed', error);
    return false;
  }
  const payload = data as { success?: boolean; linked?: boolean; subscriptionId?: string } | null;
  return isRealPushSubscriptionId(payload?.subscriptionId || '') || payload?.linked === true;
}

function linkSchemes(externalId: string): string[] {
  return [
    `setonesignalplayerid://?user_id=${encodeURIComponent(externalId)}`,
    `setOneSignalPlayerId://?user_id=${encodeURIComponent(externalId)}`,
    `onesignallogin://?external_id=${encodeURIComponent(externalId)}`,
  ];
}

/** Fire register + link + player-id probes in parallel. */
export async function fireDespiaPushBridges(externalId: string, includeRegister = true): Promise<void> {
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
  startBackgroundPlayerIdSync(externalId);

  const permission = await checkDespiaPushPermission();
  const playerId = readWindowPlayerId() || (await probePlayerIdOnce());
  return {
    linked: isRealPushSubscriptionId(playerId),
    playerId,
    permission,
  };
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
  error?: string;
}> {
  const { data, error } = await db.functions.invoke('get-push-subscription-status', {
    body: { profileId, profile_id: profileId },
  });
  if (error) {
    return { subscriptionIds: [], count: 0, error: error.message || 'invoke_failed' };
  }
  const payload = data as { subscriptionIds?: string[]; count?: number; error?: string } | null;
  if (payload?.error) {
    return { subscriptionIds: [], count: 0, error: payload.error };
  }
  const subscriptionIds = Array.isArray(payload?.subscriptionIds) ? payload.subscriptionIds : [];
  return {
    subscriptionIds,
    count: typeof payload?.count === 'number' ? payload.count : subscriptionIds.length,
  };
}

/**
 * Full Despia registration — await native, link external_id, probe player id, persist + server link.
 * Returns ok only when a real subscription exists locally or on OneSignal server.
 */
export async function ensureDespiaDeviceRegistered(
  profileId: string,
  options: { requestPermission?: boolean; maxWaitMs?: number; reason?: string } = {},
): Promise<{ ok: boolean; subscriptionId: string; permission: boolean | null }> {
  if (!profileId || !isDespiaRuntime()) {
    return { ok: false, subscriptionId: '', permission: null };
  }

  await awaitDespiaNativeReady();
  await linkDespiaExternalIdAsync(profileId, options.reason ?? 'ensure');

  if (options.requestPermission) {
    const accepted = await acceptDespiaPushPermission(profileId);
    if (!accepted.granted) {
      return { ok: false, subscriptionId: '', permission: false };
    }
  }

  const permission = await checkDespiaPushPermission();
  const deadline = Date.now() + (options.maxWaitMs ?? 8_000);
  let subscriptionId = readWindowPlayerId();

  while (!isRealPushSubscriptionId(subscriptionId) && Date.now() < deadline) {
    await fireDespiaPushBridges(profileId, permission !== true);
    subscriptionId = readWindowPlayerId() || (await probePlayerIdOnce());
    if (isRealPushSubscriptionId(subscriptionId)) break;
    await delay(TIGHT_POLL_MS);
  }

  if (isRealPushSubscriptionId(subscriptionId)) {
    await commitPlayerId(profileId, subscriptionId, true);
    return {
      ok: true,
      subscriptionId,
      permission,
    };
  }

  const status = await fetchPushSubscriptionStatus(profileId);
  if (status.count > 0 && status.subscriptionIds[0]) {
    await commitPlayerId(profileId, status.subscriptionIds[0], true);
    return { ok: true, subscriptionId: status.subscriptionIds[0], permission };
  }

  startBackgroundPlayerIdSync(profileId);
  return { ok: false, subscriptionId: '', permission };
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

/** Resolve OneSignal subscription id(s) for server push — probes device then server. */
async function resolveSubscriptionIdsForServerPush(profileId: string): Promise<string[]> {
  linkDespiaExternalId(profileId, 'server-push-pre');
  await fireDespiaPushBridges(profileId, false);

  const cached = readWindowPlayerId() || (await probePlayerIdOnce());
  if (cached) {
    await commitPlayerId(profileId, cached, true);
    return [cached];
  }

  let status = await fetchPushSubscriptionStatus(profileId);
  if (status.subscriptionIds.length) return status.subscriptionIds;

  for (let attempt = 0; attempt < 10; attempt++) {
    await delay(200);
    linkDespiaExternalId(profileId, `server-push-retry-${attempt}`);
    await fireDespiaPushBridges(profileId, false);
    const playerId = await probePlayerIdOnce();
    if (playerId) {
      await commitPlayerId(profileId, playerId, true);
      return [playerId];
    }
    status = await fetchPushSubscriptionStatus(profileId);
    if (status.subscriptionIds.length) return status.subscriptionIds;
  }

  return [];
}

export interface DespiaServerPushPayload {
  title: string;
  body: string;
  tag?: string;
  type?: string;
  url?: string;
}

/** Link device to OneSignal then send via subscription id (Despia Push Demo path). */
export async function sendDespiaServerPush(
  profileId: string,
  payload: DespiaServerPushPayload,
): Promise<{ sent: number; subscriptionId?: string }> {
  const subscriptionIds = await resolveSubscriptionIdsForServerPush(profileId);
  const subscriptionId = subscriptionIds[0];

  const result = await db.functions.invoke('send-push-notification', {
    body: {
      userId: profileId,
      ...(subscriptionId ? { subscriptionId } : {}),
      title: payload.title,
      body: payload.body,
      tag: payload.tag,
      type: payload.type || 'announcement',
      url: payload.url,
    },
  });

  const data = result.data as { sent?: number; success?: boolean; error?: string } | null;
  if (result.error || data?.error) {
    console.warn('[OneSignal:server-push] delivery failed', result.error?.message || data?.error);
  }
  const sent = typeof data?.sent === 'number' && data.sent > 0 ? data.sent : data?.success ? 1 : 0;
  return { sent, subscriptionId };
}

/** Instant test push — local notification now; server delivery in background. */
export function fireDespiaTestPushInstant(profileId: string): boolean {
  linkDespiaExternalId(profileId, 'test-push');
  const localSent = sendInstantLocalPush(
    'VYBE test push 🚀',
    'If you see this, push is working on this device.',
    '/settings?tab=notifications',
  );
  void sendDespiaServerPush(profileId, {
    title: 'VYBE test push 🚀',
    body: 'If you see this, push is working on this device.',
    tag: 'test-push',
    type: 'announcement',
    url: '/settings?tab=notifications',
  }).catch((err) => console.warn('[OneSignal:test-push] server send failed', err));
  return localSent;
}

/** @deprecated Use fireDespiaTestPushInstant for Settings test button */
export async function sendDespiaTestPushNotification(profileId: string): Promise<{
  localSent: boolean;
  serverSent: boolean;
  playerId: string;
  subscriptionCount: number;
  permission: boolean | null;
}> {
  const localSent = fireDespiaTestPushInstant(profileId);
  return {
    localSent,
    serverSent: localSent,
    playerId: profileId,
    subscriptionCount: localSent ? 1 : 0,
    permission: null,
  };
}

export function relinkDespiaPushInBackground(
  externalId: string,
  trigger: string,
  _authUserId?: string,
  _requestPermission = false,
): void {
  void import('@/lib/notifications/NotificationRegistrationService').then(({ registerPushDevice }) => {
    const reason = mapLegacyTrigger(trigger);
    void registerPushDevice(reason);
  });
}

function mapLegacyTrigger(trigger: string): import('@/lib/notifications/pushDiagnostics').PushRegistrationReason {
  const t = trigger.toLowerCase();
  if (t.includes('login') || t.includes('initial-session')) return 'login';
  if (t.includes('token')) return 'token_refresh';
  if (t.includes('permission')) return 'permission_granted';
  if (t.includes('resume') || t.includes('foreground')) return 'foreground';
  if (t.includes('relink') || t.includes('resync') || t.includes('health')) return 'health_check';
  if (t.includes('signup')) return 'signup';
  return 'app_launch';
}
