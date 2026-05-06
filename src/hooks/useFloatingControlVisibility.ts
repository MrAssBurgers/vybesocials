import { useEffect, useState } from 'react';
import { navVisibility } from '@/lib/navVisibility';

/**
 * Floating FABs (Friend Link, VYBE Designer) follow the bottom nav's
 * effective visibility so they hide and reappear in lockstep with it.
 * Falls back to scroll-based detection if the nav signal isn't available
 * (e.g. on routes without a bottom nav).
 */
export function useFloatingControlVisibility() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    let receivedNavSignal = false;
    const unsubscribe = navVisibility.subscribeEffective((v) => {
      receivedNavSignal = true;
      setVisible(v);
    });

    let lastScrollY = 0;
    let ticking = false;

    const getScrollY = () => {
      const container = document.querySelector('[data-app-scroll-container="true"]');
      return container ? container.scrollTop : window.scrollY;
    };

    const handleScroll = () => {
      if (receivedNavSignal) return; // nav signal wins
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        const currentScrollY = getScrollY();
        const scrollDiff = currentScrollY - lastScrollY;
        if (currentScrollY < 50) setVisible(true);
        else if (Math.abs(scrollDiff) > 10) setVisible(scrollDiff < 0);
        lastScrollY = currentScrollY;
        ticking = false;
      });
    };

    const container = document.querySelector('[data-app-scroll-container="true"]');
    container?.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('scroll', handleScroll, { passive: true });
    lastScrollY = getScrollY();

    return () => {
      unsubscribe();
      window.removeEventListener('scroll', handleScroll);
      container?.removeEventListener('scroll', handleScroll);
    };
  }, []);

  return visible;
}
