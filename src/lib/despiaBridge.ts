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

const DESPIA_UA_HINT = /despia|vybeapp|app\.lovable\.416714c8d0134aff984d522418a9bbc7|com\.despia\.vybe/i;

export function isDespiaRuntime(): boolean {
  if (typeof navigator === 'undefined') return false;
  return DESPIA_UA_HINT.test(navigator.userAgent || '');
}

export function isAndroidUA(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent || '');
}

export function isIOSUA(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent || '');
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

/**
 * Open the OS app-settings page for the wrapped app so the user can
 * grant NFC / Camera / etc. permission. Falls back to a generic settings URL.
 */
export async function openAppSettings(): Promise<void> {
  if (isDespiaRuntime()) {
    // Despia exposes appsettings:// to jump into the system app permission screen.
    const ok = await despiaCall('appsettings://');
    if (ok !== null) return;
    // Fallback bridge name used by some Despia builds.
    await despiaCall('opensettings://');
    return;
  }
  // Native non-Despia: iOS supports app-settings:, Android supports intent links.
  if (isIOSUA()) {
    window.location.href = 'app-settings:';
  }
}
