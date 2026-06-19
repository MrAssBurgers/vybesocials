import { isDespiaRuntime } from '@/lib/despiaBridge';

export function isPreviewServiceWorkerDisabled() {
  return false;
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

  // Production + Lovable preview admin mirror of vybehub.app.
  if (
    hostname === 'vybehub.app' ||
    hostname === 'www.vybehub.app' ||
    hostname.endsWith('.lovableproject.com') ||
    hostname.endsWith('.lovable.app')
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
        const existing = await navigator.serviceWorker.getRegistration('/');
        if (existing) {
          logRegistrationOnce(existing.scope);
          return existing;
        }

        const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        logRegistrationOnce(registration.scope);

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
