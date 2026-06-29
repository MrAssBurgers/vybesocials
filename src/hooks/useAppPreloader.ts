import { useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { batchSignUrls } from '@/lib/signedUrlCache';
import { warmHomeCaches, warmHomeCachesForProfile } from '@/lib/warmHomeCaches';
import { isPersistRestored, markPersistRestored, onPersistRestored } from '@/lib/persistRestoreGate';
import { preloadCriticalRoutes, preloadSecondaryRoutes } from '@/lib/routePreloader';
import { isNativePerfMode } from '@/lib/nativePerfMode';
import { isSetupRoutePath } from '@/lib/splashSession';
import { publishSplashProgress } from '@/lib/splashProgressBridge';
import { kickstartThemeHydration, prefetchAndApplyUserTheme } from '@/lib/themeHydration';

interface PreloadStatus {
  step: string;
  progress: number;
  isComplete: boolean;
}

// Weighted preload steps — progress is computed from cumulative weights
const PRELOAD_STEPS = [
  { key: 'init', label: 'Waking up...', weight: 5 },
  { key: 'auth', label: 'Checking session...', weight: 10 },
  { key: 'profile', label: 'Loading profile...', weight: 10 },
  { key: 'feed', label: 'Getting your feed...', weight: 25 },
  { key: 'clips', label: 'Loading clips...', weight: 20 },
  { key: 'social', label: 'Syncing social...', weight: 20 },
  { key: 'final', label: 'Final touches...', weight: 5 },
  { key: 'ready', label: 'Let\'s go! ✨', weight: 5 },
];

const TOTAL_WEIGHT = PRELOAD_STEPS.reduce((s, step) => s + step.weight, 0);

export function useAppPreloader() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<PreloadStatus>({
    step: 'Waking up...',
    progress: 0,
    isComplete: false,
  });
  const hasStarted = useRef(false);
  const currentProgress = useRef(0);
  const animFrameRef = useRef<number>(0);
  const [restoreReady, setRestoreReady] = useState(isPersistRestored);

  useEffect(() => onPersistRestored(() => setRestoreReady(true)), []);

  // Never block cold start if IndexedDB restore is slow or unavailable (private mode).
  useEffect(() => {
    if (restoreReady) return;
    const t = setTimeout(() => {
      markPersistRestored();
      setRestoreReady(true);
    }, isNativePerfMode() ? 80 : 40);
    return () => clearTimeout(t);
  }, [restoreReady]);

  // Smoothly animate progress to a target value
  const animateTo = useCallback((target: number, label: string, done = false) => {
    const start = currentProgress.current;
    const delta = target - start;
    if (delta <= 0 && !done) {
      publishSplashProgress(target, label);
      setStatus({ step: label, progress: target, isComplete: done });
      return;
    }
    const duration = Math.max(80, Math.min(delta * 8, 280));
    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      const value = Math.round(start + delta * eased);
      currentProgress.current = value;
      publishSplashProgress(value, label);
      setStatus({ step: label, progress: value, isComplete: done && t >= 1 });
      if (t < 1) {
        animFrameRef.current = requestAnimationFrame(tick);
      } else {
        currentProgress.current = target;
        publishSplashProgress(target, label);
        setStatus({ step: label, progress: target, isComplete: done });
      }
    };
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = requestAnimationFrame(tick);
  }, []);

  const finishPreload = useCallback((label = 'Ready!') => {
    setStatus({ step: label, progress: 100, isComplete: true });
  }, []);

  const updateStatus = useCallback((stepKey: string, partialProgress?: number) => {
    const stepIndex = PRELOAD_STEPS.findIndex(s => s.key === stepKey);
    if (stepIndex === -1) return;

    const step = PRELOAD_STEPS[stepIndex];
    const progressBefore = PRELOAD_STEPS.slice(0, stepIndex).reduce((acc, s) => acc + s.weight, 0);
    const stepProgress = partialProgress !== undefined ? (step.weight * partialProgress) : step.weight;
    const target = Math.min(Math.round(((progressBefore + stepProgress) / TOTAL_WEIGHT) * 100), 100);
    
    animateTo(target, step.label, stepKey === 'ready');
  }, [animateTo]);

  useEffect(() => {
    if (!restoreReady) return;
    if (hasStarted.current) return;
    hasStarted.current = true;

    const path = typeof window !== 'undefined' ? window.location.pathname : '';
    if (isSetupRoutePath(path)) {
      console.log('[Preloader] Setup route fast path — instant ready');
      finishPreload('Ready!');
      return;
    }

    // Never block splash on network — show UI immediately, warm caches in background.
    console.log('[Preloader] Instant ready — background warm');
    updateStatus('init', 0.35);
    finishPreload('Ready!');

    // Theme first — before feed/DM warm (must not wait on getSession).
    kickstartThemeHydration(queryClient);

    requestAnimationFrame(() => {
      preloadCriticalRoutes();
      void warmHomeCaches(queryClient);
      void runBackgroundWarm(queryClient);
      setTimeout(() => preloadSecondaryRoutes(), 1200);
    });
    
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [restoreReady, queryClient, updateStatus, animateTo, finishPreload]);

  return status;
}

