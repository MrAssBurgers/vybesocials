import { useEffect, useRef, memo } from 'react';

/**
 * Google AdSense unit renderer.
 * Publisher: ca-pub-9952523729646293
 * Script loaded globally in index.html.
 */

const ADSENSE_PUBLISHER_ID = 'ca-pub-9952523729646293';

interface AdUnitProps {
  /** AdSense ad slot ID */
  slot: string;
  /** Ad format: auto, rectangle, horizontal, vertical */
  format?: 'auto' | 'rectangle' | 'horizontal' | 'vertical';
  /** Responsive sizing */
  responsive?: boolean;
  className?: string;
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
    // Push the ad once the component mounts and has non-zero width
    if (!pushed.current && adRef.current) {
      const el = adRef.current;
      const tryPush = () => {
        if (el.offsetWidth > 0) {
          try {
            ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
            pushed.current = true;
          } catch {
            // AdSense not ready yet
          }
        } else {
          // Retry after layout settles
          requestAnimationFrame(tryPush);
        }
      };
      requestAnimationFrame(tryPush);
    }
  }, []);

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
