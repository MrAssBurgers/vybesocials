import { useRef, useCallback } from 'react';

/** Double-tap / double-click handler to flip front/back camera. */
export function useDoubleTapCameraFlip(onFlip: () => void, windowMs = 280) {
  const lastTapRef = useRef(0);

  const onDoubleTap = useCallback(
    (e?: { stopPropagation?: () => void; preventDefault?: () => void }) => {
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
