import { useEffect } from 'react';
import { buildThemedVybeLogoSvg } from '@/lib/vybeLogoAsset';

/** Favicon — themed copy of assets/branding/vybe-logo.svg (geometry unchanged). */
export function useDynamicFavicon() {
  useEffect(() => {
    const updateFavicon = () => {
      const root = document.documentElement;
      const cs = getComputedStyle(root);

      const hsl = (name: string, fallback: string) => {
        const raw = cs.getPropertyValue(name).trim();
        return raw ? `hsl(${raw})` : fallback;
      };

      const svg = buildThemedVybeLogoSvg(
        {
          primary: hsl('--primary', '#7C3DFF'),
          secondary: hsl('--secondary', '#FF3DF2'),
          accent: hsl('--accent', '#18D6FF'),
          glow: hsl('--neon-purple', '#A855F7'),
        },
        0.85,
        'fav',
      );

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
