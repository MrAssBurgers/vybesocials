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

const PRELOAD_STEPS = [
  { key: 'init', label: 'Waking up...', weight: 8 },
  { key: 'auth', label: 'Checking session...', weight: 14 },
  { key: 'profile', label: 'Loading profile...', weight: 14 },
  { key: 'feed', label: 'Getting your feed...', weight: 22 },
  { key: 'clips', label: 'Loading clips...', weight: 18 },
  { key: 'social', label: 'Syncing social...', weight: 14 },
  { key: 'final', label: 'Final touches...', weight: 5 },
  { key: 'ready', label: "Let's go! ✨", weight: 5 },
];

const TOTAL_WEIGHT = PRELOAD_STEPS.reduce((s, step) => s + step.weight, 0);

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => window.setTimeout(() => resolve(fallback), ms)),
  ]);
}

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

  useEffect(() => {
    if (restoreReady) return;
    const t = setTimeout(() => {
      markPersistRestored();
      setRestoreReady(true);
    }, isNativePerfMode() ? 40 : 0);
    return () => clearTimeout(t);
  }, [restoreReady]);

  const animateTo = useCallback((target: number, label: string, done = false) => {
    const start = currentProgress.current;
    const delta = target - start;

    const commit = (value: number) => {
      currentProgress.current = value;
      publishSplashProgress(value, label);
      setStatus({ step: label, progress: value, isComplete: done });
    };

    if (delta <= 0) {
      commit(done ? target : Math.max(start, target));
      return;
    }

    // Small steps snap instantly; large jumps use a short tween (no CSS transition lag).
    if (delta <= 8) {
      commit(target);
      return;
    }

    const duration = Math.min(140, Math.max(60, delta * 3));
    const startTime = performance.now();

    const tick = (now: number) => {
      const t = Math.min((now - startTime) / duration, 1);
      const value = Math.round(start + delta * t);
      commit(value);
      if (t < 1) {
        animFrameRef.current = requestAnimationFrame(tick);
      } else {
        commit(target);
      }
    };

    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = requestAnimationFrame(tick);
  }, []);

  const updateStatus = useCallback((stepKey: string, partialProgress?: number) => {
    const stepIndex = PRELOAD_STEPS.findIndex((s) => s.key === stepKey);
    if (stepIndex === -1) return;

    const step = PRELOAD_STEPS[stepIndex];
    const progressBefore = PRELOAD_STEPS.slice(0, stepIndex).reduce((acc, s) => acc + s.weight, 0);
    const stepProgress = partialProgress !== undefined ? step.weight * partialProgress : step.weight;
    const target = Math.min(Math.round(((progressBefore + stepProgress) / TOTAL_WEIGHT) * 100), 100);

    animateTo(target, step.label, stepKey === 'ready');
  }, [animateTo]);

  useEffect(() => {
    if (!restoreReady) return;
    if (hasStarted.current) return;
    hasStarted.current = true;

    const path = typeof window !== 'undefined' ? window.location.pathname : '';
    if (isSetupRoutePath(path)) {
      updateStatus('init', 1);
      updateStatus('ready', 1);
      return;
    }

    let cancelled = false;

    const run = async () => {
      updateStatus('init', 0.4);
      kickstartThemeHydration(queryClient);
      preloadCriticalRoutes();

      updateStatus('auth', 0.15);
      const authMs = isNativePerfMode() ? 1800 : 2200;
      const { data: { session } } = await withTimeout<any>(
        db.auth.getSession(),
        authMs,
        { data: { session: null }, error: null },
      );
      if (cancelled) return;
      updateStatus('auth', 1);

      if (!session?.user) {
        updateStatus('profile', 1);
        updateStatus('feed', 0.2);
        await warmGuestFeed(queryClient, (p) => {
          if (!cancelled) updateStatus('feed', 0.2 + p * 0.8);
        });
        if (cancelled) return;
        updateStatus('clips', 1);
        updateStatus('social', 1);
      } else {
        const uid = session.user.id;
        updateStatus('profile', 0.25);
        void prefetchAndApplyUserTheme(uid, queryClient);

        const profileResult = await withTimeout<any>(
          db.from('profiles').select('*').eq('user_id', uid).maybeSingle() as unknown as Promise<any>,
          isNativePerfMode() ? 1800 : 2200,
          { data: null, error: null },
        );
        if (cancelled) return;
        updateStatus('profile', 1);

        const profileData = profileResult.data;
        const profileId = profileData?.id;
        if (profileData && profileId) {
          queryClient.setQueryData(['profile', profileId], profileData);
          warmHomeCachesForProfile(queryClient, uid, profileId, profileData);
        }

        updateStatus('feed', 0.15);
        await warmUserFeed(queryClient, profileId ?? null, uid, (p) => {
          if (!cancelled) updateStatus('feed', 0.15 + p * 0.85);
        });
        if (cancelled) return;
        updateStatus('clips', 1);
        updateStatus('social', 1);
      }

      updateStatus('final', 1);
      updateStatus('ready', 1);

      requestAnimationFrame(() => {
        void warmHomeCaches(queryClient);
        setTimeout(() => preloadSecondaryRoutes(), 1200);
      });
    };

    void run().catch((error) => {
      console.warn('[Preloader] Boot warm failed:', error);
      if (!cancelled) {
        publishSplashProgress(100, "Let's go! ✨");
        setStatus({ step: "Let's go! ✨", progress: 100, isComplete: true });
      }
    });

    return () => {
      cancelled = true;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [restoreReady, queryClient, updateStatus]);

  return status;
}

function cacheFeedData(
  queryClient: QueryClient,
  posts: any[],
  userId: string | null,
  type: string,
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

  queryClient.setQueryData(
    ['infinite-posts', type, undefined, userId],
    {
      pages: [{
        posts: transformedPosts,
        nextPage: transformedPosts.length >= 20 ? 1 : null,
        totalLoaded: transformedPosts.length,
      }],
      pageParams: [0],
    },
  );

  if (type === 'feed_post') {
    queryClient.setQueryData(
      ['infinite-posts', undefined, undefined, userId],
      {
        pages: [{
          posts: transformedPosts,
          nextPage: transformedPosts.length >= 30 ? 1 : null,
          totalLoaded: transformedPosts.length,
        }],
        pageParams: [0],
      },
    );
  }
}

async function warmGuestFeed(
  queryClient: QueryClient,
  onProgress: (fraction: number) => void,
) {
  onProgress(0.1);
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
  onProgress(0.65);
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
  onProgress(1);
}

async function warmUserFeed(
  queryClient: QueryClient,
  profileId: string | null,
  uid: string,
  onProgress: (fraction: number) => void,
) {
  if (!profileId) {
    onProgress(1);
    return;
  }

  onProgress(0.1);
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
  onProgress(0.7);
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
  onProgress(1);
}
