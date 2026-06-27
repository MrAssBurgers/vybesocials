/**
 * Splash boot pipeline — preloads auth, theme, feed, DMs, and route chunks
 * while the splash is visible. Progress bar tracks real steps.
 */
import type { QueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { batchSignUrls } from '@/lib/signedUrlCache';
import { getCachedCurrentProfile } from '@/lib/profileCache';
import { prefetchDMConversations } from '@/lib/loadDMConversations';
import { kickstartThemeHydration, prefetchAndApplyUserTheme } from '@/lib/themeHydration';
import { preloadCriticalRoutesAsync } from '@/lib/routePreloader';
import { warmHomeCachesForProfile } from '@/lib/warmHomeCaches';
import { withTimeout } from '@/lib/withTimeout';

export const SPLASH_PRELOAD_STEPS = [
  { key: 'init', label: 'Waking up...', weight: 8 },
  { key: 'cache', label: 'Restoring your Vybe...', weight: 12 },
  { key: 'auth', label: 'Checking session...', weight: 12 },
  { key: 'theme', label: 'Applying your Vybe...', weight: 14 },
  { key: 'profile', label: 'Loading profile...', weight: 12 },
  { key: 'feed', label: 'Getting your feed...', weight: 18 },
  { key: 'social', label: 'Syncing messages...', weight: 14 },
  { key: 'routes', label: 'Almost there...', weight: 10 },
  { key: 'ready', label: "Let's go! ✨", weight: 10 },
] as const;

const TOTAL_WEIGHT = SPLASH_PRELOAD_STEPS.reduce((s, step) => s + step.weight, 0);

export type SplashPreloadStepKey = (typeof SPLASH_PRELOAD_STEPS)[number]['key'];

export function splashStepProgress(
  stepKey: SplashPreloadStepKey,
  partial = 1,
): { progress: number; label: string } {
  const stepIndex = SPLASH_PRELOAD_STEPS.findIndex((s) => s.key === stepKey);
  if (stepIndex === -1) return { progress: 0, label: 'Loading...' };
  const step = SPLASH_PRELOAD_STEPS[stepIndex];
  const before = SPLASH_PRELOAD_STEPS.slice(0, stepIndex).reduce((acc, s) => acc + s.weight, 0);
  const value = before + step.weight * Math.max(0, Math.min(partial, 1));
  return {
    progress: Math.min(Math.round((value / TOTAL_WEIGHT) * 100), 100),
    label: step.label,
  };
}

function cacheFeedData(
  queryClient: QueryClient,
  posts: Record<string, unknown>[],
  userId: string | null,
  type: string | null,
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

  const keyType = type ?? undefined;
  queryClient.setQueryData(['infinite-posts', keyType, undefined, userId], {
    pages: [{
      posts: transformedPosts,
      nextPage: transformedPosts.length >= 20 ? 1 : null,
      totalLoaded: transformedPosts.length,
    }],
    pageParams: [0],
  });

  if (type === 'feed_post' || type === null) {
    queryClient.setQueryData(['infinite-posts', undefined, undefined, userId], {
      pages: [{
        posts: transformedPosts,
        nextPage: transformedPosts.length >= 30 ? 1 : null,
        totalLoaded: transformedPosts.length,
      }],
      pageParams: [0],
    });
  }
}

async function warmPublicFeed(queryClient: QueryClient): Promise<void> {
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
    const posts = feedResult.value.data as Record<string, unknown>[];
    cacheFeedData(queryClient, posts, null, 'feed_post');
    void batchSignUrls(
      posts.flatMap((p) => [p.media_url, p.author_avatar_url, p.thumbnail_url]).filter(Boolean) as string[],
    ).catch(() => {});
  }
  if (clipsResult.status === 'fulfilled' && clipsResult.value.data) {
    const clips = clipsResult.value.data as Record<string, unknown>[];
    cacheFeedData(queryClient, clips, null, 'clip');
    void batchSignUrls(
      clips.flatMap((p) => [p.media_url, p.author_avatar_url, p.thumbnail_url]).filter(Boolean) as string[],
    ).catch(() => {});
  }
}

