import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { logStartupPhase } from '@/lib/startupTiming';

/**
 * One-shot route paint markers for startup profiling (Xcode / Safari console).
 */
export function StartupRouteProbe() {
  const { pathname } = useLocation();

  useEffect(() => {
    logStartupPhase('Navigation ready', { pathname });
  }, []);

  useEffect(() => {
    if (pathname === '/home' || pathname === '/' || pathname.startsWith('/home')) {
      logStartupPhase('Home rendered', { pathname });
    }
  }, [pathname]);

  return null;
}
