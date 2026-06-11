import { useEffect, useState } from 'react';
import { navVisibility } from '@/lib/navVisibility';
import { subscribeScrollHide } from '@/lib/scrollHideSync';

/**
 * Floating FABs hide on scroll-down and when the bottom nav is fully hidden
 * (keyboard, immersive views). Uses the same scroll listener as BottomNav.
 */
export function useFloatingControlVisibility() {
  const [scrollVisible, setScrollVisible] = useState(true);
  const [navEffective, setNavEffective] = useState(true);

  useEffect(() => {
    const unsubScroll = subscribeScrollHide(setScrollVisible);
    const unsubNav = navVisibility.subscribeEffective(setNavEffective);
    return () => {
      unsubScroll();
      unsubNav();
    };
  }, []);

  return scrollVisible && navEffective;
}
