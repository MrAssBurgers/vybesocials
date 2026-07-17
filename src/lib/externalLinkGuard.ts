import { isNativeAppShell } from '@/lib/despiaBridge';

const NEVER_ASK_KEY = 'vybe-external-link-never-ask';

export type ExternalLinkRequest = {
  url: string;
  host: string;
};

type Pending = ExternalLinkRequest & {
  resolve: (allowed: boolean) => void;
};

let pending: Pending | null = null;
const listeners = new Set<(req: ExternalLinkRequest | null) => void>();

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

export function resolveExternalLinkPrompt(allowed: boolean, neverAsk = false): void {
  if (neverAsk) setExternalLinkNeverAsk(true);
  const current = pending;
  pending = null;
  notify();
  current?.resolve(allowed);
  if (allowed && current) {
    window.open(current.url, '_blank', 'noopener,noreferrer');
  }
}

export function promptExternalLink(url: string): Promise<boolean> {
  const clean = url.trim();
  if (!isExternalHttpUrl(clean)) return Promise.resolve(false);
  if (isExternalLinkNeverAsk()) {
    window.open(clean, '_blank', 'noopener,noreferrer');
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
      event.preventDefault();
      event.stopPropagation();
      void promptExternalLink(href);
    },
    true,
  );

  try {
    const originalOpen = window.open.bind(window);
    window.open = ((url?: string | URL, target?: string, features?: string) => {
      const asString = typeof url === 'string' ? url : url?.toString() || '';
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
