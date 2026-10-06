import { clearAppCache } from './selfHealingMonitor';

/** Retire only Vybe's root worker; preserve push/other apps and offline media. */
export async function clearOwnedAppFiles(): Promise<void> {
  if (navigator.onLine === false) return;
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.filter(registration => {
        try {
          const script = new URL(registration.active?.scriptURL || registration.waiting?.scriptURL || registration.installing?.scriptURL || '');
          const scope = new URL(registration.scope);
          return script.origin === window.location.origin && script.pathname === '/sw.js' && scope.origin === script.origin && scope.pathname === '/';
        } catch { return false; }
      }).map(registration => registration.unregister()));
    }
  } catch { /* File recovery must still work if worker inspection fails. */ }
  await clearAppCache();
}
