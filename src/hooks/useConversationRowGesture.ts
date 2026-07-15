import { useCallback, useEffect, useRef, useState } from 'react';
import { triggerHaptic } from '@/lib/haptics';
import { isIOSAppShell } from '@/lib/despiaBridge';
import {
  classifyConversationGestureMove,
  HOLD_CANCEL_PX,
  HOLD_MS,
  SWIPE_ACTIVATE_PX,
  TAP_SLOP_PX,
} from '@/lib/dmLongPressGesture';

/** iOS WKWebView injects extra dy during document bounce — widen tap recognition. */
const IOS_TAP_SLOP_PX = 28;

type GestureState = 'idle' | 'pending' | 'holding' | 'swiping' | 'scrolling';

export interface UseConversationRowGestureOptions {
  disabled?: boolean;
  onTap: () => void;
  onWarm?: () => void;
  onHold: () => void;
  onSwipeStart?: () => void;
  onSwipeMove?: (dx: number) => void;
  onSwipeEnd?: () => void;
  isTrayOpen?: () => boolean;
  onCloseTray?: () => void;
}

export function useConversationRowGesture({
  disabled = false,
  onTap,
  onWarm,
  onHold,
  onSwipeStart,
  onSwipeMove,
  onSwipeEnd,
  isTrayOpen,
  onCloseTray,
}: UseConversationRowGestureOptions) {
  const stateRef = useRef<GestureState>('idle');
  const startRef = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPressRef = useRef(false);
  const gestureConsumedRef = useRef(false);
  const [isSwiping, setIsSwiping] = useState(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const resetGesture = useCallback(() => {
    clearTimer();
    stateRef.current = 'idle';
    startRef.current = null;
    gestureConsumedRef.current = false;
    setIsSwiping(false);
  }, [clearTimer]);

  const handleDocumentPointerMove = useCallback(
    (e: PointerEvent) => {
      const start = startRef.current;
      if (!start || e.pointerId !== start.pointerId || disabled) return;

      const state = stateRef.current;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;

      if (state === 'holding' || state === 'scrolling') return;

      if (state === 'pending') {
        const intent = classifyConversationGestureMove(dx, dy, HOLD_CANCEL_PX, SWIPE_ACTIVATE_PX);
        if (intent === 'scrolling') {
          clearTimer();
          stateRef.current = 'scrolling';
          return;
        }
        if (intent === 'swiping') {
          clearTimer();
          stateRef.current = 'swiping';
          gestureConsumedRef.current = true;
          setIsSwiping(true);
          onSwipeStart?.();
        }
        if (Math.abs(dx) > HOLD_CANCEL_PX || Math.abs(dy) > HOLD_CANCEL_PX) {
          clearTimer();
        }
        return;
      }

      if (state === 'swiping') {
        onSwipeMove?.(dx);
      }
    },
    [clearTimer, disabled, onSwipeMove, onSwipeStart],
  );

  const handleDocumentPointerUp = useCallback(
    (e: PointerEvent) => {
      const start = startRef.current;
      if (!start || e.pointerId !== start.pointerId) return;

      const state = stateRef.current;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      const tapSlop = isIOSAppShell() ? IOS_TAP_SLOP_PX : TAP_SLOP_PX;
      const isTap =
        !gestureConsumedRef.current &&
        !didLongPressRef.current &&
        absDx <= tapSlop &&
        absDy <= tapSlop;

      if (state === 'swiping') {
        onSwipeEnd?.();
      } else if (state !== 'holding' && isTap) {
        if (isTrayOpen?.()) {
          onCloseTray?.();
        } else {
          onWarm?.();
          onTap();
        }
      }

      resetGesture();
    },
    [isTrayOpen, onCloseTray, onSwipeEnd, onTap, onWarm, resetGesture],
  );

  useEffect(() => {
    document.addEventListener('pointermove', handleDocumentPointerMove);
    document.addEventListener('pointerup', handleDocumentPointerUp);
    document.addEventListener('pointercancel', resetGesture);
    return () => {
      document.removeEventListener('pointermove', handleDocumentPointerMove);
      document.removeEventListener('pointerup', handleDocumentPointerUp);
      document.removeEventListener('pointercancel', resetGesture);
    };
  }, [handleDocumentPointerMove, handleDocumentPointerUp, resetGesture]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (disabled || e.button !== 0) return;
      didLongPressRef.current = false;
      startRef.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
      stateRef.current = 'pending';
      gestureConsumedRef.current = false;
      clearTimer();
      timerRef.current = setTimeout(() => {
        if (stateRef.current !== 'pending') return;
        stateRef.current = 'holding';
        didLongPressRef.current = true;
        gestureConsumedRef.current = true;
        triggerHaptic('light');
        onHold();
      }, HOLD_MS);
    },
    [clearTimer, disabled, onHold],
  );

  const handleClickCapture = useCallback((e: React.MouseEvent) => {
    if (!didLongPressRef.current && !gestureConsumedRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    didLongPressRef.current = false;
    gestureConsumedRef.current = false;
  }, []);

  const openFromKeyboard = useCallback(() => {
    triggerHaptic('light');
    onHold();
  }, [onHold]);

  return {
    handlePointerDown,
    handleClickCapture,
    openFromKeyboard,
    isSwiping,
    didLongPressRef,
  };
}
