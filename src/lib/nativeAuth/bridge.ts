/**
 * Despia nativeauth:// bridge.
 *
 * Contract (see docs/DESPIA_NATIVE_AUTH_SUPPORT_REQUEST.md):
 *   Launch:  nativeauth://apple?requestId=&nonceHash= | nativeauth://google?requestId=
 *   Result:  window.nativeAuthResult (watched key) — never tokens in URL/deeplink.
 *
 * Bridge availability defaults FALSE until Despia ships AuthenticationServices /
 * GIDSignIn. Presence of oauth:// alone does NOT count — ASWeb is not native auth.
 */
import { despiaCall, isDespiaRuntime } from '@/lib/despiaBridge';
import type {
  NativeAuthErrorCode,
  NativeAuthFailure,
  NativeAuthProvider,
  NativeAuthRequestOptions,
  NativeAuthResult,
  NativeAuthSuccess,
} from './types';
import { NATIVE_AUTH_ERROR_CODES } from './types';

const WATCH_KEY = 'nativeAuthResult';
const DEFAULT_TIMEOUT_MS = 120_000;

let inFlight: Promise<NativeAuthResult> | null = null;

function randomRequestId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through */
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function safeSig(val: unknown): string {
  if (val === undefined) return 'u';
  if (val === null) return 'n';
  if (typeof val !== 'object') return `${typeof val}:${String(val)}`;
  try {
    return `o:${JSON.stringify(val)}`;
  } catch {
    return 'o:[unserializable]';
  }
}

function isReadyValue(val: unknown): boolean {
  if (val === undefined || val === 'n/a') return false;
  if (Array.isArray(val) && val.length === 0) return false;
  if (val && typeof val === 'object' && !Array.isArray(val) && Object.keys(val as object).length === 0) {
    return false;
  }
  return true;
}

/**
 * Detect whether Despia advertises the native auth bridge.
 *
 * Checks (any one is enough):
 * 1. `window.__VYBE_NATIVE_AUTH__` truthy or `{ enabled: true }`
 * 2. `window.nativeAuthBridge` present (function or object)
 * 3. `window.webkit.messageHandlers.nativeAuth`
 * 4. Explicit ready flag `window.__VYBE_NATIVE_AUTH_READY__ === true`
 *
 * Default: false. Do not infer from oauth:// / ASWeb support.
 */
export function isBridgeAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  if (!isDespiaRuntime()) return false;
  const w = window as Window & {
    __VYBE_NATIVE_AUTH__?: boolean | { enabled?: boolean };
    __VYBE_NATIVE_AUTH_READY__?: boolean;
    nativeAuthBridge?: unknown;
    webkit?: { messageHandlers?: { nativeAuth?: unknown } };
  };

  if (w.__VYBE_NATIVE_AUTH_READY__ === true) return true;

  const flag = w.__VYBE_NATIVE_AUTH__;
  if (flag === true) return true;
  if (flag && typeof flag === 'object' && flag.enabled === true) return true;

  if (w.nativeAuthBridge != null) return true;
  if (w.webkit?.messageHandlers?.nativeAuth != null) return true;

  return false;
}

function normalizeCode(raw: unknown): NativeAuthErrorCode {
  const s = String(raw || '').trim().toLowerCase();
  if ((NATIVE_AUTH_ERROR_CODES as readonly string[]).includes(s)) {
    return s as NativeAuthErrorCode;
  }
  if (/cancel/i.test(s)) return 'cancelled';
  if (/network/i.test(s)) return 'network_error';
  if (/config/i.test(s)) return 'configuration_error';
  if (/token|missing/i.test(s)) return 'missing_token';
  if (/provider/i.test(s)) return 'provider_error';
  if (/bridge/i.test(s)) return 'bridge_error';
  return 'unknown';
}

function parsePayload(raw: unknown): NativeAuthResult | null {
  let value: unknown = raw;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      value = JSON.parse(trimmed);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object') return null;
  const rec = value as Record<string, unknown>;

  const provider =
    rec.provider === 'apple' || rec.provider === 'google' ? (rec.provider as NativeAuthProvider) : undefined;
  const requestId = typeof rec.requestId === 'string' ? rec.requestId : undefined;

  if (rec.ok === true) {
    const idToken = typeof rec.idToken === 'string' ? rec.idToken.trim() : '';
    if (!idToken || !provider || !requestId) {
      return {
        ok: false,
        provider,
        requestId,
        code: 'missing_token',
        message: 'Native auth success payload missing token',
      };
    }
    const success: NativeAuthSuccess = {
      ok: true,
      provider,
      requestId,
      idToken,
      accessToken: typeof rec.accessToken === 'string' ? rec.accessToken : undefined,
      authorizationCode: typeof rec.authorizationCode === 'string' ? rec.authorizationCode : undefined,
      rawNonce: typeof rec.rawNonce === 'string' ? rec.rawNonce : undefined,
      email: typeof rec.email === 'string' ? rec.email : undefined,
      givenName: typeof rec.givenName === 'string' ? rec.givenName : undefined,
      familyName: typeof rec.familyName === 'string' ? rec.familyName : undefined,
    };
    return success;
  }

  const failure: NativeAuthFailure = {
    ok: false,
    provider,
    requestId,
    code: normalizeCode(rec.code),
    message: typeof rec.message === 'string' ? rec.message.slice(0, 200) : undefined,
  };
  return failure;
}

