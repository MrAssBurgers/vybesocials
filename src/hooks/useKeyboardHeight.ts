import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { isDespiaRuntime } from '@/lib/despiaBridge';
import {
  KEYBOARD_INSET_THRESHOLD_PX,
  measureSoftKeyboardHeight,
  shouldTrackSoftKeyboard,
} from '@/lib/keyboardInsets';

/**
 * Tracks soft-keyboard height as `--kb-h` on mobile / Despia only (DM, AI, community).
 * Listeners stay attached for the app lifetime so a late switch into a mobile shell
 * (DevTools device mode, rotate, resize) still publishes keyboard insets.
 */
export function useKeyboardHeight() {
  useEffect(() => {
    const root = document.documentElement;
    const cleanups: Array<() => void> = [];

    const applyKeyboardHeight = (kb: number) => {
      if (!shouldTrackSoftKeyboard()) {
        root.style.setProperty('--kb-h', '0px');
        delete document.body.dataset.kbOpen;
        return;
      }
      const height = kb > KEYBOARD_INSET_THRESHOLD_PX ? kb : 0;
      root.style.setProperty('--kb-h', `${height}px`);
      if (height > 0) document.body.dataset.kbOpen = 'true';
      else delete document.body.dataset.kbOpen;
    };

    const refresh = () => applyKeyboardHeight(measureSoftKeyboardHeight());

    const attachVisualViewport = () => {
      const vv = window.visualViewport;
      if (!vv) return;
      vv.addEventListener('resize', refresh);
      vv.addEventListener('scroll', refresh);
      cleanups.push(() => {
        vv.removeEventListener('resize', refresh);
        vv.removeEventListener('scroll', refresh);
      });
    };

    if (isDespiaRuntime() || !Capacitor.isNativePlatform()) {
      attachVisualViewport();
      window.addEventListener('resize', refresh);
      cleanups.push(() => window.removeEventListener('resize', refresh));
      refresh();
    } else {
      import('@capacitor/keyboard')
        .then(({ Keyboard }) => {
          const showHandle = Keyboard.addListener('keyboardWillShow', (info) => {
            applyKeyboardHeight(info.keyboardHeight);
          });
          const hideHandle = Keyboard.addListener('keyboardWillHide', () => {
            applyKeyboardHeight(0);
          });
          cleanups.push(() => {
            showHandle.then((h) => h.remove());
            hideHandle.then((h) => h.remove());
          });
        })
        .catch(() => {
          attachVisualViewport();
          window.addEventListener('resize', refresh);
          cleanups.push(() => window.removeEventListener('resize', refresh));
          refresh();
        });
    }

    return () => {
      cleanups.forEach((fn) => fn());
      root.style.setProperty('--kb-h', '0px');
      delete document.body.dataset.kbOpen;
    };
  }, []);
}
