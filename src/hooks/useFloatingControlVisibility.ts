import { useEffect, useState } from 'react';

export function useFloatingControlVisibility() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    let lastScrollY = 0;
    let ticking = false;

    const getScrollY = () => {
      const container = document.querySelector('[data-app-scroll-container="true"]');
      return container ? container.scrollTop : window.scrollY;
    };

    const handleScroll = () => {
      if (ticking) return;
      ticking = true;

      window.requestAnimationFrame(() => {
        const currentScrollY = getScrollY();
        const scrollDiff = currentScrollY - lastScrollY;

        if (currentScrollY < 50) {
          setVisible(true);
        } else if (Math.abs(scrollDiff) > 10) {
          setVisible(scrollDiff < 0);
        }

        lastScrollY = currentScrollY;
        ticking = false;
      });
    };

    const bindContainer = () => {
      const container = document.querySelector('[data-app-scroll-container="true"]');
      container?.addEventListener('scroll', handleScroll, { passive: true });
      return container;
    };

    const container = bindContainer();
    window.addEventListener('scroll', handleScroll, { passive: true });
    lastScrollY = getScrollY();

    return () => {
      window.removeEventListener('scroll', handleScroll);
      container?.removeEventListener('scroll', handleScroll);
    };
  }, []);

  return visible;
}