const ALLOWED_PROTOCOLS = new Set(['https:', 'http:', 'com.despia.vybe:']);

/**
 * Navigate only to validated internal paths or allowlisted absolute URLs.
 * Custom schemes must be the registered Despia scheme — never empty / undefined.
 */
export function safeNavigate(url: string): void {
  const value = url?.trim();
  if (!value) {
    throw new Error('Navigation blocked because URL is empty');
  }

  if (value.startsWith('/') && !value.startsWith('//')) {
    window.location.assign(value);
    return;
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Navigation blocked because URL is malformed: ${value.slice(0, 80)}`);
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(`Unsupported navigation protocol: ${parsed.protocol}`);
  }

  window.location.assign(parsed.toString());
}

/** True when a Despia reopen deeplink is well-formed enough to put in <a href>. */
export function isValidDespiaOAuthDeeplink(url: string | null | undefined): boolean {
  const value = (url || '').trim();
  if (!value) return false;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'com.despia.vybe:') return false;
    if (!parsed.hostname && !parsed.pathname) return false;
    // Expect com.despia.vybe://oauth/auth...
    const hostOrPath = `${parsed.hostname}${parsed.pathname}`;
    return hostOrPath.includes('oauth');
  } catch {
    return false;
  }
}

export function isSafeInternalReturnPath(path: string | null | undefined): boolean {
  if (!path || typeof path !== 'string') return false;
  const value = path.trim();
  if (!value.startsWith('/') || value.startsWith('//')) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return false;
  if (value.toLowerCase().includes('javascript:')) return false;
  if (value.toLowerCase().includes('data:')) return false;
  return true;
}
