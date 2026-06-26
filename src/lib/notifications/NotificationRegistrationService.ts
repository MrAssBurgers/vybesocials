/**
 * Single source of truth for push device registration (Snapchat-style permanence).
 * All lifecycle triggers funnel here — mutexed, idempotent, exponential backoff.
 */
import { db } from '@/lib/firebase';
import { isDespiaRuntime } from '@/lib/despiaBridge';
import {
  acceptDespiaPushPermission,
  checkDespiaPushPermission,
  fetchDespiaOneSignalPlayerId,
  fetchPushSubscriptionStatus,
  fireDespiaScheme,
  linkOneSignalUser,
  persistDespiaPushToken,
  readWindowPlayerId,
} from '@/lib/despiaOneSignal';
import { isPreviewServiceWorkerDisabled } from '@/lib/serviceWorker';
import {
  clearPushDiagnosticsOnLogout,
  getOrCreateDeviceId,
  patchPushDiagnostics,
  readPushDiagnostics,
  recordRegistrationAttempt,
  recordTokenRefresh,
  type PushRegistrationReason,
  type PushRegistrationState,
} from '@/lib/notifications/pushDiagnostics';

export type { PushRegistrationReason, PushRegistrationState };

type RegisterOptions = {
  requestPermission?: boolean;
  force?: boolean;
};

let inFlight: Promise<boolean> | null = null;
let pendingReason: PushRegistrationReason | null = null;
let bgSyncGeneration = 0;
let lifecycleInstalled = false;
let resumeDebounce: ReturnType<typeof setTimeout> | null = null;

const MAX_RETRIES = 6;
const BASE_BACKOFF_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function detectPlatform(): string {
  if (isDespiaRuntime()) return 'despia';
  if (typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent)) return 'ios_web';
  if (typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)) return 'android_web';
  return 'web';
}

async function resolveProfileContext(): Promise<{
  profileId: string;
  authUserId: string;
} | null> {
  const { data } = await db.auth.getUser();
  const authUserId = data.user?.id;
  if (!authUserId) return null;

  const { data: profile } = await db
    .from('profiles')
    .select('id')
    .eq('user_id', authUserId)
    .maybeSingle();

  const profileId = profile?.id || authUserId;
  return { profileId, authUserId };
}

async function linkServerRegistration(
  profileId: string,
  subscriptionId: string,
  reason: PushRegistrationReason,
): Promise<boolean> {
  const deviceId = getOrCreateDeviceId();
  const platform = detectPlatform();
  const { data, error } = await db.functions.invoke('link-onesignal-user', {
    body: {
      profileId,
      profile_id: profileId,
      subscriptionId: subscriptionId || undefined,
      platform,
      device_id: deviceId,
      reason,
    },
  });
  if (error) {
    console.warn('[PushReg] link-onesignal-user failed', error);
    return false;
  }
  const payload = data as { linked?: boolean; success?: boolean; subscriptionId?: string } | null;
  return !!(payload?.linked || payload?.success || payload?.subscriptionId);
}

async function registerDespia(
  profileId: string,
  authUserId: string,
  reason: PushRegistrationReason,
  options: RegisterOptions,
): Promise<boolean> {
  patchPushDiagnostics({
    externalUserId: profileId,
    authUserId,
    platform: 'despia',
  });

  fireDespiaScheme(`setonesignalplayerid://?user_id=${encodeURIComponent(profileId)}`);
  fireDespiaScheme(`setOneSignalPlayerId://?user_id=${encodeURIComponent(profileId)}`);

  if (options.requestPermission) {
    const accepted = await acceptDespiaPushPermission(profileId);
    if (!accepted.granted) {
      patchPushDiagnostics({ state: 'denied', permission: false });
      return false;
    }
  }

  const permission = await checkDespiaPushPermission();
  patchPushDiagnostics({ permission });

  if (permission === false && !options.requestPermission) {
    patchPushDiagnostics({ state: 'denied' });
    return false;
  }

  let subscriptionId = readWindowPlayerId();
  if (!subscriptionId) {
    subscriptionId = await fetchDespiaOneSignalPlayerId(reason === 'permission_granted' ? 2000 : 800);
  }

  if (subscriptionId) {
    await persistDespiaPushToken(profileId, subscriptionId);
    await linkServerRegistration(profileId, subscriptionId, reason);
    patchPushDiagnostics({ subscriptionId, state: 'linked' });
    startBackgroundPlayerSync(profileId, authUserId, ++bgSyncGeneration);
    return true;
  }

  // Permission granted but player id not yet available — background sync will finish.
  void persistDespiaPushToken(profileId, '');
  await linkServerRegistration(profileId, '', reason);
  patchPushDiagnostics({ state: 'degraded' });
  startBackgroundPlayerSync(profileId, authUserId, ++bgSyncGeneration);
  return permission !== false;
}

async function registerWeb(
  profileId: string,
  authUserId: string,
  reason: PushRegistrationReason,
  options: RegisterOptions,
): Promise<boolean> {
  patchPushDiagnostics({ externalUserId: profileId, authUserId, platform: 'web' });

  if (
    typeof window === 'undefined' ||
    !('Notification' in window) ||
    isPreviewServiceWorkerDisabled()
  ) {
    return false;
  }

  if (options.requestPermission && Notification.permission === 'default') {
    const result = await Notification.requestPermission();
    patchPushDiagnostics({ permission: result === 'granted' });
    if (result !== 'granted') {
      patchPushDiagnostics({ state: 'denied' });
      return false;
    }
  }

  patchPushDiagnostics({ permission: Notification.permission === 'granted' });

  // OneSignal web login handled by DespiaOneSignalSync for non-Despia web.
  const linked = await linkOneSignalUser(profileId);
  if (linked) {
    patchPushDiagnostics({ state: 'linked' });
    return true;
  }

  await linkServerRegistration(profileId, '', reason);
  return Notification.permission === 'granted';
}