function matchesRequest(
  result: NativeAuthResult,
  requestId: string,
  provider: NativeAuthProvider,
): boolean {
  if (result.requestId && result.requestId !== requestId) return false;
  if (result.provider && result.provider !== provider) return false;
  // Require requestId on success; failures without requestId still accepted if provider matches or absent
  if (result.ok === true && result.requestId !== requestId) return false;
  if (result.ok === true && result.provider !== provider) return false;
  return true;
}

/**
 * Request native Apple/Google auth via Despia.
 * Single-flight: concurrent calls get bridge_error.
 * Ignores late / wrong-provider / wrong-requestId replies until timeout.
 */
export async function requestNativeAuth(
  provider: NativeAuthProvider,
  opts: NativeAuthRequestOptions = {},
): Promise<NativeAuthResult> {
  if (!isDespiaRuntime() || typeof window === 'undefined') {
    return { ok: false, provider, code: 'bridge_error', message: 'Not in Despia runtime' };
  }
  if (!isBridgeAvailable()) {
    return { ok: false, provider, code: 'bridge_error', message: 'Native auth bridge unavailable' };
  }
  if (inFlight) {
    return {
      ok: false,
      provider,
      code: 'bridge_error',
      message: 'Native auth already in progress',
    };
  }

  const requestId = randomRequestId();
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const params = new URLSearchParams({ requestId });
  if (provider === 'apple' && opts.nonceHash) {
    params.set('nonceHash', opts.nonceHash);
  }
  const url = `nativeauth://${provider}?${params.toString()}`;

  inFlight = (async (): Promise<NativeAuthResult> => {
    const w = window as Window & { [WATCH_KEY]?: unknown };
    const initialSig = safeSig(w[WATCH_KEY]);

    // Fire command (no wait) — we poll with requestId filtering ourselves.
    await despiaCall(url);

    return await new Promise<NativeAuthResult>((resolve) => {
      const started = Date.now();
      let settled = false;
      let poll = 0;
      let timer = 0;
      const finish = (value: NativeAuthResult) => {
        if (settled) return;
        settled = true;
        if (poll) clearInterval(poll);
        if (timer) clearTimeout(timer);
        resolve(value);
      };

      const check = () => {
        const raw = w[WATCH_KEY];
        if (!isReadyValue(raw) || safeSig(raw) === initialSig) {
          if (Date.now() - started >= timeoutMs) {
            finish({
              ok: false,
              provider,
              requestId,
              code: 'bridge_error',
              message: 'Native auth timed out',
            });
          }
          return;
        }
        const parsed = parsePayload(raw);
        if (!parsed) {
          // Unparseable — keep waiting (might be intermediate junk)
          if (Date.now() - started >= timeoutMs) {
            finish({
              ok: false,
              provider,
              requestId,
              code: 'bridge_error',
              message: 'Native auth returned invalid payload',
            });
          }
          return;
        }
        // Ignore wrong requestId / wrong provider (late or stale replies)
        if (!matchesRequest(parsed, requestId, provider)) {
          if (Date.now() - started >= timeoutMs) {
            finish({
              ok: false,
              provider,
              requestId,
              code: 'bridge_error',
              message: 'Native auth timed out waiting for matching reply',
            });
          }
          return;
        }
        // Ensure requestId stamped on failure if missing
        if (!parsed.ok && !parsed.requestId) {
          finish({ ...parsed, requestId, provider: parsed.provider || provider });
          return;
        }
        finish(parsed);
      };

      poll = window.setInterval(check, 75);
      timer = window.setTimeout(() => {
        finish({
          ok: false,
          provider,
          requestId,
          code: 'bridge_error',
          message: 'Native auth timed out',
        });
      }, timeoutMs + 25);
      check();
    });
  })().finally(() => {
    inFlight = null;
  });

  return inFlight;
}

/** Test helper — reset single-flight mutex. */
export function __resetNativeAuthBridgeForTests(): void {
  inFlight = null;
}
