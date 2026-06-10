import { isDespiaRuntime } from '@/lib/despiaBridge';

const PREVIEW_HOST_TOKENS = ['preview'];

export function isPreviewServiceWorkerDisabled() {
  if (typeof window === 'undefined') return false;

  const { hostname, search } = window.location;
  const params = new URLSearchParams(search);

  return (
    PREVIEW_HOST_TOKENS.some((token) => hostname.includes(token)) ||
    hostname.endsWith('.lovableproject.com') ||
    params.has('__lovable_token')
  );
}

export function isLocalDevHost(): boolean {
  if (typeof window === 'undefined') return false;
  const { hostname } = window.location;
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

/**
 * Register the VYBE service worker on production HTTPS and local dev.
 * Skips Despia localhost shells (despia-local mode) and Lovable preview hosts.
 */
export function shouldRegisterServiceWorker(): boolean {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return false;
  if (isPreviewServiceWorkerDisabled()) return false;

  const { hostname } = window.location;

  // Despia on-device HTTP server — SW would fight localhost caching.
  if (isDespiaRuntime() && (hostname === 'localhost' || hostname === '127.0.0.1')) {
    return false;
  }

  // Production PWA: browser install + Despia URL mode loading vybehub.app.
  if (hostname === 'vybehub.app' || hostname === 'www.vybehub.app') {
    return true;
  }

  // Local Vite dev — no service worker (avoids stale cache fighting HMR; prod uses SW on vybehub.app).
  if (import.meta.env.DEV && (hostname === 'localhost' || hostname === '127.0.0.1')) {
    return false;
  }

  return false;
}

export async function registerVybeServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!shouldRegisterServiceWorker()) return null;

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    console.log('[VYBE] Service worker registered:', registration.scope);

    setInterval(() => {
      registration.update().catch(() => {});
    }, 60 * 60 * 1000);

    return registration;
  } catch (error) {
    console.error('[VYBE] Service worker registration failed:', error);
    return null;
  }
}

export async function cleanupPreviewServiceWorkers() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return false;
  }

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
