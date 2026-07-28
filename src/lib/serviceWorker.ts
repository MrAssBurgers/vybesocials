import { isDespiaRuntime } from '@/lib/despiaBridge';
import { signalAppUpdate, APP_UPDATE_RELOAD_DELAY_MS } from '@/lib/appUpdateBridge';

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
    if (!worker) return;
    signalAppUpdate();
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
    if (reloadingForUpdate || !hadController) return;
    // Prevent A→B→A restart loops when another SW (e.g. messaging) also claims.
    if (sessionStorage.getItem(RELOAD_ONCE_KEY) === '1') return;
    reloadingForUpdate = true;
    sessionStorage.setItem(RELOAD_ONCE_KEY, '1');
    // Let the fullscreen overlay paint before refresh (avoids half-screen tear).
    setTimeout(() => {
      window.location.replace(`/?_vybe=${Date.now()}`);
    }, APP_UPDATE_RELOAD_DELAY_MS);
  });

  // After a successful controlled reload, clear the once-guard so future deploys can update.
  if (registration.active && !registration.waiting && sessionStorage.getItem(RELOAD_ONCE_KEY) === '1') {
    // Delay clear slightly so a same-tick controllerchange from messaging can't loop.
    window.setTimeout(() => {
      if (!registration.waiting) sessionStorage.removeItem(RELOAD_ONCE_KEY);
    }, 4_000);
  }
}

function logRegistrationOnce(scope: string) {
  if (loggedRegistration) return;
  loggedRegistration = true;
  if (import.meta.env.DEV) {
    console.log('[VYBE] Service worker registered:', scope);
  }
}

/** Single shared registration — safe to call from main.tsx and push hooks. */
export async function registerVybeServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!shouldRegisterServiceWorker()) return null;

  if (!registrationPromise) {
    registrationPromise = (async () => {
      try {
        // Drop legacy messaging SW that claimed "/" and fought /sw.js updates.
        const all = await navigator.serviceWorker.getRegistrations();
        await Promise.all(
          all
            .filter((reg) => {
              const script = reg.active?.scriptURL || reg.waiting?.scriptURL || reg.installing?.scriptURL || '';
              return script.includes('firebase-messaging-sw.js') && reg.scope.endsWith('/');
            })
            .map((reg) => reg.unregister()),
        );

        const existing = await navigator.serviceWorker.getRegistration('/');
        if (existing?.active?.scriptURL?.includes('/sw.js')) {
          logRegistrationOnce(existing.scope);
          wireUpdateFlow(existing);
          void existing.update().catch(() => {});
          return existing;
        }

        const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        logRegistrationOnce(registration.scope);
        wireUpdateFlow(registration);

        if (!updateIntervalStarted) {
          updateIntervalStarted = true;
          setInterval(() => {
            registration.update().catch(() => {});
          }, 60 * 60 * 1000);
        }

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
