import { useEffect, useRef, useCallback } from 'react';
import { useRecordInteraction } from '@/hooks/useFeedAlgorithm';

/**
 * Tracks when a post is 50%+ visible for 1.5s+ and fires a 'view' interaction.
 * Also tracks cumulative dwell time as 'watch_time'.
 */
export function useViewTracking(postId: string) {
  const recordInteraction = useRecordInteraction();
  const hasRecordedView = useRef(false);
  const enterTime = useRef<number | null>(null);
  const dwellTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const totalDwell = useRef(0);

  const handleIntersect = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const entry = entries[0];
      if (entry.isIntersecting) {
        enterTime.current = Date.now();
        if (!hasRecordedView.current) {
          dwellTimer.current = setTimeout(() => {
            hasRecordedView.current = true;
            recordInteraction.mutate({ postId, interactionType: 'view' });
          }, 1500);
        }
      } else {
        if (dwellTimer.current) {
          clearTimeout(dwellTimer.current);
          dwellTimer.current = null;
        }
        if (enterTime.current) {
          totalDwell.current += (Date.now() - enterTime.current) / 1000;
          enterTime.current = null;
        }
      }
    },
    [postId, recordInteraction],
  );

  const ref = useCallback(
    (node: HTMLElement | null) => {
      if (!node) return;
      const observer = new IntersectionObserver(handleIntersect, { threshold: 0.5 });
      observer.observe(node);
      // Cleanup via effect below isn't needed—observer is per-mount
      return () => observer.disconnect();
    },
    [handleIntersect],
  );

  // On unmount, flush dwell time
  useEffect(() => {
    return () => {
      if (enterTime.current) {
        totalDwell.current += (Date.now() - enterTime.current) / 1000;
      }
      if (totalDwell.current > 2) {
        recordInteraction.mutate({
          postId,
          interactionType: 'watch_time',
          durationSeconds: Math.round(totalDwell.current),
        });
      }
      if (dwellTimer.current) clearTimeout(dwellTimer.current);
    };
  }, [postId]); // eslint-disable-line react-hooks/exhaustive-deps

  return ref;
}
