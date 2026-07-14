import { useRef, useCallback, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { triggerHaptic } from '@/lib/haptics';
import { isDmConversationPath, leaveDmConversation } from '@/lib/leaveDmConversation';

/** Edge width (px) for iOS-style swipe-back — stays left of the 36px back control. */
export const SWIPE_BACK_EDGE_PX = 16;

/** True when the gesture target should not start swipe-back (chat header / back). */
export function shouldIgnoreSwipeBackTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    Boolean(target.closest('.dm-chat-header, .dm-chat-header-back'))
  );
}

/**
 * iOS-style swipe-right-to-go-back gesture.
 * Only triggers when swiping from the left edge — never when the gesture
 * begins on the DM chat header / back button (those own the leave tap).
 */
export function useSwipeBack(enabled = true) {
  const navigate = useNavigate();
  const location = useLocation();
  const [progress, setProgress] = useState(0);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const isActiveRef = useRef(false);
  const triggeredRef = useRef(false);

  // Don't enable on root-level pages (DM threads under /messages/:id stay swipeable)
  const isRootPage = ['/', '/home', '/explore', '/clips', '/messages', '/profile'].includes(location.pathname);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (!enabled || isRootPage) return;
    if (shouldIgnoreSwipeBackTarget(e.target)) return;
    const touch = e.touches[0];
    if (touch.clientX <= SWIPE_BACK_EDGE_PX) {
      startXRef.current = touch.clientX;
      startYRef.current = touch.clientY;
      isActiveRef.current = true;
      triggeredRef.current = false;
    }
  }, [enabled, isRootPage]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isActiveRef.current) return;
    const touch = e.touches[0];
    const deltaX = touch.clientX - startXRef.current;
    const deltaY = Math.abs(touch.clientY - startYRef.current);

    // Cancel if vertical scroll detected
    if (deltaY > 30 && deltaX < 30) {
      isActiveRef.current = false;
      setProgress(0);
      return;
    }

    if (deltaX > 0) {
      const p = Math.min(deltaX / 200, 1);
      setProgress(p);

      if (p >= 1 && !triggeredRef.current) {
        triggeredRef.current = true;
        triggerHaptic('light');
      }
    }
  }, []);

  const onTouchEnd = useCallback(() => {
    if (!isActiveRef.current) return;

    if (progress >= 0.5) {
      triggerHaptic('medium');
      // Threads always leave via replace so we land on inbox (not a stale history hop).
      if (isDmConversationPath(location.pathname)) {
        leaveDmConversation(navigate);
      } else {
        navigate(-1);
      }
    }

    isActiveRef.current = false;
    setProgress(0);
  }, [progress, navigate, location.pathname]);

  return {
    swipeBackHandlers: enabled && !isRootPage ? { onTouchStart, onTouchMove, onTouchEnd } : {},
    swipeProgress: progress,
    isSwipingBack: isActiveRef.current && progress > 0,
  };
}
