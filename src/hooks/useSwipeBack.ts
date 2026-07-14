import { useRef, useCallback, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { triggerHaptic } from '@/lib/haptics';
import { isDmConversationPath, leaveDmConversation } from '@/lib/leaveDmConversation';

/**
 * iOS-style swipe-right-to-go-back gesture.
 * Only triggers when swiping from the left 40px edge of the screen.
 * Returns touch handlers and a progress value (0-1) for visual feedback.
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
    const touch = e.touches[0];
    // Only activate from left edge (40px zone)
    if (touch.clientX <= 40) {
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
