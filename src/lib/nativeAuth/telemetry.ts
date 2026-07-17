/**
 * Native auth telemetry — stage allowlist only.
 * Never log tokens, email, authorization codes, or raw nonce.
 */
import { authLog } from '@/lib/authLog';

/** Allowed stage names for native auth timeline. */
export const NATIVE_AUTH_TELEMETRY_STAGES = [
  'native_auth_eligible_check',
  'native_auth_bridge_check',
  'native_auth_start',
  'native_auth_bridge_reply',
  'native_auth_credential_start',
  'native_auth_credential_done',
  'native_auth_cancelled',
  'native_auth_error',
  'native_auth_legacy_assert',
] as const;

export type NativeAuthTelemetryStage = (typeof NATIVE_AUTH_TELEMETRY_STAGES)[number];

const SENSITIVE_KEYS = new Set([
  'token',
  'idtoken',
  'id_token',
  'accesstoken',
  'access_token',
  'email',
  'nonce',
  'rawnonce',
  'secret',
  'password',
  'authorization',
  'authorizationcode',
  'authorization_code',
  'customtoken',
  'custom_token',
]);

function isSensitiveKey(key: string): boolean {
  const norm = key.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  if (SENSITIVE_KEYS.has(norm)) return true;
  // Catch *Token / *Email / *Nonce suffixes but allow idTokenLen / hasIdToken flags
  if (/len$/i.test(key) || /^has/i.test(key)) return false;
  return /(?:^|_)(token|email|nonce|secret|password)(?:s)?$/i.test(key) || /Token$|Email$|Nonce$/.test(key);
}

export type NativeAuthTelemetryPayload = Record<string, unknown>;

/** Strip any accidental sensitive fields before logging. */
export function redactNativeAuthTelemetry(
  payload: NativeAuthTelemetryPayload | undefined,
): NativeAuthTelemetryPayload {
  if (!payload || typeof payload !== 'object') return {};
  const out: NativeAuthTelemetryPayload = {};
  for (const [key, value] of Object.entries(payload)) {
    if (isSensitiveKey(key)) continue;
    if (typeof value === 'string' && value.length > 200) {
      out[key] = `${value.slice(0, 80)}…`;
      continue;
    }
    // Booleans, numbers, short safe strings, nested shallow flags only
    if (
      value === null ||
      typeof value === 'boolean' ||
      typeof value === 'number' ||
      typeof value === 'string'
    ) {
      out[key] = value;
    } else if (typeof value === 'object') {
      out[key] = '[object]';
    }
  }
  return out;
}

export function nativeAuthTelemetry(
  stage: NativeAuthTelemetryStage,
  payload?: NativeAuthTelemetryPayload,
): void {
  if (!(NATIVE_AUTH_TELEMETRY_STAGES as readonly string[]).includes(stage)) return;
  authLog(stage, redactNativeAuthTelemetry(payload));
}

/**
 * When the native path is active, legacy callback/oauthDismiss/exchange must not run.
 * Call after a successful native sign-in to assert (dev log only).
 */
export function assertLegacyPathNotUsed(context: {
  provider: string;
  usedNativeCallback?: boolean;
  usedOauthDismiss?: boolean;
  usedExchange?: boolean;
}): void {
  const usedCallback = Boolean(context.usedNativeCallback);
  const usedDismiss = Boolean(context.usedOauthDismiss);
  const usedExchange = Boolean(context.usedExchange);
  const ok = !usedCallback && !usedDismiss && !usedExchange;
  nativeAuthTelemetry('native_auth_legacy_assert', {
    provider: context.provider,
    ok,
    callback_boot: usedCallback ? 1 : 0,
    fire_close: usedDismiss ? 1 : 0,
    oauthDismiss: usedDismiss ? 1 : 0,
    exchange: usedExchange ? 1 : 0,
  });
  if (!ok && import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.warn('[VYBE AUTH] native path used legacy callback/dismiss/exchange — should be zero', {
      provider: context.provider,
      usedCallback,
      usedDismiss,
      usedExchange,
    });
  }
}
