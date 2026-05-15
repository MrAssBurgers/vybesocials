import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';

/**
 * Tracks the on-screen keyboard height and exposes it as the CSS variable
 * `--kb-h` on <html>. Use it in CSS like:
 *
 *   .composer { padding-bottom: calc(env(safe-area-inset-bottom) + var(--kb-h, 0px)); }
 *
 * Smooth-scrolls into the new layout via Framer Motion / CSS transitions
 * on the consuming element.
 *
 * On iOS the visualViewport API already gives us this; on Android the
 * Capacitor Keyboard plugin events are far more reliable.
 */
export function useKeyboardHeight() {
  useEffect(() => {
    const root = document.documentElement;
    let cleanup: (() => void) | null = null;

    if (Capacitor.isNativePlatform()) {
      // Lazy-load so the plugin isn't required in non-native builds
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
          cleanup = () => {
            showHandle.then((h) => h.remove());
            hideHandle.then((h) => h.remove());
          };
        })
        .catch(() => {
          // Plugin not installed yet — fall through to visualViewport path
          attachVisualViewport();
        });
    } else {
      attachVisualViewport();
    }

    function attachVisualViewport() {
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
      cleanup = () => {
        vv.removeEventListener('resize', onResize);
        vv.removeEventListener('scroll', onResize);
      };
    }

    return () => {
      cleanup?.();
      root.style.setProperty('--kb-h', '0px');
      delete document.body.dataset.kbOpen;
    };
  }, []);
}
