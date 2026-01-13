import { useEffect, useRef } from 'react';

const BUILD_VERSION = import.meta.env.VITE_BUILD_TIME || Date.now().toString();
const CHECK_INTERVAL = 30000; // Check every 30 seconds

export function useAutoUpdate() {
  const currentVersion = useRef(BUILD_VERSION);
  const checkingRef = useRef(false);

  useEffect(() => {
    // Only run in production
    if (import.meta.env.DEV) return;

    const checkForUpdates = async () => {
      if (checkingRef.current) return;
      checkingRef.current = true;

      try {
        // Fetch index.html with cache-busting to check for new version
        const response = await fetch(`/?_=${Date.now()}`, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' }
        });
        
        if (!response.ok) {
          checkingRef.current = false;
          return;
        }

        const html = await response.text();
        
        // Look for the main script tag which changes on each build
        const scriptMatch = html.match(/src="\/assets\/index-([a-zA-Z0-9]+)\.js"/);
        const newVersion = scriptMatch?.[1] || '';
        
        // If we have a stored version and it's different, reload
        const storedVersion = sessionStorage.getItem('app-version');
        
        if (storedVersion && newVersion && storedVersion !== newVersion) {
          console.log('[AutoUpdate] New version detected, reloading...', {
            old: storedVersion,
            new: newVersion
          });
          
          // Clear cache and reload
          if ('caches' in window) {
            const cacheNames = await caches.keys();
            await Promise.all(cacheNames.map(name => caches.delete(name)));
          }
          
          window.location.reload();
          return;
        }
        
        // Store current version
        if (newVersion) {
          sessionStorage.setItem('app-version', newVersion);
        }
      } catch (error) {
        console.warn('[AutoUpdate] Check failed:', error);
      } finally {
        checkingRef.current = false;
      }
    };

    // Initial check after a delay
    const initialTimeout = setTimeout(checkForUpdates, 5000);
    
    // Periodic checks
    const interval = setInterval(checkForUpdates, CHECK_INTERVAL);

    // Check on visibility change (when user returns to tab)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkForUpdates();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);
}
