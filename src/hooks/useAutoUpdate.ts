import { useEffect, useRef } from 'react';
import { isDespiaRuntime } from '@/lib/despiaBridge';
import { isNativePlatform } from '@/lib/capacitor';
import { signalAppUpdate, APP_UPDATE_RELOAD_DELAY_MS } from '@/lib/appUpdateBridge';

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
        // Fetch index.html with cache-busting to check for new version
        const response = await fetch(`/?_=${Date.now()}`, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' }
        });
        
        if (!response.ok) return;

        const html = await response.text();
        
        // Look for the main script tag which changes on each build
        const scriptMatch = html.match(/src="\/assets\/index-([a-zA-Z0-9]+)\.js"/);
        const newVersion = scriptMatch?.[1] || '';
        
        // If we have a stored version and it's different, reload once
        const storedVersion = sessionStorage.getItem('app-version');
        const hasReloaded = sessionStorage.getItem('app-reloaded');
        
        if (storedVersion && newVersion && storedVersion !== newVersion && !hasReloaded) {
          console.log('[AutoUpdate] New version detected, reloading once...', {
            old: storedVersion,
            new: newVersion
          });
          
          sessionStorage.setItem('app-reloaded', 'true');
          sessionStorage.setItem('app-version', newVersion);
          
          signalAppUpdate();

          if ('caches' in window) {
            const cacheNames = await caches.keys();
            await Promise.all(cacheNames.map(name => caches.delete(name)));
          }
          
          window.setTimeout(() => window.location.reload(), APP_UPDATE_RELOAD_DELAY_MS);
          return;
        }
        
        // Store current version and clear reload flag
        if (newVersion) {
          sessionStorage.setItem('app-version', newVersion);
          sessionStorage.removeItem('app-reloaded');
        }
      } catch (error) {
        console.warn('[AutoUpdate] Check failed:', error);
      }
    };

    // Single check after a short delay
    const timeout = setTimeout(checkForUpdates, 3000);

    return () => {
      clearTimeout(timeout);
    };
  }, []);
}
