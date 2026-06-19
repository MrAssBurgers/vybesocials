import { ensureAppShellVisible } from '@/lib/attResumeRecovery';
import { hideStaticBootSplash } from '@/lib/splashProgressBridge';

const APP_READY_ATTR = 'data-vybe-app-ready';

/** Remove boot/splash overlays only — not route loaders (VybePageLoader). */
export function teardownAllSplashLayers(): void {
  hideStaticBootSplash();

  document.querySelectorAll('#vybe-static-boot, #vybe-react-splash, [data-vybe-splash-overlay]').forEach((el) => {
    el.remove();
  });

  document.body.classList.remove('splash-visible');
  document.body.style.overflow = '';
  document.documentElement.style.overflow = '';
  ensureAppShellVisible();
}

export function markAppReady(): void {
  document.documentElement.setAttribute(APP_READY_ATTR, 'true');
}