async function warmSignedInFeed(
  queryClient: QueryClient,
  uid: string,
  profileId: string,
  profileRow: Record<string, unknown>,
): Promise<void> {
  queryClient.setQueryData(['profile', profileId], profileRow);
  warmHomeCachesForProfile(queryClient, uid, profileId, profileRow);

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
    const posts = feedResult.value.data as Record<string, unknown>[];
    cacheFeedData(queryClient, posts, profileId, null);
    void batchSignUrls(
      posts.flatMap((p) => [p.media_url, p.author_avatar_url, p.thumbnail_url]).filter(Boolean) as string[],
    ).catch(() => {});
  }
  if (clipsResult.status === 'fulfilled' && clipsResult.value.data) {
    const clips = clipsResult.value.data as Record<string, unknown>[];
    cacheFeedData(queryClient, clips, profileId, 'short');
    void batchSignUrls(
      clips.flatMap((p) => [p.media_url, p.author_avatar_url, p.thumbnail_url]).filter(Boolean) as string[],
    ).catch(() => {});
  }
}

export interface RunSplashPreloadOptions {
  onStep: (stepKey: SplashPreloadStepKey, partial?: number) => void;
  authTimeoutMs?: number;
  stepTimeoutMs?: number;
}

/**
 * Runs the full splash rehydration pipeline. Resolves when caches + critical routes are warm.
 */
export async function runSplashPreload(
  queryClient: QueryClient,
  { onStep, authTimeoutMs = 5000, stepTimeoutMs = 8000 }: RunSplashPreloadOptions,
): Promise<void> {
  onStep('init', 0.2);
  kickstartThemeHydration(queryClient);
  onStep('init', 1);

  onStep('cache', 0.35);
  // Brief beat so React Query persist hydrate paints theme from cache
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  onStep('cache', 1);

  onStep('auth', 0.15);
  let session: Awaited<ReturnType<typeof db.auth.getSession>>['data']['session'] | null = null;
  try {
    const result = await withTimeout(db.auth.getSession(), authTimeoutMs, 'auth timeout');
    session = result.data.session;
  } catch {
    session = null;
  }
  onStep('auth', 1);

  const uid = session?.user?.id ?? null;

  onStep('theme', 0.2);
  if (uid) {
    await withTimeout(
      prefetchAndApplyUserTheme(uid, queryClient, { timeoutMs: Math.min(stepTimeoutMs, 5000) }),
      stepTimeoutMs,
      'theme timeout',
    ).catch(() => undefined);
  } else {
    kickstartThemeHydration(queryClient);
  }
  onStep('theme', 1);

  onStep('profile', 0.1);
  let profileId: string | null = getCachedCurrentProfile()?.id ?? null;
  let profileRow: Record<string, unknown> | null = null;

  if (uid) {
    if (!profileId) {
      try {
        const { data } = await withTimeout(
          db.from('profiles').select('*').eq('user_id', uid).maybeSingle(),
          stepTimeoutMs,
          'profile timeout',
        );
        if (data?.id) {
          profileId = data.id;
          profileRow = data as Record<string, unknown>;
        }
      } catch {
        /* use cache-only profile if available */
      }
    } else {
      profileRow =
        (queryClient.getQueryData(['profile', profileId]) as Record<string, unknown> | undefined) ??
        ({
          id: profileId,
          user_id: uid,
          username: getCachedCurrentProfile()?.username,
          avatar_url: getCachedCurrentProfile()?.avatar_url,
        } as Record<string, unknown>);
    }
  }
  onStep('profile', 1);

  onStep('feed', 0.1);
  try {
    if (uid && profileId && profileRow) {
      await withTimeout(
        warmSignedInFeed(queryClient, uid, profileId, profileRow),
        stepTimeoutMs,
        'feed timeout',
      );
    } else {
      await withTimeout(warmPublicFeed(queryClient), stepTimeoutMs, 'feed timeout');
    }
  } catch {
    /* non-fatal */
  }
  onStep('feed', 1);

  onStep('social', 0.1);
  if (uid && profileId) {
    try {
      await withTimeout(
        prefetchDMConversations(queryClient, profileId, uid),
        stepTimeoutMs,
        'dm timeout',
      );
    } catch {
      /* non-fatal */
    }
  }
  onStep('social', 1);

  onStep('routes', 0.15);
  try {
    await preloadCriticalRoutesAsync(Math.min(stepTimeoutMs, 5000));
  } catch {
    /* non-fatal */
  }
  onStep('routes', 1);

  onStep('ready', 1);
  // Hold at 100% briefly so the bar visibly completes
  await new Promise((r) => setTimeout(r, 320));
}
