import { useEffect } from 'react';

/**
 * Hook that dynamically updates the favicon to match the user's VYBE theme colors.
 * Reads CSS custom properties (--primary, --accent) and generates an SVG favicon.
 */
export function useDynamicFavicon() {
  useEffect(() => {
    const updateFavicon = () => {
      // Get computed CSS variables from root element
      const root = document.documentElement;
      const computedStyle = getComputedStyle(root);
      
      // Get HSL values from CSS variables
      const primaryHSL = computedStyle.getPropertyValue('--primary').trim();
      const accentHSL = computedStyle.getPropertyValue('--accent').trim();
      const neonPurpleHSL = computedStyle.getPropertyValue('--neon-purple').trim() || primaryHSL;
      const neonCyanHSL = computedStyle.getPropertyValue('--neon-cyan').trim() || accentHSL;
      
      // Skip if we don't have valid values yet
      if (!primaryHSL || !accentHSL) return;
      
      // Convert HSL string to CSS hsl() format
      const toHSLColor = (hsl: string) => `hsl(${hsl})`;
      
      // Generate SVG with theme colors
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
      
      // Convert SVG to data URL
      const svgDataUrl = `data:image/svg+xml,${encodeURIComponent(svg)}`;
      
      // Update or create favicon link element
      let link = document.querySelector<HTMLLinkElement>('link[rel="icon"][type="image/svg+xml"]');
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        link.type = 'image/svg+xml';
        document.head.appendChild(link);
      }
      link.href = svgDataUrl;
    };
    
    // Initial update after a brief delay to ensure CSS variables are loaded
    const initialTimer = setTimeout(updateFavicon, 100);
    
    // Listen for VYBE theme change events (dispatched by applyThemeTokens)
    const handleThemeChange = () => {
      // Small delay to ensure CSS variables have been applied
      setTimeout(updateFavicon, 50);
    };
    
    window.addEventListener('vybeThemeChange', handleThemeChange);
    
    // Also watch for class changes on root (light/dark mode switches)
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          setTimeout(updateFavicon, 50);
          break;
        }
      }
    });
    
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    
    return () => {
      clearTimeout(initialTimer);
      window.removeEventListener('vybeThemeChange', handleThemeChange);
      observer.disconnect();
    };
  }, []);
}
