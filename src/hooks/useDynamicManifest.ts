import { useEffect } from 'react';

/**
 * Hook that dynamically updates the PWA manifest to use theme-colored icons.
 * Deferred to avoid blocking initial render.
 */
export function useDynamicManifest() {
  useEffect(() => {
    const updateManifest = () => {
      const root = document.documentElement;
      const computedStyle = getComputedStyle(root);
      
      const primaryHSL = computedStyle.getPropertyValue('--primary').trim();
      const accentHSL = computedStyle.getPropertyValue('--accent').trim();
      
      if (!primaryHSL || !accentHSL) return;
      
      const primaryEncoded = encodeURIComponent(primaryHSL);
      const accentEncoded = encodeURIComponent(accentHSL);
      
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      if (!supabaseUrl) return;
      
      const iconBase = `${supabaseUrl}/functions/v1/generate-pwa-icon`;
      const icon192 = `${iconBase}?size=192&primary=${primaryEncoded}&accent=${accentEncoded}`;
      const icon512 = `${iconBase}?size=512&primary=${primaryEncoded}&accent=${accentEncoded}`;
      const icon192Maskable = `${iconBase}?size=192&primary=${primaryEncoded}&accent=${accentEncoded}&maskable=true`;
      const icon512Maskable = `${iconBase}?size=512&primary=${primaryEncoded}&accent=${accentEncoded}&maskable=true`;
      
      const manifest = {
        name: "VYBE",
        short_name: "VYBE",
        description: "A social app that actually feels alive.",
        start_url: window.location.origin,
        scope: window.location.origin,
        display: "standalone",
        orientation: "portrait",
        background_color: "#0B0B10",
        theme_color: `hsl(${primaryHSL})`,
        lang: "en",
        categories: ["social", "entertainment", "lifestyle"],
        icons: [
          { src: icon192, sizes: "192x192", type: "image/svg+xml", purpose: "any" },
          { src: icon512, sizes: "512x512", type: "image/svg+xml", purpose: "any" },
          { src: icon192Maskable, sizes: "192x192", type: "image/svg+xml", purpose: "maskable" },
          { src: icon512Maskable, sizes: "512x512", type: "image/svg+xml", purpose: "maskable" },
        ],
        shortcuts: [
          { name: "Messages", short_name: "Chat", description: "Open your messages", url: `${window.location.origin}/messages` },
          { name: "Create Post", short_name: "Post", description: "Create a new post", url: `${window.location.origin}/upload` },
          { name: "Explore", short_name: "Explore", description: "Discover new content", url: `${window.location.origin}/explore` },
        ],
        protocol_handlers: [{ protocol: "web+vybe", url: `${window.location.origin}/%s` }],
        prefer_related_applications: false,
      };
      
      const manifestBlob = new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' });
      const manifestUrl = URL.createObjectURL(manifestBlob);
      
      let link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
      if (link) {
        if (link.href.startsWith('blob:')) {
          URL.revokeObjectURL(link.href);
        }
        link.href = manifestUrl;
      }
    };
    
    // Defer - not critical for first render
    const initialTimer = setTimeout(updateManifest, 3000);
    
    // Listen for theme changes only (no MutationObserver)
    const handleThemeChange = () => {
      setTimeout(updateManifest, 100);
    };
    
    window.addEventListener('vybeThemeChange', handleThemeChange);
    
    return () => {
      clearTimeout(initialTimer);
      window.removeEventListener('vybeThemeChange', handleThemeChange);
    };
  }, []);
}
