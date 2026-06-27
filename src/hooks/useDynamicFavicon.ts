import { useEffect } from 'react';
import { buildVybeLogoSvg } from '@/lib/vybeLogoSvg';

/** Favicon — inline SVG from the same markup as VybeLogo. */
export function useDynamicFavicon() {
  useEffect(() => {
    const updateFavicon = () => {
      const root = document.documentElement;
      const cs = getComputedStyle(root);

      const hsl = (name: string, fallback: string) => {
        const raw = cs.getPropertyValue(name).trim();
        return raw ? `hsl(${raw})` : fallback;
      };

      const primary = hsl('--primary', '#f80a7c');
      const secondary = hsl('--secondary', '#a855f7');
      const accent = hsl('--accent', '#06c0fb');
      const deepPrimary = hsl('--neon-purple', '#9333ea');

      const svg = buildVybeLogoSvg({
        leftColor: primary,
        rightColor: secondary,
        leftDeep: deepPrimary,
        rightDeep: accent,
        glowIntensity: 0.7,
        blurScale: 0.5,
        idPrefix: 'fav',
      });

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

    const initialTimer = setTimeout(updateFavicon, 1500);

    const handleThemeChange = () => setTimeout(updateFavicon, 50);

    window.addEventListener('vybeThemeChange', handleThemeChange);
    window.addEventListener('vybeThemeEquipped', handleThemeChange);

    return () => {
      clearTimeout(initialTimer);
      window.removeEventListener('vybeThemeChange', handleThemeChange);
      window.removeEventListener('vybeThemeEquipped', handleThemeChange);
    };
  }, []);
}
