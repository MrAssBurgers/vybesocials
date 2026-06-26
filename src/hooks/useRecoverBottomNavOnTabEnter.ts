import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { isBottomNavTabRoute } from '@/lib/bottomNavRoutes';
import { navVisibility } from '@/lib/navVisibility';
import type { ProfileNavIdentity } from '@/lib/bottomNavRoutes';

/**
 * Reset scroll-hidden nav only when entering a primary tab from a non-tab route
 * (e.g. back from DM thread) — not on every tab-to-tab switch.
 */
export function useRecoverBottomNavOnTabEnter(profile?: ProfileNavIdentity) {
  const location = useLocation();
  const prevPathRef = useRef(location.pathname);

  useEffect(() => {
    const prev = prevPathRef.current;
    const next = location.pathname;
    prevPathRef.current = next;

    const wasTab = isBottomNavTabRoute(prev, profile);
    const isTab = isBottomNavTabRoute(next, profile);
    if (isTab && !wasTab) {
      navVisibility.forceShow();
      navVisibility.resetScrollHide();
    }
  }, [location.pathname, profile]);
}