// Helper function to cache feed data in the correct format
function cacheFeedData(
  queryClient: ReturnType<typeof useQueryClient>,
  posts: any[],
  userId: string | null,
  type: string
) {
  const transformedPosts = posts.map((row) => ({
    id: row.id,
    type: row.type,
    media_url: row.media_url,
    thumbnail_url: row.thumbnail_url,
    caption: row.caption || '',
    tags: row.tags || [],
    created_at: row.created_at,
    is_pinned: row.is_pinned,
    view_count: row.view_count || 0,
    author: {
      id: row.author_id,
      username: row.author_username,
      avatar_url: row.author_avatar_url,
    },
    like_count: Number(row.like_count) || 0,
    comment_count: Number(row.comment_count) || 0,
    is_liked: row.is_liked || false,
    is_bookmarked: row.is_bookmarked || false,
  }));

  // Cache with the correct query key format
  queryClient.setQueryData(
    ['infinite-posts', type, undefined, userId],
    {
      pages: [{ 
        posts: transformedPosts, 
        nextPage: transformedPosts.length >= 20 ? 1 : null, 
        totalLoaded: transformedPosts.length 
      }],
      pageParams: [0],
    }
  );

  // Also cache for generic feed query
  if (type === 'feed_post') {
    queryClient.setQueryData(
      ['infinite-posts', undefined, undefined, userId],
      {
        pages: [{ 
          posts: transformedPosts, 
          nextPage: transformedPosts.length >= 30 ? 1 : null, 
          totalLoaded: transformedPosts.length 
        }],
        pageParams: [0],
      }
    );
  }
}

/** Background feed/profile warm — never blocks splash. */
async function runBackgroundWarm(queryClient: QueryClient) {
  try {
    const { data: { session } } = await db.auth.getSession();
    if (!session?.user) {
      const [feedResult, clipsResult] = await Promise.allSettled([
        db.rpc('get_posts_with_counts', {
          p_type: 'feed_post',
          p_author_id: null,
          p_user_id: null,
          p_offset: 0,
          p_limit: 30,
        }),
        db.rpc('get_posts_with_counts', {
          p_type: 'clip',
          p_author_id: null,
          p_user_id: null,
          p_offset: 0,
          p_limit: 20,
        }),
      ]);
      if (feedResult.status === 'fulfilled' && feedResult.value.data) {
        const posts = feedResult.value.data as any[];
        cacheFeedData(queryClient, posts, null, 'feed_post');
        batchSignUrls(posts.flatMap((p) => [p.media_url, p.author_avatar_url, p.thumbnail_url]).filter(Boolean)).catch(() => {});
      }
      if (clipsResult.status === 'fulfilled' && clipsResult.value.data) {
        const clips = clipsResult.value.data as any[];
        cacheFeedData(queryClient, clips, null, 'clip');
        batchSignUrls(clips.flatMap((p) => [p.media_url, p.author_avatar_url, p.thumbnail_url]).filter(Boolean)).catch(() => {});
      }
      return;
    }

    const uid = session.user.id;
    void prefetchAndApplyUserTheme(uid, queryClient);

    const { data: profileData } = await db
      .from('profiles')
      .select('*')
      .eq('user_id', uid)
      .maybeSingle();

    const profileId = profileData?.id;
    if (profileData && profileId) {
      queryClient.setQueryData(['profile', profileId], profileData);
      warmHomeCachesForProfile(queryClient, uid, profileId, profileData);

      const [feedResult, clipsResult] = await Promise.allSettled([
        db.rpc('get_posts_with_counts', {
          p_type: null,
          p_author_id: null,
          p_user_id: profileId,
          p_offset: 0,
          p_limit: 25,
        }),
        db.rpc('get_posts_with_counts', {
          p_type: 'short',
          p_author_id: null,
          p_user_id: profileId,
          p_offset: 0,
          p_limit: 15,
        }),
      ]);
      if (feedResult.status === 'fulfilled' && feedResult.value.data) {
        const posts = feedResult.value.data as any[];
        cacheFeedData(queryClient, posts, profileId, null);
        batchSignUrls(posts.flatMap((p) => [p.media_url, p.author_avatar_url, p.thumbnail_url]).filter(Boolean)).catch(() => {});
      }
      if (clipsResult.status === 'fulfilled' && clipsResult.value.data) {
        const clips = clipsResult.value.data as any[];
        cacheFeedData(queryClient, clips, profileId, 'short');
        batchSignUrls(clips.flatMap((p) => [p.media_url, p.author_avatar_url, p.thumbnail_url]).filter(Boolean)).catch(() => {});
      }
    }
  } catch (error) {
    console.warn('[Preloader] Background warm failed:', error);
  }
}
