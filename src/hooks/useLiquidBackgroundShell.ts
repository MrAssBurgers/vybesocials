import { useEffect } from 'react';
import { STABLE_APP_BACKGROUND } from '@/lib/appBackgroundMode';
import { useDefaultLiquidBackground } from '@/hooks/useDefaultLiquidBackground';

/** Sync document classes for liquid aurora or stable solid background. */
export function useLiquidBackgroundShell(active: boolean) {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;

    if (STABLE_APP_BACKGROUND) {
      html.classList.add('vybe-stable-background');
      html.classList.remove('vybe-aurora-active');
      body.classList.remove('has-liquid-bg');
      delete html.dataset.liquidBg;
      return () => {
        html.classList.remove('vybe-stable-background');
      };
    }

    body.classList.toggle('has-liquid-bg', active);
    html.dataset.liquidBg = active ? 'true' : 'false';
    if (!active) {
      delete html.dataset.liquidBg;
    }
    return () => {
      body.classList.remove('has-liquid-bg');
      delete html.dataset.liquidBg;
    };
  }, [active]);
}

/** @deprecated Use useDefaultLiquidBackground + useLiquidBackgroundShell separately. */
export function useAppShellLiquidBackground() {
  const show = useDefaultLiquidBackground();
  useLiquidBackgroundShell(show);
  return show;
}
