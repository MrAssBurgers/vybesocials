import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Megaphone, Sparkles } from 'lucide-react';
import { useDNAPreferences } from '@/hooks/useDNAPreferences';
import { useAdEligibility } from '@/hooks/useAdEligibility';
import { getAdFeedInterval } from '@/lib/adPreferences';
import { pushInlineFeedAd } from '@/lib/nativeFeedAds';
import type { DNAContentPreferences } from '@/hooks/useDNAPreferences';

export const AD_SLOTS = {
  FEED_INLINE: 'native-advanced',
  STORY_INTERSTITIAL: 'native-interstitial',
} as const;

const BASE_INTERVALS = [5, 7, 6, 8] as const;

export function getAdInterval(index: number, dna?: DNAContentPreferences | null): number {
  const base = BASE_INTERVALS[index % BASE_INTERVALS.length];
  return getAdFeedInterval(base, dna ?? null);
}

/**
 * In-feed native ad slot — renders an inline AdMob unit inside the scroll feed.
 */
export const FeedAdCard = memo(function FeedAdCard() {
  const { showNativeAds, showWebAds, personalizedAds } = useAdEligibility();
  const { data: dnaPrefs } = useDNAPreferences();
  const slotRef = useRef<HTMLDivElement>(null);
  const [adReady, setAdReady] = useState(false);
  const loadAttempted = useRef(false);

  const topicHint = useMemo(() => {
    if (!personalizedAds || !dnaPrefs?.boost_topics?.length) return null;
    return dnaPrefs.boost_topics.slice(0, 3).join(', ');
  }, [dnaPrefs?.boost_topics, personalizedAds]);

  useEffect(() => {
    if (!showNativeAds || loadAttempted.current) return;
    const el = slotRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting || entry.intersectionRatio < 0.2 || loadAttempted.current) return;
        loadAttempted.current = true;
        void pushInlineFeedAd(el).then((ok) => setAdReady(ok));
      },
      { rootMargin: '120px 0px', threshold: [0.2, 0.5] },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [showNativeAds]);

  if (!showNativeAds && !showWebAds) return null;

  return (
    <article
      className="relative rounded-2xl overflow-hidden border border-border/40 bg-card/60 backdrop-blur-md my-3 shadow-sm"
      aria-label="Sponsored content"
    >
      <div className="flex items-center gap-1.5 px-4 pt-3 pb-1">
        <Megaphone className="h-3 w-3 text-muted-foreground/80" />
        <span className="text-[10px] text-muted-foreground font-semibold tracking-widest uppercase">
          Sponsored
        </span>
        {topicHint && (
          <span className="flex items-center gap-0.5 text-[10px] text-primary/60 ml-auto truncate max-w-[140px]">
            <Sparkles className="h-2.5 w-2.5 shrink-0" />
            {topicHint}
          </span>
        )}
      </div>

      <div className="px-3 pb-3 pt-1">
        <div
          ref={slotRef}
          className="min-h-[140px] rounded-xl overflow-hidden bg-gradient-to-br from-muted/30 via-background/50 to-muted/20 border border-border/25"
        >
          {!adReady && (
            <div className="flex flex-col items-center justify-center gap-2 min-h-[140px] px-4 py-6">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Sparkles className="h-4 w-4 text-primary/70" />
              </div>
              <p className="text-[11px] text-muted-foreground text-center leading-relaxed max-w-[220px]">
                {showNativeAds
                  ? 'Relevant picks while you scroll'
                  : 'Sponsored placement'}
              </p>
            </div>
          )}
        </div>
      </div>
    </article>
  );
});
