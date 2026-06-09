import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { isDespiaRuntime } from '@/lib/despiaBridge';

/**
 * Tracks the on-screen keyboard height and exposes it as the CSS variable
 * `--kb-h` on <html>. Use it in CSS like:
 *
 *   .composer { padding-bottom: calc(env(safe-area-inset-bottom) + var(--kb-h, 0px)); }
 */
export function useKeyboardHeight() {
  useEffect(() => {
    const root = document.documentElement;
    const cleanups: Array<() => void> = [];

    const attachVisualViewport = () => {
      const vv = window.visualViewport;
      if (!vv) return;
      const onResize = () => {
        const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
        root.style.setProperty('--kb-h', `${kb}px`);
        if (kb > 0) document.body.dataset.kbOpen = 'true';
        else delete document.body.dataset.kbOpen;
      };
      vv.addEventListener('resize', onResize);
      vv.addEventListener('scroll', onResize);
      onResize();
      cleanups.push(() => {
        vv.removeEventListener('resize', onResize);
        vv.removeEventListener('scroll', onResize);
      });
    };

    if (isDespiaRuntime() || !Capacitor.isNativePlatform()) {
      attachVisualViewport();
    } else {
      import('@capacitor/keyboard')
        .then(({ Keyboard }) => {
          const showHandle = Keyboard.addListener('keyboardWillShow', (info) => {
            root.style.setProperty('--kb-h', `${info.keyboardHeight}px`);
            document.body.dataset.kbOpen = 'true';
          });
          const hideHandle = Keyboard.addListener('keyboardWillHide', () => {
            root.style.setProperty('--kb-h', '0px');
            delete document.body.dataset.kbOpen;
          });
          cleanups.push(() => {
            showHandle.then((h) => h.remove());
            hideHandle.then((h) => h.remove());
          });
        })
        .catch(() => {
          attachVisualViewport();
        });
    }

    return () => {
      cleanups.forEach((fn) => fn());
      root.style.setProperty('--kb-h', '0px');
      delete document.body.dataset.kbOpen;
    };
  }, []);
}
