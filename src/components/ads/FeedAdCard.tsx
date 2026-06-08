import { memo, useEffect, useMemo, useRef } from 'react';
import { Megaphone, Sparkles } from 'lucide-react';
import { useDNAPreferences } from '@/hooks/useDNAPreferences';
import { useAdEligibility } from '@/hooks/useAdEligibility';
import { getAdFeedInterval } from '@/lib/adPreferences';
import { showFeedInterstitial } from '@/lib/adDelivery';
import type { DNAContentPreferences } from '@/hooks/useDNAPreferences';

export const AD_SLOTS = {
  FEED_INLINE: 'native-interstitial',
  STORY_INTERSTITIAL: 'native-interstitial',
} as const;

const BASE_INTERVALS = [5, 7, 6, 8] as const;

export function getAdInterval(index: number, dna?: DNAContentPreferences | null): number {
  const base = BASE_INTERVALS[index % BASE_INTERVALS.length];
  return getAdFeedInterval(base, dna ?? null);
}

/**
 * Native feed ad slot — triggers Despia interstitial when scrolled into view.
 * Web falls back to hidden until AdSense is approved.
 */
export const FeedAdCard = memo(function FeedAdCard() {
  const { showNativeAds, showWebAds, personalizedAds } = useAdEligibility();
  const { data: dnaPrefs } = useDNAPreferences();
  const firedRef = useRef(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const topicHint = useMemo(() => {
    if (!personalizedAds || !dnaPrefs?.boost_topics?.length) return null;
    return dnaPrefs.boost_topics.slice(0, 3).join(', ');
  }, [dnaPrefs?.boost_topics, personalizedAds]);

  useEffect(() => {
    if (!showNativeAds || firedRef.current) return;
    const el = cardRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting || entry.intersectionRatio < 0.45 || firedRef.current) return;
        firedRef.current = true;
        showFeedInterstitial();
      },
      { threshold: [0.45, 0.6] },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [showNativeAds]);

  if (!showNativeAds && !showWebAds) return null;

  return (
    <div
      ref={cardRef}
      className="relative rounded-2xl overflow-hidden border border-border/50 bg-card/50 backdrop-blur-sm my-2"
    >
      <div className="flex items-center gap-1.5 px-4 pt-3 pb-1">
        <Megaphone className="h-3 w-3 text-muted-foreground" />
        <span className="text-[11px] text-muted-foreground font-medium tracking-wide uppercase">
          Sponsored
        </span>
        {topicHint && (
          <span className="flex items-center gap-0.5 text-[10px] text-primary/60 ml-auto truncate max-w-[140px]">
            <Sparkles className="h-2.5 w-2.5 shrink-0" />
            {topicHint}
          </span>
        )}
      </div>

      <div className="px-4 pb-4 pt-2">
        <div className="min-h-[120px] rounded-xl bg-gradient-to-br from-primary/10 via-accent/5 to-transparent flex items-center justify-center border border-border/30">
          <p className="text-xs text-muted-foreground text-center px-4">
            {showNativeAds
              ? 'Tap through your feed — relevant ads appear at natural breaks'
              : 'Sponsored content'}
          </p>
        </div>
      </div>
    </div>
  );
});
