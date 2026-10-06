import { isDespiaRuntime } from '@/lib/despiaBridge';
import { signalAppUpdate, APP_UPDATE_RELOAD_DELAY_MS, hasActiveAppDraft } from '@/lib/appUpdateBridge';

export function isPreviewServiceWorkerDisabled() {
  if (typeof window === 'undefined') return false;
  const { hostname } = window.location;
  return (
    hostname.endsWith('.lovableproject.com') ||
    hostname.endsWith('.lovable.app') ||
    hostname.endsWith('.web.app') ||
    hostname.endsWith('.firebaseapp.com')
  );
}

export function isLocalDevHost(): boolean {
  if (typeof window === 'undefined') return false;
  const { hostname } = window.location;
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

/**
 * Register the VYBE service worker on vybehub.app and Lovable preview (same live backend).
 * Skips Despia localhost shells (despia-local mode) and local Vite dev.
 */
export function shouldRegisterServiceWorker(): boolean {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return false;

  const { hostname } = window.location;

  // Despia on-device HTTP server — SW would fight localhost caching.
  if (isDespiaRuntime() && (hostname === 'localhost' || hostname === '127.0.0.1')) {
    return false;
  }

  if (isPreviewServiceWorkerDisabled()) return false;

  // Production only. Previews often serve /sw.js through a redirect, which
  // browsers reject and can wedge boot/push initialization.
  if (
    hostname === 'vybehub.app' ||
    hostname === 'www.vybehub.app'
  ) {
    return true;
  }

  // Local Vite dev — no service worker (avoids stale cache fighting HMR).
  if (import.meta.env.DEV && (hostname === 'localhost' || hostname === '127.0.0.1')) {
    return false;
  }

  return false;
}

let registrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;
let updateIntervalStarted = false;
let loggedRegistration = false;
let updateFlowWired = false;
let reloadingForUpdate = false;

const SHELL_REFRESH_STORAGE_KEY = 'vybe-shell-refresh-firebase-recovery-v2';
const ACTIVE_SHELL_CACHE = 'vybe-shell-v8';

/**
 * One-time production repair for devices that cached the old reconstruction
 * document as their SPA shell. Only runs after a fresh no-store network fetch
 * succeeds, so an offline launch never sacrifices its last usable shell.
 */
async function refreshCachedAppShellOnce(): Promise<void> {
  if (typeof window === 'undefined' || !('caches' in window)) return;
  if (navigator.onLine === false) return;

  try {
    if (localStorage.getItem(SHELL_REFRESH_STORAGE_KEY) === 'done') return;
  } catch {
    // Storage may be blocked; the operation is still safe to attempt once in-memory.
  }

  try {
    const response = await fetch(`/?_vybe_shell_refresh=${Date.now()}`, {
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { 'x-vybe-shell-refresh': '1' },
    });
    if (!response.ok) return;

    const html = await response.clone().text();
    // Never pin a maintenance response for offline navigation. Online visitors
    // still receive it directly from the network when maintenance is enabled.
    if (/data-vybe-maintenance=["']true["']/i.test(html)) return;
    if (!/<script[^>]+(?:\/assets\/app(?:-[^"']+)?\.js|\/src\/main\.tsx)/i.test(html)) return;

    const names = await caches.keys();
    await Promise.all(
      names
        .filter((name) => name.startsWith('vybe-shell-'))
        .map((name) => caches.delete(name)),
    );

    const shellCache = await caches.open(ACTIVE_SHELL_CACHE);
    await shellCache.put('/', response.clone());

    try {
      localStorage.setItem(SHELL_REFRESH_STORAGE_KEY, 'done');
    } catch {
      /* storage unavailable */
    }
  } catch {
    // Fail open: service-worker setup must never block the app.
  }
}

/**
 * Deploy-safety flow: when a new SW is installed and waiting, tell it to
 * SKIP_WAITING, then reload once on controllerchange so the page never keeps
 * running old code that references deleted hashed chunks (white-screen path).
 * AppUpdateOverlay listens for `vybe-app-update` / controllerchange and covers
 * the transition visually.
 */
function wireUpdateFlow(registration: ServiceWorkerRegistration) {
  if (updateFlowWired) return;
  updateFlowWired = true;

  const RELOAD_ONCE_KEY = 'vybe-sw-reload-once';

  const promoteWaitingWorker = (worker: ServiceWorker | null) => {
    if (!worker || hasActiveAppDraft()) return;
    worker.postMessage({ type: 'SKIP_WAITING' });
  };

  // A worker may already be waiting from a previous visit.
  promoteWaitingWorker(registration.waiting);

  registration.addEventListener('updatefound', () => {
    const newWorker = registration.installing;
    if (!newWorker) return;
    newWorker.addEventListener('statechange', () => {
      // Only promote when an old controller exists — first install shouldn't reload.
      if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
        promoteWaitingWorker(newWorker);
      }
    });
  });

  // Distinguish "update replaced the controller" from the very first claim.
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadingForUpdate || !hadController || hasActiveAppDraft()) return;
    // Prevent A→B→A restart loops when another SW (e.g. messaging) also claims.
    try {
      if (sessionStorage.getItem(RELOAD_ONCE_KEY) === '1') return;
    } catch { return; }
    reloadingForUpdate = true;
    // Recheck edits after the delay; only signal the overlay when navigation proceeds.
    setTimeout(() => {
      if (hasActiveAppDraft()) { reloadingForUpdate = false; return; }
      try { sessionStorage.setItem(RELOAD_ONCE_KEY, '1'); } catch { reloadingForUpdate = false; return; }
      signalAppUpdate();
      window.location.replace(`/?_vybe=${Date.now()}`);
    }, APP_UPDATE_RELOAD_DELAY_MS);
  });

  // After a successful controlled reload, clear the once-guard so future deploys can update.
  try {
    if (registration.active && !registration.waiting && sessionStorage.getItem(RELOAD_ONCE_KEY) === '1') {
      // Delay clear slightly so a same-tick controllerchange from messaging can't loop.
      window.setTimeout(() => {
        try { if (!registration.waiting) sessionStorage.removeItem(RELOAD_ONCE_KEY); } catch { /* optional metadata */ }
      }, 4_000);
    }
  } catch { /* blocked storage must not prevent startup */ }
}

function logRegistrationOnce(scope: string) {
  if (loggedRegistration) return;
  loggedRegistration = true;
  if (import.meta.env.DEV) {
    console.log('[VYBE] Service worker registered:', scope);
  }
}

function startUpdateChecks(registration: ServiceWorkerRegistration) {
  if (updateIntervalStarted) return;
  updateIntervalStarted = true;
  setInterval(() => {
    registration.update().catch(() => {});
  }, 60 * 60 * 1000);
}

/** Single shared registration — safe to call from main.tsx and push hooks. */
export async function registerVybeServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!shouldRegisterServiceWorker()) return null;

  if (!registrationPromise) {
    registrationPromise = (async () => {
      try {
        await refreshCachedAppShellOnce();

        // Drop legacy messaging SW that claimed "/" and fought /sw.js updates.
        // Re-register the tombstone only when a root messaging controller/registration
        // is still present so updateViaCache:'none' can bypass a sticky HTTP cache.
        const all = await navigator.serviceWorker.getRegistrations();
        let hadRootMessaging = false;
        await Promise.all(
          all.map(async (reg) => {
            const script = reg.active?.scriptURL || reg.waiting?.scriptURL || reg.installing?.scriptURL || '';
            if (script.includes('firebase-messaging-sw.js') && new URL(reg.scope).pathname === '/') {
              hadRootMessaging = true;
              try {
                await reg.update();
              } catch {
                /* ignore */
              }
              try {
                await reg.unregister();
              } catch {
                /* ignore */
              }
            }
          }),
        );

        const controllerIsMessaging = Boolean(
          navigator.serviceWorker.controller?.scriptURL?.includes('firebase-messaging-sw.js'),
        );
        if (hadRootMessaging || controllerIsMessaging) {
          try {
            await navigator.serviceWorker.register('/firebase-messaging-sw.js?root_tombstone=v2', {
              scope: '/',
              updateViaCache: 'none',
            });
          } catch {
            /* ignore */
          }
          // Tombstone activate navigates clients — don't race /sw.js this pass.
          return null;
        }

        const existing = await navigator.serviceWorker.getRegistration('/');
        if (existing?.active?.scriptURL?.includes('/sw.js')) {
          logRegistrationOnce(existing.scope);
          wireUpdateFlow(existing);
          void existing.update().catch(() => {});
          startUpdateChecks(existing);
          return existing;
        }

        const registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
          updateViaCache: 'none',
        });
        logRegistrationOnce(registration.scope);
        wireUpdateFlow(registration);

        startUpdateChecks(registration);

        return registration;
      } catch (error) {
        registrationPromise = null;
        console.error('[VYBE] Service worker registration failed:', error);
        return null;
      }
    })();
  }

  return registrationPromise;
}

/** Resolve the app SW without re-registering or logging. */
export async function getVybeServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!shouldRegisterServiceWorker()) return null;
  const existing = await navigator.serviceWorker.getRegistration('/');
  if (existing?.active) return existing;
  return registerVybeServiceWorker();
}

export async function cleanupPreviewServiceWorkers() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return false;
  }

  registrationPromise = null;
  loggedRegistration = false;

  const registrations = await navigator.serviceWorker.getRegistrations();
  if (registrations.length === 0) {
    sessionStorage.removeItem('vybe-preview-sw-reset');
    return false;
  }

  await Promise.all(registrations.map((registration) => registration.unregister()));

  if ('caches' in window) {
    const cacheKeys = await caches.keys();
    await Promise.all(cacheKeys.map((key) => caches.delete(key)));
  }

  const hasController = Boolean(navigator.serviceWorker.controller);
  const hasReloaded = sessionStorage.getItem('vybe-preview-sw-reset') === '1';

  if (hasController && !hasReloaded) {
    sessionStorage.setItem('vybe-preview-sw-reset', '1');
    window.location.reload();
    return true;
  }

  sessionStorage.removeItem('vybe-preview-sw-reset');
  return true;
}
