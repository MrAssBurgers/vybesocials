import { memo, useMemo } from 'react';
import { Megaphone, Sparkles } from 'lucide-react';
import { AdUnit } from './AdUnit';
import { useDNAPreferences } from '@/hooks/useDNAPreferences';

/**
 * A native-looking ad card that blends into the post feed.
 * Uses Google AdSense with DNA-personalized topic hints.
 */

// TODO: Replace with real AdSense slot IDs before re-enabling ads
export const AD_SLOTS = {
  FEED_INLINE: 'TODO_REAL_SLOT_ID',       // Get from AdSense dashboard
  STORY_INTERSTITIAL: 'TODO_REAL_SLOT_ID', // Get from AdSense dashboard
} as const;

/** Returns a deterministic interval for ad spacing based on index. */
const AD_INTERVALS = [5, 7, 6, 8] as const;
export function getAdInterval(index: number): number {
  return AD_INTERVALS[index % AD_INTERVALS.length];
}

export const FeedAdCard = memo(function FeedAdCard() {
  const { data: dnaPrefs } = useDNAPreferences();

  const topicHint = useMemo(() => {
    if (!dnaPrefs?.boost_topics?.length) return null;
    return dnaPrefs.boost_topics.slice(0, 5).join(', ');
  }, [dnaPrefs?.boost_topics]);

  return (
    <div className="relative rounded-2xl overflow-hidden border border-border/50 bg-card/50 backdrop-blur-sm my-2">
      <div className="flex items-center gap-1.5 px-4 pt-3 pb-1">
        <Megaphone className="h-3 w-3 text-muted-foreground" />
        <span className="text-[11px] text-muted-foreground font-medium tracking-wide uppercase">
          Sponsored
        </span>
        {topicHint && (
          <span className="flex items-center gap-0.5 text-[10px] text-primary/60 ml-auto">
            <Sparkles className="h-2.5 w-2.5" />
            Personalized
          </span>
        )}
      </div>

      <div className="px-4 pb-3">
        <AdUnit 
          slot={AD_SLOTS.FEED_INLINE} 
          format="auto" 
          responsive 
          className="min-h-[250px] rounded-lg overflow-hidden"
        />
      </div>
    </div>
  );
});
