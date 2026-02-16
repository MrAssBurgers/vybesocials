import { memo } from 'react';
import { Megaphone } from 'lucide-react';
import { AdUnit } from './AdUnit';

/**
 * A native-looking ad card that blends into the post feed.
 * Uses Google AdSense with a "Sponsored" label for transparency.
 */

// Ad slots for different placements
export const AD_SLOTS = {
  FEED_INLINE: 'XXXXXXX', // TODO: Replace with real slot ID
  STORY_INTERSTITIAL: 'XXXXXXX', // TODO: Replace with real slot ID
} as const;

export const FeedAdCard = memo(function FeedAdCard() {
  return (
    <div className="relative rounded-2xl overflow-hidden border border-border/50 bg-card/50 backdrop-blur-sm">
      {/* Sponsored label */}
      <div className="flex items-center gap-1.5 px-4 pt-3 pb-1">
        <Megaphone className="h-3 w-3 text-muted-foreground" />
        <span className="text-[11px] text-muted-foreground font-medium tracking-wide uppercase">
          Sponsored
        </span>
      </div>
      
      {/* Ad content */}
      <div className="px-4 pb-3">
        <AdUnit 
          slot={AD_SLOTS.FEED_INLINE} 
          format="rectangle" 
          responsive 
          className="min-h-[250px] rounded-lg overflow-hidden"
        />
      </div>
    </div>
  );
});
