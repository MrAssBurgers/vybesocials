/** Local push diagnostics — persisted for the developer diagnostics page. */

export type PushRegistrationReason =
  | 'first_launch'
  | 'app_launch'
  | 'login'
  | 'signup'
  | 'token_refresh'
  | 'resume'
  | 'foreground'
  | 'network_reconnect'
  | 'user_toggle'
  | 'health_check'
  | 'force_reregister'
  | 'permission_granted'
  | 'pageshow'
  | 'app_resumed';

export type PushRegistrationState =
  | 'idle'
  | 'registering'
  | 'linked'
  | 'degraded'
  | 'denied'
  | 'unregistered';

export interface PushDiagnosticSnapshot {
  state: PushRegistrationState;
  permission: boolean | null;
  subscriptionId: string;
  externalUserId: string;
  authUserId: string;
  deviceId: string;
  platform: string;
  lastRegisteredAt: string | null;
  lastRegistrationReason: PushRegistrationReason | null;
  lastRegistrationError: string | null;
  lastNotificationReceivedAt: string | null;
  lastNotificationOpenedAt: string | null;
  lastHealthCheckAt: string | null;
  registrationRetryCount: number;
  serverSubscriptionCount: number;
  tokenRefreshHistory: string[];
  registrationHistory: Array<{ at: string; reason: string; ok: boolean; detail?: string }>;
}

const STORAGE_KEY = 'vybe.push.diagnostics';
const DEVICE_ID_KEY = 'vybe.push.device_id';

function defaultSnapshot(): PushDiagnosticSnapshot {
  return {
    state: 'idle',
    permission: null,
    subscriptionId: '',
    externalUserId: '',
    authUserId: '',
    deviceId: getOrCreateDeviceId(),
    platform: 'unknown',
    lastRegisteredAt: null,
    lastRegistrationReason: null,
    lastRegistrationError: null,
    lastNotificationReceivedAt: null,
    lastNotificationOpenedAt: null,
    lastHealthCheckAt: null,
    registrationRetryCount: 0,
    serverSubscriptionCount: 0,
    tokenRefreshHistory: [],
    registrationHistory: [],
  };
}

export function getOrCreateDeviceId(): string {
  if (typeof localStorage === 'undefined') return 'server';
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = crypto.randomUUID?.() || `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return `ephemeral-${Date.now()}`;
  }
}

export function readPushDiagnostics(): PushDiagnosticSnapshot {
  if (typeof localStorage === 'undefined') return defaultSnapshot();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSnapshot();
    const parsed = JSON.parse(raw) as Partial<PushDiagnosticSnapshot>;
    return { ...defaultSnapshot(), ...parsed, deviceId: getOrCreateDeviceId() };
  } catch {
    return defaultSnapshot();
  }
}

export function patchPushDiagnostics(patch: Partial<PushDiagnosticSnapshot>): PushDiagnosticSnapshot {
  const next = { ...readPushDiagnostics(), ...patch, deviceId: getOrCreateDeviceId() };
  try {
    if (next.registrationHistory.length > 40) {
      next.registrationHistory = next.registrationHistory.slice(-40);
    }
    if (next.tokenRefreshHistory.length > 20) {
      next.tokenRefreshHistory = next.tokenRefreshHistory.slice(-20);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
  return next;
}

export function recordRegistrationAttempt(
  reason: PushRegistrationReason,
  ok: boolean,
  detail?: string,
): void {
  const snap = readPushDiagnostics();
  patchPushDiagnostics({
    registrationHistory: [
      ...snap.registrationHistory,
      { at: new Date().toISOString(), reason, ok, detail },
    ],
    lastRegistrationReason: reason,
    lastRegistrationError: ok ? null : detail || 'registration failed',
    registrationRetryCount: ok ? 0 : snap.registrationRetryCount + 1,
    ...(ok ? { lastRegisteredAt: new Date().toISOString(), state: 'linked' as const } : { state: 'degraded' as const }),
  });
}

export function recordPushReceived(): void {
  patchPushDiagnostics({ lastNotificationReceivedAt: new Date().toISOString() });
}

export function recordPushOpened(): void {
  patchPushDiagnostics({ lastNotificationOpenedAt: new Date().toISOString() });
}

export function recordTokenRefresh(detail: string): void {
  const snap = readPushDiagnostics();
  patchPushDiagnostics({
    tokenRefreshHistory: [...snap.tokenRefreshHistory, `${new Date().toISOString()} ${detail}`],
  });
}

export function clearPushDiagnosticsOnLogout(): void {
  patchPushDiagnostics({
    state: 'unregistered',
    subscriptionId: '',
    externalUserId: '',
    authUserId: '',
    serverSubscriptionCount: 0,
  });
}

export function exportPushDebugText(): string {
  const d = readPushDiagnostics();
  return JSON.stringify(d, null, 2);
}
