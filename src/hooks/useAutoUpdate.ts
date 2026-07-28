import { useEffect, useRef } from 'react';
import { isDespiaRuntime } from '@/lib/despiaBridge';
import { isNativePlatform } from '@/lib/capacitor';
import { signalAppUpdate, APP_UPDATE_RELOAD_DELAY_MS } from '@/lib/appUpdateBridge';

const RELOAD_GUARD_KEY = 'vybe-entry-reload';
const STORED_ENTRY_KEY = 'vybe-app-entry';

function runningEntryPath(): string | null {
  if (typeof document === 'undefined') return null;
  const scripts = Array.from(document.querySelectorAll('script[type="module"][src]'));
  for (const el of scripts) {
    const src = el.getAttribute('src') || '';
    if (/\/assets\/app-[^/]+\.js(?:\?|$)/i.test(src)) {
      try {
        return new URL(src, window.location.origin).pathname;
      } catch {
        return src.split('?')[0];
      }
    }
  }
  return null;
}

/**
 * Keep returning sessions on the current production entry.
 * Compares /version.json to the running module script; reloads at most once per mismatch.
 */
export function useAutoUpdate() {
  const hasChecked = useRef(false);

  useEffect(() => {
    if (import.meta.env.DEV) return;
    // Despia/Capacitor use OTA via despia/local.json — never purge WebView caches here.
    if (isDespiaRuntime() || isNativePlatform) return;
    if (hasChecked.current) return;

    const checkForUpdates = async () => {
      if (hasChecked.current) return;
      hasChecked.current = true;

      try {
        const response = await fetch(`/version.json?_=${Date.now()}`, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' },
        });
        if (!response.ok) return;

        const payload = (await response.json()) as { entry?: string | null; commit_short?: string };
        const remoteEntry = payload.entry || '';
        if (!remoteEntry) return;

        const localEntry = runningEntryPath();
        const storedEntry = sessionStorage.getItem(STORED_ENTRY_KEY);
        const alreadyReloaded = sessionStorage.getItem(RELOAD_GUARD_KEY) === remoteEntry;

        sessionStorage.setItem(STORED_ENTRY_KEY, remoteEntry);

        const mismatch =
          (localEntry && localEntry !== remoteEntry) ||
          (storedEntry && storedEntry !== remoteEntry);

        if (!mismatch || alreadyReloaded) {
          if (localEntry === remoteEntry) {
            sessionStorage.removeItem(RELOAD_GUARD_KEY);
          }
          return;
        }

        console.info('[AutoUpdate] Entry mismatch — reloading once', {
          local: localEntry,
          remote: remoteEntry,
          commit: payload.commit_short,
        });

        sessionStorage.setItem(RELOAD_GUARD_KEY, remoteEntry);
        signalAppUpdate();

        // Drop obsolete asset caches only — keep media caches when possible.
        if ('caches' in window) {
          const names = await caches.keys();
          await Promise.all(
            names
              .filter((name) => /vybe-(?:v|static|shell|assets)/i.test(name))
              .map((name) => caches.delete(name)),
          );
        }

        window.setTimeout(() => {
          window.location.replace(`/?_vybe=${Date.now()}`);
        }, APP_UPDATE_RELOAD_DELAY_MS);
      } catch (error) {
        console.warn('[AutoUpdate] Check failed:', error);
      }
    };

    const timeout = window.setTimeout(checkForUpdates, 1200);
    return () => window.clearTimeout(timeout);
  }, []);
}
