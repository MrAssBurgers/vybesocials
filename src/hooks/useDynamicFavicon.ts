import { useEffect } from 'react';

/**
 * Hook that dynamically updates the favicon to match the user's VYBE theme colors.
 * Reads CSS custom properties (--primary, --accent) and generates an SVG favicon.
 * Deferred to avoid blocking initial render.
 */
export function useDynamicFavicon() {
  useEffect(() => {
    const updateFavicon = () => {
      const root = document.documentElement;
      const computedStyle = getComputedStyle(root);
      
      const primaryHSL = computedStyle.getPropertyValue('--primary').trim();
      const accentHSL = computedStyle.getPropertyValue('--accent').trim();
      const neonPurpleHSL = computedStyle.getPropertyValue('--neon-purple').trim() || primaryHSL;
      const neonCyanHSL = computedStyle.getPropertyValue('--neon-cyan').trim() || accentHSL;
      
      if (!primaryHSL || !accentHSL) return;
      
      const toHSLColor = (hsl: string) => `hsl(${hsl})`;
      
      const svg = `
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="primary-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="${toHSLColor(primaryHSL)}"/>
              <stop offset="50%" stop-color="${toHSLColor(neonPurpleHSL)}"/>
              <stop offset="100%" stop-color="${toHSLColor(primaryHSL)}"/>
            </linearGradient>
            <linearGradient id="accent-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="${toHSLColor(accentHSL)}"/>
              <stop offset="50%" stop-color="${toHSLColor(neonCyanHSL)}"/>
              <stop offset="100%" stop-color="${toHSLColor(accentHSL)}"/>
            </linearGradient>
          </defs>
          <path d="M18 12 L50 88" stroke="url(#primary-grad)" stroke-width="14" stroke-linecap="round"/>
          <path d="M82 12 L50 88" stroke="url(#accent-grad)" stroke-width="14" stroke-linecap="round"/>
          <circle cx="50" cy="88" r="4" fill="white"/>
        </svg>
      `.trim();
      
      const svgDataUrl = `data:image/svg+xml,${encodeURIComponent(svg)}`;
      
      let link = document.querySelector<HTMLLinkElement>('link[rel="icon"][type="image/svg+xml"]');
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        link.type = 'image/svg+xml';
        document.head.appendChild(link);
      }
      link.href = svgDataUrl;
    };
    
    // Defer initial update - not critical for first render
    const initialTimer = setTimeout(updateFavicon, 2000);
    
    // Listen for VYBE theme change events only (no MutationObserver)
    const handleThemeChange = () => {
      setTimeout(updateFavicon, 50);
    };
    
    window.addEventListener('vybeThemeChange', handleThemeChange);
    
    return () => {
      clearTimeout(initialTimer);
      window.removeEventListener('vybeThemeChange', handleThemeChange);
    };
  }, []);
}
