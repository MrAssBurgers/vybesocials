/**
 * Shared Despia Native Runtime helpers.
 *
 * Detects whether we're running inside the Despia-wrapped WebView shell
 * (iOS WKWebView / Android Chromium) and exposes thin wrappers around
 * the deep-link bridges Despia ships with.
 *
 * IMPORTANT: outside the Despia shell every helper is a no-op so calling
 * code can use them unconditionally.
 */

import { isNativePlatform } from '@/lib/capacitor';
import { isAppleTouchDevice, isEmbeddedAppleWebView } from '@/lib/deviceDetection';

const DESPIA_UA_HINT = /despia|vybeapp|vybehub|com\.despia\.vybe|com\.vybe/i;
const DESPIA_CALLBACK_KEYS = ['nfcResult', 'payload', 'data', 'url', 'readNFCData'];

export function isDespiaRuntime(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (DESPIA_UA_HINT.test(ua)) return true;
  const w = window as any;
  const isAndroidWebView = /Android/i.test(ua) && (/; wv\)/i.test(ua) || /Version\/4\.0.*Chrome/i.test(ua));
  const isIOSWebView =
    isAppleTouchDevice() &&
    /AppleWebKit/i.test(ua) &&
    !/Safari/i.test(ua.split('AppleWebKit')[1] || '');
  return Boolean(
    isAndroidWebView ||
    isIOSWebView ||
    (isAppleTouchDevice() && isEmbeddedAppleWebView()) ||
    w.ReactNativeWebView ||
    w.webkit?.messageHandlers?.despia ||
    w.despiaVersion ||
    w.Despia ||
    w.__DESPIA__ ||
    w.nativePushEnabled !== undefined ||
    /app\.lovable\.416714c8-d013-4aff-984d-522418a9bbc7/i.test(ua) ||
    /app\.lovable\.762a689eac3b48a59a179f1c2b5b3a2b/i.test(ua)
  );
}

/** Store app shell: Despia Play/App Store builds or Capacitor native. */
export function isNativeAppShell(): boolean {
  return isDespiaRuntime() || isNativePlatform;
}

export function isAndroidUA(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent || '');
}

export function isIOSUA(): boolean {
  return isAppleTouchDevice();
}

let despiaMod: any | null = null;
async function getDespia(): Promise<any> {
  if (despiaMod) return despiaMod;
  const m = await import('despia-native');
  despiaMod = (m as any).default || m;
  return despiaMod;
}

/**
 * Fire a Despia deep link. Returns the parsed callback payload (if any) or null.
 * Safe to call outside Despia — resolves null.
 */
export async function despiaCall(
  url: string,
  expectKeys: string[] = [],
  timeoutMs = 10_000,
): Promise<Record<string, any> | null> {
  if (!isDespiaRuntime()) return null;
  try {
    const despia = await getDespia();
    const result: any = await Promise.race([
      expectKeys.length ? despia(url, expectKeys) : despia(url),
      new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    return result || null;
  } catch (err) {
    console.warn('[despiaBridge] call failed', url, err);
    return null;
  }
}

function normalizeNfcPayload(raw: unknown): string | null {
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    try { return decodeURIComponent(trimmed); } catch { return trimmed; }
  }
  if (raw && typeof raw === 'object') {
    const record = raw as Record<string, any>;
    for (const key of DESPIA_CALLBACK_KEYS) {
      const value = normalizeNfcPayload(record[key]);
      if (value) return value;
    }
  }
  return null;
}

/**
 * Scan an NFC tag via Despia's native bridge. Returns the raw decoded
 * payload string (URL/text) from the first responding bridge, or null
 * if not in Despia, not Android, or nothing was scanned.
 *
 * Callers are responsible for parsing the payload (e.g. friend URL).
 */
export async function despiaScanNFC(timeoutMs = 30_000): Promise<string | null> {
  if (!isDespiaRuntime()) return null;
  if (typeof window === 'undefined') return null;

  // Prefer official v2 API (`nfc://read` + `window.onNFCEvent`) on all platforms.
  const { despiaReadNFC } = await import('@/lib/despiaNFCv2');
  const v2 = await despiaReadNFC(timeoutMs);
  if (v2.ok && v2.payload) return v2.payload;
  if (v2.dismissed) return null;

  // Legacy Android polling for older Despia builds without v2 events.
  if (!isAndroidUA()) return null;
  const w = window as any;

  return await new Promise<string | null>((resolve) => {
    let settled = false;
    const previousCallback = w.readNFCResult;
    const initialValues = new Map(DESPIA_CALLBACK_KEYS.map((key) => [key, normalizeNfcPayload(w[key])]));
    const timers: { poll: number; timer: number } = {
      poll: 0,
      timer: 0,
    };
    const cleanup = () => {
      if (timers.timer) clearTimeout(timers.timer);
      if (timers.poll) clearInterval(timers.poll);
      w.readNFCResult = previousCallback;
    };
    const finish = (payload: unknown, source: string) => {
      if (settled) return;
      const normalized = normalizeNfcPayload(payload);
      console.log('[despiaBridge] NFC result', { source, hasPayload: Boolean(normalized), tag: typeof payload });
      if (!normalized) return;
      settled = true;
      cleanup();
      resolve(normalized);
    };
    timers.poll = window.setInterval(() => {
      for (const key of DESPIA_CALLBACK_KEYS) {
        const current = normalizeNfcPayload(w[key]);
        if (current && current !== initialValues.get(key)) {
          finish(current, key);
          return;
        }
      }
    }, 100);
    timers.timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      console.warn('[despiaBridge] NFC read timed out');
      resolve(null);
    }, timeoutMs);

    w.readNFCResult = (data: string, id?: string, tag?: string) => {
      finish(data, 'readNFCResult');
      if (typeof previousCallback === 'function') {
        try { previousCallback(data, id, tag); } catch {}
      }
    };

    void (async () => {
      const bridges = ['readnfc://', 'nfcread://', 'scannfc://', 'nfc://read'];
      for (const url of bridges) {
        if (settled) break;
        console.log('[despiaBridge] requesting NFC bridge', url);
        void despiaCall(url);
        await new Promise((r) => setTimeout(r, 150));
      }
    })();
  });
}

/**
 * Open the OS app-settings page for the wrapped app so the user can
 * grant NFC / Camera / etc. permission. Falls back to a generic settings URL.
 */
export async function openAppSettings(): Promise<void> {
  if (isDespiaRuntime()) {
    // Official Despia scheme (see setup.despia.com/native-features/app-settings).
    await despiaCall('settingsapp://');
    await despiaCall('appsettings://');
    await despiaCall('opensettings://');
    return;
  }
  // Native non-Despia: iOS supports app-settings:, Android supports intent links.
  if (isIOSUA()) {
    window.location.href = 'app-settings:';
  }
}
