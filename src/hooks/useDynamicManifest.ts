import { useEffect } from 'react';

/**
 * Hook that dynamically updates the PWA manifest to use theme-colored icons.
 * This allows the app icon to match the user's VYBE theme when installed.
 */
export function useDynamicManifest() {
  useEffect(() => {
    const updateManifest = () => {
      // Get computed CSS variables from root element
      const root = document.documentElement;
      const computedStyle = getComputedStyle(root);
      
      // Get HSL values from CSS variables
      const primaryHSL = computedStyle.getPropertyValue('--primary').trim();
      const accentHSL = computedStyle.getPropertyValue('--accent').trim();
      
      // Skip if we don't have valid values yet
      if (!primaryHSL || !accentHSL) return;
      
      // Encode the colors for URL
      const primaryEncoded = encodeURIComponent(primaryHSL);
      const accentEncoded = encodeURIComponent(accentHSL);
      
      // Get the Supabase URL from environment
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      if (!supabaseUrl) return;
      
      // Build icon URLs
      const iconBase = `${supabaseUrl}/functions/v1/generate-pwa-icon`;
      const icon192 = `${iconBase}?size=192&primary=${primaryEncoded}&accent=${accentEncoded}`;
      const icon512 = `${iconBase}?size=512&primary=${primaryEncoded}&accent=${accentEncoded}`;
      const icon192Maskable = `${iconBase}?size=192&primary=${primaryEncoded}&accent=${accentEncoded}&maskable=true`;
      const icon512Maskable = `${iconBase}?size=512&primary=${primaryEncoded}&accent=${accentEncoded}&maskable=true`;
      
      // Create dynamic manifest
      const manifest = {
        name: "VYBE",
        short_name: "VYBE",
        description: "A social app that actually feels alive.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#0B0B10",
        theme_color: `hsl(${primaryHSL})`,
        lang: "en",
        categories: ["social", "entertainment", "lifestyle"],
        icons: [
          {
            src: icon192,
            sizes: "192x192",
            type: "image/svg+xml",
            purpose: "any"
          },
          {
            src: icon512,
            sizes: "512x512",
            type: "image/svg+xml",
            purpose: "any"
          },
          {
            src: icon192Maskable,
            sizes: "192x192",
            type: "image/svg+xml",
            purpose: "maskable"
          },
          {
            src: icon512Maskable,
            sizes: "512x512",
            type: "image/svg+xml",
            purpose: "maskable"
          }
        ],
        shortcuts: [
          {
            name: "Messages",
            short_name: "Chat",
            description: "Open your messages",
            url: "/messages"
          },
          {
            name: "Create Post",
            short_name: "Post",
            description: "Create a new post",
            url: "/upload"
          },
          {
            name: "Explore",
            short_name: "Explore",
            description: "Discover new content",
            url: "/explore"
          }
        ],
        protocol_handlers: [
          {
            protocol: "web+vybe",
            url: "/%s"
          }
        ],
        prefer_related_applications: false
      };
      
      // Convert manifest to data URL
      const manifestBlob = new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' });
      const manifestUrl = URL.createObjectURL(manifestBlob);
      
      // Update or create manifest link element
      let link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
      if (link) {
        // Revoke old blob URL if it was one
        if (link.href.startsWith('blob:')) {
          URL.revokeObjectURL(link.href);
        }
        link.href = manifestUrl;
      }
    };
    
    // Initial update after a brief delay to ensure CSS variables are loaded
    const initialTimer = setTimeout(updateManifest, 200);
    
    // Listen for VYBE theme change events
    const handleThemeChange = () => {
      setTimeout(updateManifest, 100);
    };
    
    window.addEventListener('vybeThemeChange', handleThemeChange);
    
    // Also watch for class changes on root (light/dark mode switches)
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          setTimeout(updateManifest, 100);
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
