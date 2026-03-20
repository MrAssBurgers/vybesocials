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