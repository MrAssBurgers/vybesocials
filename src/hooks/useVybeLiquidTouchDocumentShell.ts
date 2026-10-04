import { useEffect } from 'react';

/** Scope optional touch effects to the active auth or app shell. */
export function useVybeLiquidTouchDocumentShell(active: boolean) {
  useEffect(() => {
    document.documentElement.classList.toggle('vybe-liquid-touch-active', active);
    return () => document.documentElement.classList.remove('vybe-liquid-touch-active');
  }, [active]);
}