function startBackgroundPlayerSync(profileId: string, authUserId: string, generation: number): void {
  void (async () => {
    for (let attempt = 1; attempt <= 16; attempt++) {
      if (generation !== bgSyncGeneration) return;
      await sleep(Math.min(BASE_BACKOFF_MS * attempt, 4000));
      if (generation !== bgSyncGeneration) return;

      try {
        fireDespiaScheme(`setonesignalplayerid://?user_id=${encodeURIComponent(profileId)}`);
        const playerId = readWindowPlayerId() || (await fetchDespiaOneSignalPlayerId(400));
        if (!playerId) continue;

        await persistDespiaPushToken(profileId, playerId);
        const linked = await linkServerRegistration(profileId, playerId, 'health_check');
        if (linked) {
          patchPushDiagnostics({ subscriptionId: playerId, state: 'linked' });
          recordRegistrationAttempt('health_check', true, `bg attempt ${attempt}`);
          return;
        }
      } catch (err) {
        console.warn('[PushReg:bg]', attempt, err);
      }
    }
  })();
}

async function runRegister(
  reason: PushRegistrationReason,
  options: RegisterOptions = {},
): Promise<boolean> {
  const ctx = await resolveProfileContext();
  if (!ctx) {
    patchPushDiagnostics({ state: 'idle' });
    return false;
  }

  patchPushDiagnostics({ state: 'registering' });

  let ok = false;
  let lastErr = '';

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      ok = isDespiaRuntime()
        ? await registerDespia(ctx.profileId, ctx.authUserId, reason, options)
        : await registerWeb(ctx.profileId, ctx.authUserId, reason, options);

      if (ok) break;

      const status = await fetchPushSubscriptionStatus(ctx.profileId);
      patchPushDiagnostics({ serverSubscriptionCount: status.count });
      if (status.count > 0) {
        ok = true;
        patchPushDiagnostics({ state: 'linked', subscriptionId: status.subscriptionIds[0] || '' });
        break;
      }
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
      console.warn(`[PushReg] attempt ${attempt + 1} failed`, err);
    }

    if (attempt < MAX_RETRIES - 1) {
      await sleep(BASE_BACKOFF_MS * Math.pow(2, attempt));
    }
  }

  recordRegistrationAttempt(reason, ok, ok ? undefined : lastErr || 'no subscription');

  if (ok) {
    const status = await fetchPushSubscriptionStatus(ctx.profileId).catch(() => ({ count: 0, subscriptionIds: [] }));
    patchPushDiagnostics({
      serverSubscriptionCount: status.count,
      subscriptionId: status.subscriptionIds[0] || readPushDiagnostics().subscriptionId,
    });
  }

  return ok;
}

/** Register device — coalesces concurrent calls. */
export async function registerPushDevice(
  reason: PushRegistrationReason,
  options: RegisterOptions = {},
): Promise<boolean> {
  if (inFlight && !options.force) {
    pendingReason = reason;
    return inFlight;
  }

  inFlight = runRegister(reason, options).finally(() => {
    inFlight = null;
    const next = pendingReason;
    pendingReason = null;
    if (next && next !== reason) {
      void registerPushDevice(next);
    }
  });

  return inFlight;
}

export async function unregisterPushDevice(): Promise<void> {
  bgSyncGeneration += 1;
  const snap = readPushDiagnostics();
  const profileId = snap.externalUserId;
  if (profileId) {
    try {
      await db.from('push_tokens').delete().eq('user_id', profileId);
    } catch {
      /* ignore */
    }
  }
  clearPushDiagnosticsOnLogout();
}

export async function healthCheckPushRegistration(): Promise<boolean> {
  patchPushDiagnostics({ lastHealthCheckAt: new Date().toISOString() });
  const snap = readPushDiagnostics();
  if (!snap.externalUserId) return false;

  const status = await fetchPushSubscriptionStatus(snap.externalUserId);
  patchPushDiagnostics({ serverSubscriptionCount: status.count });

  if (status.count > 0) {
    patchPushDiagnostics({ state: 'linked', subscriptionId: status.subscriptionIds[0] || snap.subscriptionId });
    return true;
  }

  if (isDespiaRuntime()) {
    const perm = await checkDespiaPushPermission();
    if (perm === true) {
      return registerPushDevice('health_check', { force: true });
    }
  }

  return false;
}

export function getPushRegistrationStatus() {
  return readPushDiagnostics();
}

export function installPushRegistrationLifecycle(): () => void {
  if (lifecycleInstalled || typeof window === 'undefined') return () => {};
  lifecycleInstalled = true;

  const scheduleResume = (reason: PushRegistrationReason) => {
    if (resumeDebounce) clearTimeout(resumeDebounce);
    resumeDebounce = setTimeout(() => {
      resumeDebounce = null;
      void registerPushDevice(reason);
      void healthCheckPushRegistration();
    }, 1500);
  };

  const onOnline = () => void registerPushDevice('network_reconnect');
  const onVisible = () => {
    if (document.visibilityState === 'visible') scheduleResume('foreground');
  };
  const onPageShow = () => scheduleResume('pageshow');
  const onAppResumed = () => scheduleResume('app_resumed');

  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('pageshow', onPageShow);
  window.addEventListener('app-resumed', onAppResumed);

  // Initial launch registration
  void registerPushDevice('app_launch');

  return () => {
    lifecycleInstalled = false;
    window.removeEventListener('online', onOnline);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('pageshow', onPageShow);
    window.removeEventListener('app-resumed', onAppResumed);
    if (resumeDebounce) clearTimeout(resumeDebounce);
  };
}