import { isNativeAppShell } from '@/lib/despiaBridge';

const NEVER_ASK_KEY = 'vybe-external-link-never-ask';

/**
 * Apple JS SDK (usePopup) calls window.open → appleid.apple.com and needs a real
 * Window + opener for postMessage. Blocking/prompting returns null → Apple rejects
 * with opaque "unknown" in ~300ms. Never prompt or strip opener for these hosts.
 * Despia iOS Apple sign-in uses Apple JS (see despiaOAuth); during signIn we also
 * fully restore native window.open via runWithExternalLinkGuardBypassed.
 */
const OAUTH_AUTH_HOSTS = new Set([
  'appleid.apple.com',
  'idmsa.apple.com',
  'appleid.cdn-apple.com',
]);

export type ExternalLinkRequest = {
  url: string;
  host: string;
};

type Pending = ExternalLinkRequest & {
  resolve: (allowed: boolean) => void;
};

let pending: Pending | null = null;
const listeners = new Set<(req: ExternalLinkRequest | null) => void>();

/** Unpatched window.open — used after user approval so the guard cannot re-prompt. */
let nativeOpen: typeof window.open | null = null;

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url.slice(0, 48);
  }
}

export function isExternalHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test((url || '').trim());
}

/** True for Apple Sign-In authorize URLs that must use native window.open. */
export function isOAuthAuthUrl(url: string): boolean {
  if (!isExternalHttpUrl(url)) return false;
  return OAUTH_AUTH_HOSTS.has(hostOf(url));
}

export function isExternalLinkNeverAsk(): boolean {
  try {
    return localStorage.getItem(NEVER_ASK_KEY) === '1';
  } catch {
    return false;
  }
}

export function setExternalLinkNeverAsk(value: boolean): void {
  try {
    if (value) localStorage.setItem(NEVER_ASK_KEY, '1');
    else localStorage.removeItem(NEVER_ASK_KEY);
  } catch {
    /* ignore */
  }
}

function notify(): void {
  const snapshot = pending ? { url: pending.url, host: pending.host } : null;
  listeners.forEach((fn) => fn(snapshot));
}

export function subscribeExternalLinkPrompt(
  listener: (req: ExternalLinkRequest | null) => void,
): () => void {
  listeners.add(listener);
  listener(pending ? { url: pending.url, host: pending.host } : null);
  return () => listeners.delete(listener);
}

function openExternalAllowed(url: string): void {
  const open = nativeOpen || window.open.bind(window);
  open(url, '_blank', 'noopener,noreferrer');
}

export function resolveExternalLinkPrompt(allowed: boolean, neverAsk = false): void {
  if (neverAsk) setExternalLinkNeverAsk(true);
  const current = pending;
  pending = null;
  notify();
  current?.resolve(allowed);
  if (allowed && current) {
    openExternalAllowed(current.url);
  }
}

export function promptExternalLink(url: string): Promise<boolean> {
  const clean = url.trim();
  if (!isExternalHttpUrl(clean)) return Promise.resolve(false);
  // Apple Sign-In popups must open immediately with opener intact.
  if (isOAuthAuthUrl(clean)) {
    const open = nativeOpen || window.open.bind(window);
    open(clean, '_blank');
    return Promise.resolve(true);
  }
  if (isExternalLinkNeverAsk()) {
    openExternalAllowed(clean);
    return Promise.resolve(true);
  }
  if (pending) {
    pending.resolve(false);
    pending = null;
  }
  return new Promise((resolve) => {
    pending = { url: clean, host: hostOf(clean), resolve };
    notify();
  });
}

let installed = false;
/** Nested depth for runWithExternalLinkGuardBypassed — restore patch when 0. */
let bypassDepth = 0;
let openBeforeBypass: typeof window.open | null = null;

/**
 * Temporarily restore unpatched window.open for Apple JS usePopup.
 * Allowlist alone still left opaque "unknown" in Despia WKWebView; full bypass
 * removes any wrapper between Apple SDK and the real open.
 */
export async function runWithExternalLinkGuardBypassed<T>(fn: () => T | Promise<T>): Promise<T> {
  if (typeof window === 'undefined' || !nativeOpen) {
    return await fn();
  }

  bypassDepth += 1;
  if (bypassDepth === 1) {
    openBeforeBypass = window.open;
    try {
      window.open = nativeOpen;
    } catch {
      /* some WebViews disallow reassignment — allowlist path still applies */
    }
  }

  try {
    return await fn();
  } finally {
    bypassDepth = Math.max(0, bypassDepth - 1);
    if (bypassDepth === 0 && openBeforeBypass) {
      try {
        window.open = openBeforeBypass;
      } catch {
        /* ignore */
      }
      openBeforeBypass = null;
    }
  }
}

/** True while Apple (or other) sign-in holds a full window.open bypass. */
export function isExternalLinkGuardBypassed(): boolean {
  return bypassDepth > 0;
}

/** Block auto external navigation on native shell; require explicit user confirm. */
export function installExternalLinkGuard(): void {
  if (installed || typeof window === 'undefined' || typeof document === 'undefined') return;
  if (!isNativeAppShell()) return;
  installed = true;

  document.addEventListener(
    'click',
    (event) => {
      const anchor = (event.target as HTMLElement | null)?.closest('a[href]');
      if (!anchor) return;
      const href = anchor.getAttribute('href') || '';
      if (!isExternalHttpUrl(href)) return;
      // Allow Apple Sign-In anchors through (rare; SDK usually uses window.open).
      if (isOAuthAuthUrl(href)) return;
      event.preventDefault();
      event.stopPropagation();
      void promptExternalLink(href);
    },
    true,
  );

  try {
    nativeOpen = window.open.bind(window);
    const originalOpen = nativeOpen;
    window.open = ((url?: string | URL, target?: string, features?: string) => {
      const asString = typeof url === 'string' ? url : url?.toString() || '';
      // [iOS-only path critical] Apple JS popup — pass through with original
      // features so opener/postMessage works. Do not return null.
      if (isOAuthAuthUrl(asString)) {
        return originalOpen(url, target, features);
      }
      if (isExternalHttpUrl(asString)) {
        void promptExternalLink(asString);
        return null;
      }
      return originalOpen(url, target, features);
    }) as typeof window.open;
  } catch {
    /* ignore — some WebViews disallow patching window.open */
  }

  // Despia Android WebView often makes Location.prototype.assign read-only.
  // Assigning throws and previously aborted main.tsx before __VYBE_MAIN_EVAL__.
  try {
    const originalAssign = window.location.assign.bind(window.location);
    const guardedAssign = ((url: string | URL) => {
      const asString = typeof url === 'string' ? url : url.toString();
      if (isOAuthAuthUrl(asString)) {
        originalAssign(url);
        return;
      }
      if (isExternalHttpUrl(asString)) {
        void promptExternalLink(asString);
        return;
      }
      originalAssign(url);
    }) as typeof window.location.assign;

    try {
      window.location.assign = guardedAssign;
    } catch {
      Object.defineProperty(window.location, 'assign', {
        configurable: true,
        writable: true,
        value: guardedAssign,
      });
    }
  } catch {
    /* ignore — click interceptor still covers most external navigations */
  }
}
