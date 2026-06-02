import { useEffect } from 'react';
import { useDefaultLiquidBackground } from '@/hooks/useDefaultLiquidBackground';

/** Sync `body.has-liquid-bg` when the default aurora is active. */
export function useLiquidBackgroundShell(active: boolean) {
  useEffect(() => {
    document.body.classList.toggle('has-liquid-bg', active);
    document.documentElement.dataset.liquidBg = active ? 'true' : 'false';
    return () => {
      document.body.classList.remove('has-liquid-bg');
      delete document.documentElement.dataset.liquidBg;
    };
  }, [active]);
}

/** @deprecated Use useDefaultLiquidBackground + useLiquidBackgroundShell separately. */
export function useAppShellLiquidBackground() {
  const show = useDefaultLiquidBackground();
  useLiquidBackgroundShell(show);
  return show;
}
