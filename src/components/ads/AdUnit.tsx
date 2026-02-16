import { useEffect, useRef, memo } from 'react';

/**
 * Google AdSense unit renderer.
 * 
 * Replace ADSENSE_PUBLISHER_ID and slot IDs once your AdSense account is approved.
 * Docs: https://support.google.com/adsense/answer/9274025
 */

// TODO: Replace with your actual AdSense publisher ID (ca-pub-XXXXXXXXXXXXXXXX)
const ADSENSE_PUBLISHER_ID = '';

interface AdUnitProps {
  /** AdSense ad slot ID */
  slot: string;
  /** Ad format: auto, rectangle, horizontal, vertical */
  format?: 'auto' | 'rectangle' | 'horizontal' | 'vertical';
  /** Responsive sizing */
  responsive?: boolean;
  className?: string;
}

// Track if AdSense script has been loaded
let adsenseLoaded = false;

function loadAdSenseScript() {
  if (adsenseLoaded || !ADSENSE_PUBLISHER_ID) return;

  const script = document.createElement('script');
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_PUBLISHER_ID}`;
  script.async = true;
  script.crossOrigin = 'anonymous';
  document.head.appendChild(script);
  adsenseLoaded = true;
}

export const AdUnit = memo(function AdUnit({ 
  slot, 
  format = 'auto', 
  responsive = true,
  className = '' 
}: AdUnitProps) {
  const adRef = useRef<HTMLModElement>(null);
  const pushed = useRef(false);

  useEffect(() => {
    loadAdSenseScript();

    // Push the ad once the component mounts
    if (!pushed.current && ADSENSE_PUBLISHER_ID) {
      try {
        ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
        pushed.current = true;
      } catch {
        // AdSense not ready yet
      }
    }
  }, []);

  // If no publisher ID is set, show a placeholder in dev mode
  if (!ADSENSE_PUBLISHER_ID) {
    if (import.meta.env.DEV) {
      return (
        <div className={`bg-muted/30 border border-dashed border-muted-foreground/20 rounded-xl p-4 text-center ${className}`}>
          <p className="text-xs text-muted-foreground">Ad Placeholder — Set ADSENSE_PUBLISHER_ID</p>
        </div>
      );
    }
    return null;
  }

  return (
    <ins
      ref={adRef}
      className={`adsbygoogle ${className}`}
      style={{ display: 'block' }}
      data-ad-client={ADSENSE_PUBLISHER_ID}
      data-ad-slot={slot}
      data-ad-format={format}
      data-full-width-responsive={responsive ? 'true' : 'false'}
    />
  );
});
