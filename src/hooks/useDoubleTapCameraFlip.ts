import { useRef, useCallback } from 'react';

export type CameraTapEvent = {
  stopPropagation?: () => void;
  preventDefault?: () => void;
};

/** Snapchat-style double-tap / double-click to flip front ↔ back camera. */
export function useDoubleTapCameraFlip(onFlip: () => void, windowMs = 320) {
  const lastTapRef = useRef(0);

  const onDoubleTap = useCallback(
    (e?: CameraTapEvent) => {
      const now = Date.now();
      if (now - lastTapRef.current < windowMs) {
        e?.stopPropagation?.();
        e?.preventDefault?.();
        lastTapRef.current = 0;
        onFlip();
        return true;
      }
      lastTapRef.current = now;
      return false;
    },
    [onFlip, windowMs],
  );

  return onDoubleTap;
}
