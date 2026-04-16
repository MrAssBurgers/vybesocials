import { memo } from 'react';

/**
 * Google AdSense unit renderer.
 * Publisher: ca-pub-9952523729646293
 * 
 * DISABLED: Returns null until AdSense approval is granted and real slot IDs are configured.
 * To re-enable, remove the early return and restore the AdSense script in index.html.
 */

interface AdUnitProps {
  slot: string;
  format?: 'auto' | 'rectangle' | 'horizontal' | 'vertical';
  responsive?: boolean;
  className?: string;
}

export const AdUnit = memo(function AdUnit(_props: AdUnitProps) {
  // AdSense disabled — see useShowAds.ts ADS_ENABLED flag
  return null;
});
