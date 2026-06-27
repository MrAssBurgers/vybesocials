import { useEffect } from 'react';
import {
  VYBE_LOGO_LEFT_PATH,
  VYBE_LOGO_RIGHT_PATH,
  VYBE_LOGO_VERTEX,
  DEFAULT_VYBE_LOGO_STROKE,
} from '@/lib/vybeLogoGeometry';

/**
 * Hook that dynamically updates the favicon to match the user's VYBE theme colors.
 * Reads CSS custom properties (--primary, --accent, --secondary) and generates an SVG favicon.
 * Deferred to avoid blocking initial render.
 */
export function useDynamicFavicon() {
  useEffect(() => {
    const updateFavicon = () => {
      const root = document.documentElement;
      const computedStyle = getComputedStyle(root);

      const primaryHSL = computedStyle.getPropertyValue('--primary').trim();
      const accentHSL = computedStyle.getPropertyValue('--accent').trim();
      const secondaryHSL =
        computedStyle.getPropertyValue('--secondary').trim() || primaryHSL;

      if (!primaryHSL || !accentHSL) return;

      const toHSLColor = (hsl: string) => `hsl(${hsl})`;

      const svg = `
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="left-grad" x1="22" y1="8" x2="47" y2="92" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stop-color="${toHSLColor(primaryHSL)}"/>
              <stop offset="100%" stop-color="${toHSLColor(secondaryHSL)}"/>
            </linearGradient>
            <linearGradient id="right-grad" x1="78" y1="8" x2="53" y2="92" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stop-color="${toHSLColor(accentHSL)}"/>
              <stop offset="100%" stop-color="${toHSLColor(secondaryHSL)}" stop-opacity="0.88"/>
            </linearGradient>
            <radialGradient id="vertex-grad" cx="${VYBE_LOGO_VERTEX.cx}" cy="${VYBE_LOGO_VERTEX.cy}" r="18" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stop-color="#ffffff" stop-opacity="0.98"/>
              <stop offset="28%" stop-color="${toHSLColor(primaryHSL)}" stop-opacity="0.55"/>
              <stop offset="58%" stop-color="${toHSLColor(accentHSL)}" stop-opacity="0.35"/>
              <stop offset="100%" stop-color="transparent" stop-opacity="0"/>
            </radialGradient>
          </defs>
          <path d="${VYBE_LOGO_LEFT_PATH}" stroke="url(#left-grad)" stroke-width="${DEFAULT_VYBE_LOGO_STROKE}" stroke-linecap="round"/>
          <path d="${VYBE_LOGO_RIGHT_PATH}" stroke="url(#right-grad)" stroke-width="${DEFAULT_VYBE_LOGO_STROKE}" stroke-linecap="round"/>
          <ellipse cx="${VYBE_LOGO_VERTEX.cx}" cy="${VYBE_LOGO_VERTEX.cy}" rx="${VYBE_LOGO_VERTEX.rx}" ry="${VYBE_LOGO_VERTEX.ry}" fill="url(#vertex-grad)"/>
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

    const initialTimer = setTimeout(updateFavicon, 2000);

    const handleThemeChange = () => {
      setTimeout(updateFavicon, 50);
    };

    window.addEventListener('vybeThemeChange', handleThemeChange);
    window.addEventListener('vybeThemeEquipped', handleThemeChange);

    return () => {
      clearTimeout(initialTimer);
      window.removeEventListener('vybeThemeChange', handleThemeChange);
      window.removeEventListener('vybeThemeEquipped', handleThemeChange);
    };
  }, []);
}
