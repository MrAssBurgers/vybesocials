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
 */
export function useKeyboardHeight() {
  useEffect(() => {
    if (!shouldTrackSoftKeyboard()) return;

    const root = document.documentElement;
    const cleanups: Array<() => void> = [];

    const applyKeyboardHeight = (kb: number) => {
      const height = kb > KEYBOARD_INSET_THRESHOLD_PX ? kb : 0;
      root.style.setProperty('--kb-h', `${height}px`);
      if (height > 0) document.body.dataset.kbOpen = 'true';
      else delete document.body.dataset.kbOpen;
    };

    const attachVisualViewport = () => {
      const vv = window.visualViewport;
      if (!vv) return;
      const onResize = () => applyKeyboardHeight(measureSoftKeyboardHeight());
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
        });
    }

    return () => {
      cleanups.forEach((fn) => fn());
      root.style.setProperty('--kb-h', '0px');
      delete document.body.dataset.kbOpen;
    };
  }, []);
}
