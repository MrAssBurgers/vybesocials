import { useEffect } from 'react';

/** Sync html class so touch FX CSS beats reduce-motion / perf-low on auth + app routes. */
export function useVybeLiquidTouchDocumentShell(active: boolean) {
  useEffect(() => {
    document.documentElement.classList.toggle('vybe-liquid-touch-active', active);
    return () => document.documentElement.classList.remove('vybe-liquid-touch-active');
  }, [active]);
}
