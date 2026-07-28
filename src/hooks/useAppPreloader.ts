import { useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { warmHomeCaches, warmHomeCachesForProfile } from '@/lib/warmHomeCaches';
import { isPersistRestored, markPersistRestored, onPersistRestored } from '@/lib/persistRestoreGate';
import { preloadCriticalRoutes, preloadSecondaryRoutes } from '@/lib/routePreloader';
import { isAndroidNativeStartup, isIOSNativeStartup, isNativePerfMode } from '@/lib/nativePerfMode';
import { getRuntimeOs } from '@/lib/despiaBridge';
import { isSetupRoutePath } from '@/lib/splashSession';
import { publishSplashProgress } from '@/lib/splashProgressBridge';
import { kickstartThemeHydration, prefetchAndApplyUserTheme } from '@/lib/themeHydration';
import { getCachedCurrentProfile } from '@/lib/profileCache';
import { resolveProfileAvatarUrl } from '@/lib/profileAvatarCache';
import { signAndPreloadFeedPosts, signAndPreloadProfileAvatar } from '@/lib/imagePreload';
import { prefetchDMConversations } from '@/lib/loadDMConversations';
import { logStartupPhase } from '@/lib/startupTiming';

interface PreloadStatus {
  step: string;
  progress: number;
  isComplete: boolean;
}

/** Critical splash steps only — persist, auth/profile, feed, DM. No stories/signing/brief. */
const PRELOAD_STEPS = [
  { key: 'init', label: 'Waking up...', weight: 10 },
  { key: 'auth', label: 'Checking session...', weight: 18 },
  { key: 'profile', label: 'Loading profile...', weight: 18 },
  { key: 'feed', label: 'Getting your feed...', weight: 28 },
  { key: 'dm', label: 'Loading messages...', weight: 18 },
  { key: 'ready', label: "Let's go! ✨", weight: 8 },
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
    // Wait for real IDB hydrate (PersistQueryClient onSuccess). Backup only —
    // never force-complete at 0ms or Messages opens against an empty RQ cache.
    const t = setTimeout(() => {
      markPersistRestored();
      setRestoreReady(true);
    }, isIOSNativeStartup() ? 350 : isAndroidNativeStartup() ? 400 : 300);
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
      const ios = isIOSNativeStartup();
      const android = isAndroidNativeStartup();
      const native = ios || android || isNativePerfMode();
      const authMs = native ? 700 : 1600;
      const profileMs = native ? 700 : 1600;
      const feedMs = native ? 800 : 2000;
      const dmMs = native ? 800 : 2000;

      logStartupPhase('Preloader start', { os: getRuntimeOs(), ios, android, native });
      updateStatus('init', 0.4);
      kickstartThemeHydration(queryClient);
      preloadCriticalRoutes();

      updateStatus('auth', 0.15);
      const { data: { session } } = await withTimeout<any>(
        db.auth.getSession(),
        authMs,
        { data: { session: null }, error: null },
      );
      if (cancelled) return;
      updateStatus('auth', 1);
      logStartupPhase('Auth restored', { hasUser: !!session?.user, via: 'preloader' });

      if (!session?.user) {
        updateStatus('profile', 1);
        updateStatus('feed', 0.2);
        await withTimeout(
          warmGuestFeed(queryClient, (p) => {
            if (!cancelled) updateStatus('feed', 0.2 + p * 0.8);
          }),
          feedMs,
          undefined as void,
        );
        if (cancelled) return;
        updateStatus('feed', 1);
        updateStatus('dm', 1);
      } else {
        const uid = session.user.id;
        updateStatus('profile', 0.25);
        void prefetchAndApplyUserTheme(uid, queryClient);

        const cachedProfile = getCachedCurrentProfile();
        const earlyProfileId = cachedProfile?.id;
        let feedWarmPromise: Promise<void> | null = null;
        if (cachedProfile && earlyProfileId) {
          const earlyAvatar = resolveProfileAvatarUrl(earlyProfileId, cachedProfile.avatar_url);
          if (earlyAvatar) void signAndPreloadProfileAvatar(earlyAvatar, 192);
          queryClient.setQueryData(['profile', earlyProfileId], cachedProfile);
          feedWarmPromise = warmUserFeed(queryClient, earlyProfileId, uid, (p) => {
            if (!cancelled) updateStatus('feed', 0.15 + p * 0.5);
          });
        }

        const profileResult = await withTimeout<any>(
          db.from('profiles').select('id, user_id, username, avatar_url, bio, created_at, display_name, link_url, location, is_private, is_verified, phone_verified, interests, sensitivity_preference, language, timezone, coins_balance, onboarding_completed, first_name, last_name, tutorial_completed, tutorial_skipped, referral_inviter_id, intro_completed, badge_settings, age_verified, equipped_effect, equipped_frame, equipped_name_color, equipped_profile_theme, equipped_title, equipped_badge_id, founder_badge_seen, tracking_consent, is_premium, premium_expires_at, music_personality, last_login_date, login_streak, updated_at, crash_consent, cookie_consent, feature_on_landing, contact_discoverable, deletion_requested_at, scheduled_purge_at, date_of_birth').eq('user_id', uid).maybeSingle() as unknown as Promise<any>,
          profileMs,
          { data: null, error: null },
        );
        if (cancelled) return;
        updateStatus('profile', 1);

        const profileData = profileResult.data ?? cachedProfile;
        const profileId = profileData?.id ?? earlyProfileId;
        if (profileData && profileId) {
          queryClient.setQueryData(['profile', profileId], profileData);
          // Stories/notifications/meta continue in background — not critical for splash.
          warmHomeCachesForProfile(queryClient, uid, profileId, profileData);
        }

        updateStatus('feed', 0.15);
        // Never block splash on feed media signing — data warm only, signing in background.
        if (!earlyProfileId || profileId !== earlyProfileId) {
          await withTimeout(
            warmUserFeed(queryClient, profileId ?? null, uid, (p) => {
              if (!cancelled) updateStatus('feed', 0.15 + p * 0.85);
            }),
            feedMs,
            undefined as void,
          );
        } else if (feedWarmPromise) {
          await withTimeout(feedWarmPromise, feedMs, undefined as void);
        }
        if (cancelled) return;
        updateStatus('feed', 1);

        updateStatus('dm', 0.2);
        if (profileId) {
          const dmWarm = prefetchDMConversations(queryClient, profileId, uid);
          if (native) {
            // Home is usable without the inbox cache. Keep native cold start
            // responsive and finish this warm-up after the shell is visible.
            void dmWarm.catch(() => undefined);
          } else {
            await withTimeout(dmWarm, dmMs, undefined as void);
          }
        }
        if (cancelled) return;
        updateStatus('dm', 1);
      }

      updateStatus('ready', 1);
      logStartupPhase('Preloader ready');

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
    // Image signing is background-only — do not hold splash.
    void signAndPreloadFeedPosts(
      posts.map((p) => ({
        media_url: p.media_url,
        thumbnail_url: p.thumbnail_url,
        author: { avatar_url: p.author_avatar_url },
      })),
      12,
    );
  }
  if (clipsResult.status === 'fulfilled' && clipsResult.value.data) {
    const clips = clipsResult.value.data as any[];
    cacheFeedData(queryClient, clips, null, 'clip');
    void signAndPreloadFeedPosts(
      clips.map((p) => ({
        media_url: p.media_url,
        thumbnail_url: p.thumbnail_url,
        author: { avatar_url: p.author_avatar_url },
      })),
      8,
    );
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
    void signAndPreloadFeedPosts(
      posts.map((p) => ({
        media_url: p.media_url,
        thumbnail_url: p.thumbnail_url,
        author: { avatar_url: p.author_avatar_url },
      })),
      12,
    );
  }
  if (clipsResult.status === 'fulfilled' && clipsResult.value.data) {
    const clips = clipsResult.value.data as any[];
    cacheFeedData(queryClient, clips, profileId, 'short');
    void signAndPreloadFeedPosts(
      clips.map((p) => ({
        media_url: p.media_url,
        thumbnail_url: p.thumbnail_url,
        author: { avatar_url: p.author_avatar_url },
      })),
      8,
    );
  }
  onProgress(1);
}
