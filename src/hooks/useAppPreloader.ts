import { useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { batchSignUrls } from '@/lib/signedUrlCache';
import { hasWarmOfflineCache } from '@/lib/offlineCacheProbe';
import { prefetchDMConversations } from '@/lib/loadDMConversations';
import { isPersistRestored, markPersistRestored, onPersistRestored } from '@/lib/persistRestoreGate';
import { preloadCriticalRoutes, preloadSecondaryRoutes } from '@/lib/routePreloader';
import { hasStoredSupabaseSession } from '@/lib/supabaseStorageKey';
import { isNativePerfMode } from '@/lib/nativePerfMode';
import { isSetupRoutePath } from '@/lib/splashSession';
import { getCachedCurrentProfile } from '@/lib/profileCache';
import { setCachedUserLevel } from '@/lib/userLevelCache';

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
    }, isNativePerfMode() ? 120 : 250);
    return () => clearTimeout(t);
  }, [restoreReady]);

  // Smoothly animate progress to a target value
  const animateTo = useCallback((target: number, label: string, done = false) => {
    const start = currentProgress.current;
    const delta = target - start;
    if (delta <= 0 && !done) {
      setStatus({ step: label, progress: target, isComplete: done });
      return;
    }
    const duration = Math.max(150, Math.min(delta * 12, 500)); // adaptive duration
    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      const value = Math.round(start + delta * eased);
      currentProgress.current = value;
      setStatus({ step: label, progress: value, isComplete: done && t >= 1 });
      if (t < 1) {
        animFrameRef.current = requestAnimationFrame(tick);
      } else {
        currentProgress.current = target;
        setStatus({ step: label, progress: target, isComplete: done });
      }
    };
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = requestAnimationFrame(tick);
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
      setStatus({ step: 'Ready!', progress: 100, isComplete: true });
      return;
    }

    // Returning user — skip splash network work; hydrate in background.
    if (
      hasWarmOfflineCache(queryClient) ||
      hasStoredSupabaseSession() ||
      getCachedCurrentProfile()
    ) {
      console.log('[Preloader] Fast path — instant ready');
      setStatus({ step: 'Ready!', progress: 100, isComplete: true });
      requestAnimationFrame(() => {
        preloadCriticalRoutes();
        void warmLoggedInCaches(queryClient);
      });
      return;
    }

    // Safety timeout — never block the UI on network.
    const safetyTimeout = setTimeout(() => {
      setStatus({ step: 'Ready!', progress: 100, isComplete: true });
    }, isNativePerfMode() ? 120 : 180);

    const preload = async () => {
      const startTime = performance.now();
      
      try {
        // Step 1: Initialize
        updateStatus('init');

        // Step 2: Check authentication with tight timeout — splash should never wait long.
        updateStatus('auth');

        let session = null;
        try {
          const authResult = await Promise.race([
            supabase.auth.getSession(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Auth timeout')), 250))
          ]) as { data: { session: any } };
          session = authResult.data.session;
        } catch {
          /* splash continues — page-level queries hydrate in background */
        }

        if (!session?.user) {
          // Guest mode — fire feed/clips fetches in background, don't block splash.
          updateStatus('feed');

          Promise.allSettled([
            supabase.rpc('get_posts_with_counts', {
              p_type: 'feed_post',
              p_author_id: null,
              p_user_id: null,
              p_offset: 0,
              p_limit: 30,
            }),
            supabase.rpc('get_posts_with_counts', {
              p_type: 'clip',
              p_author_id: null,
              p_user_id: null,
              p_offset: 0,
              p_limit: 20,
            }),
          ]).then(([feedResult, clipsResult]) => {
            if (feedResult.status === 'fulfilled' && feedResult.value.data) {
              const posts = feedResult.value.data as any[];
              cacheFeedData(queryClient, posts, null, 'feed_post');
              const urlsToSign = posts.flatMap(p => [p.media_url, p.author_avatar_url, p.thumbnail_url]).filter(Boolean);
              batchSignUrls(urlsToSign).catch(() => {});
            }
            if (clipsResult.status === 'fulfilled' && clipsResult.value.data) {
              const clips = clipsResult.value.data as any[];
              cacheFeedData(queryClient, clips, null, 'clip');
              const urlsToSign = clips.flatMap(p => [p.media_url, p.author_avatar_url, p.thumbnail_url]).filter(Boolean);
              batchSignUrls(urlsToSign).catch(() => {});
            }
          });

          console.log(`[Preloader] Guest mode ready (non-blocking) - ${(performance.now() - startTime).toFixed(0)}ms`);
          setStatus({ step: 'Ready!', progress: 100, isComplete: true });
          return;
        }

        const uid = session.user.id;

        // Step 3: Kick off profile fetch but cap how long the splash will wait on it.
        updateStatus('profile');

        const profilePromise = supabase
          .from('profiles')
          .select('*')
          .eq('user_id', uid)
          .maybeSingle();

        let profileData: any = null;
        try {
          const result = await Promise.race([
            profilePromise,
            new Promise((_, reject) => setTimeout(() => reject(new Error('Profile timeout')), 250)),
          ]) as any;
          profileData = result?.data || null;
        } catch {
          // Splash continues; the profile query will keep running and hydrate via React Query.
          console.warn('[Preloader] Profile slow, continuing without blocking');
        }

        const profileId = profileData?.id;
        if (profileData) {
          queryClient.setQueryData(['profile', profileId], profileData);
        }

        // Step 3b+: warm caches in background — never block splash exit.
        if (profileId && uid) {
          void warmUserCaches(queryClient, uid, profileId);
        }

        if (profileId) {
          void prefetchDMConversations(queryClient, profileId);

          Promise.allSettled([
            supabase.rpc('get_posts_with_counts', {
              p_type: null,
              p_author_id: null,
              p_user_id: profileId,
              p_offset: 0,
              p_limit: 25,
            }),
            supabase.rpc('get_posts_with_counts', {
              p_type: 'short',
              p_author_id: null,
              p_user_id: profileId,
              p_offset: 0,
              p_limit: 15,
            }),
          ]).then(([feedResult, clipsResult]) => {
            if (feedResult.status === 'fulfilled' && feedResult.value.data) {
              const posts = feedResult.value.data as any[];
              cacheFeedData(queryClient, posts, profileId, null);
              const urlsToSign = posts.flatMap(p => [p.media_url, p.author_avatar_url, p.thumbnail_url]).filter(Boolean);
              batchSignUrls(urlsToSign).catch(() => {});
            }
            if (clipsResult.status === 'fulfilled' && clipsResult.value.data) {
              const clips = clipsResult.value.data as any[];
              cacheFeedData(queryClient, clips, profileId, 'short');
              const urlsToSign = clips.flatMap(p => [p.media_url, p.author_avatar_url, p.thumbnail_url]).filter(Boolean);
              batchSignUrls(urlsToSign).catch(() => {});
            }
          });
        }

        setStatus({ step: 'Ready!', progress: 100, isComplete: true });

        console.log(`[Preloader] Splash ready (non-blocking) - ${(performance.now() - startTime).toFixed(0)}ms`);

        // DEFERRED: Load social data in background (non-blocking).
        // CRITICAL: gate on profileId — if the profile race timed out above,
        // profileId is undefined and firing these queries with `undefined`
        // would produce a flood of `invalid input syntax for type uuid`
        // 400s on follows / friend_requests / notifications / conversation_members.
        if (!profileId) {
          console.warn('[Preloader] Skipping background social fetch — profile not resolved yet');
          return;
        }
        requestAnimationFrame(() => {
          preloadCriticalRoutes();
          
          // Background social data fetch
          Promise.allSettled([
            // Notifications
            supabase
              .from('notifications')
              .select(`*, actor:profiles!notifications_actor_id_fkey(id, username, avatar_url)`)
              .eq('user_id', profileId)
              .order('created_at', { ascending: false })
              .limit(15)
              .then(({ data }) => {
                if (data) queryClient.setQueryData(['notifications', profileId], data);
              }),
            // Friend requests
            supabase
              .from('friend_requests')
              .select(`*, sender:profiles!friend_requests_sender_id_fkey(id, username, display_name, avatar_url)`)
              .eq('receiver_id', profileId)
              .eq('status', 'pending')
              .order('created_at', { ascending: false })
              .limit(10)
              .then(({ data }) => {
                if (data) queryClient.setQueryData(['friend-requests', profileId], data);
              }),
            // Stories
            supabase
              .from('stories')
              .select(`*, author:profiles!stories_author_id_fkey(id, username, avatar_url)`)
              .gt('expires_at', new Date().toISOString())
              .order('created_at', { ascending: false })
              .limit(30)
              .then(({ data }) => {
                if (data) {
                  const storyGroups = processStoriesIntoGroups(data, profileId);
                  queryClient.setQueryData(['stories', profileId], storyGroups);
                  const storyUrls = data.flatMap((s: any) => [s.media_url, s.author?.avatar_url]).filter(Boolean);
                  batchSignUrls(storyUrls).catch(() => {});
                }
              }),
            // Own profile stats
            (async () => {
              const [followerCount, followingCount, postCount] = await Promise.all([
                supabase.from('follows').select('id', { count: 'exact', head: true }).eq('following_id', profileId),
                supabase.from('follows').select('id', { count: 'exact', head: true }).eq('follower_id', profileId),
                supabase.from('posts').select('id', { count: 'exact', head: true }).eq('author_id', profileId),
              ]);
              queryClient.setQueryData(['profile-by-id', profileId, profileId], {
                ...profileData,
                follower_count: followerCount.count || 0,
                following_count: followingCount.count || 0,
                post_count: postCount.count || 0,
                is_following: false,
              });
            })(),
            // User's own posts
            supabase.rpc('get_posts_with_counts', {
              p_type: null,
              p_author_id: profileId,
              p_user_id: profileId,
              p_offset: 0,
              p_limit: 20,
            }).then(({ data }) => {
              if (data) {
                const posts = data as any[];
                queryClient.setQueryData(['user-posts', profileId], posts);
                cacheFeedData(queryClient, posts, profileId, null);
              }
            }),
          ]).then(() => {
            console.log(`[Preloader] Background social data loaded - ${(performance.now() - startTime).toFixed(0)}ms total`);
          });

          setTimeout(() => preloadSecondaryRoutes(), 3000);
        });

      } catch (error) {
        console.error('[Preloader] Error:', error);
        setStatus({ step: 'Ready!', progress: 100, isComplete: true });
      } finally {
        clearTimeout(safetyTimeout);
      }
    };

    preload();
    
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [restoreReady, queryClient, updateStatus, animateTo]);

  return status;
}

/** Background hydrate for returning users on the fast path. */
async function warmLoggedInCaches(queryClient: ReturnType<typeof useQueryClient>) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    const uid = session.user.id;

    const cached = getCachedCurrentProfile();
    if (cached) {
      queryClient.setQueryData(['profile', cached.id], {
        id: cached.id,
        user_id: uid,
        username: cached.username,
        display_name: cached.display_name,
        avatar_url: cached.avatar_url,
        bio: cached.bio || '',
      });
      void warmUserCaches(queryClient, uid, cached.id);
      return;
    }

    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', uid)
      .maybeSingle();
    if (profileData?.id) {
      queryClient.setQueryData(['profile', profileData.id], profileData);
      void warmUserCaches(queryClient, uid, profileData.id);
    }
  } catch {
    /* non-blocking */
  }
}

function warmUserCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  uid: string,
  profileId: string,
) {
  void Promise.allSettled([
    supabase
      .from('user_preferences' as any)
      .select('*')
      .eq('user_id', uid)
      .maybeSingle()
      .then(({ data }) => {
        const prefsRow = data as any;
        if (prefsRow) {
          queryClient.setQueryData(['user-preferences', uid], {
            clips_muted: prefsRow.clips_muted ?? true,
            explore_view_mode: prefsRow.explore_view_mode ?? 'clips',
            button_sound: prefsRow.button_sound ?? 'pop',
            dismissed_quick_add_ids: prefsRow.dismissed_quick_add_ids ?? [],
            unlocked_easter_eggs: prefsRow.unlocked_easter_eggs ?? [],
            intro_completed: prefsRow.intro_completed ?? false,
            referral_confirmed: prefsRow.referral_confirmed ?? false,
            extra: prefsRow.extra ?? {},
          });
        }
      }),
    supabase
      .from('user_levels')
      .select('*')
      .eq('user_id', uid)
      .maybeSingle()
      .then(async ({ data: levelRow }) => {
        if (levelRow) {
          const normalized = {
            ...levelRow,
            unclaimed_rewards: Array.isArray(levelRow.unclaimed_rewards) ? levelRow.unclaimed_rewards : [],
          };
          queryClient.setQueryData(['user-level', uid], normalized);
          setCachedUserLevel(uid, {
            current_level: levelRow.current_level,
            total_xp: levelRow.total_xp,
            unclaimed_rewards: normalized.unclaimed_rewards,
          });
          return;
        }
        await supabase.rpc('ensure_user_level');
        const { data: retryRow } = await supabase
          .from('user_levels')
          .select('*')
          .eq('user_id', uid)
          .maybeSingle();
        if (retryRow) {
          queryClient.setQueryData(['user-level', uid], retryRow);
          setCachedUserLevel(uid, {
            current_level: retryRow.current_level,
            total_xp: retryRow.total_xp,
            unclaimed_rewards: Array.isArray(retryRow.unclaimed_rewards) ? retryRow.unclaimed_rewards : [],
          });
        }
      }),
    supabase
      .from('dna_agent_settings')
      .select('*')
      .eq('user_id', uid)
      .maybeSingle()
      .then(({ data: dnaRow }) => {
        if (dnaRow) queryClient.setQueryData(['dna-agent-settings', uid], dnaRow);
      }),
  ]);

  void prefetchDMConversations(queryClient, profileId);
  void warmPersonalizedFeed(queryClient, profileId);
}

function warmPersonalizedFeed(
  queryClient: ReturnType<typeof useQueryClient>,
  profileId: string,
) {
  const feedKey = ['personalized-feed-v2', undefined, profileId, 0] as const;
  const existing = queryClient.getQueryData(feedKey);
  if (existing) return;

  void supabase
    .rpc('get_ranked_feed_v2', {
      p_user_id: profileId,
      p_content_type: null,
      p_category: null,
      p_lat: null,
      p_lng: null,
      p_radius_miles: null,
      p_offset: 0,
      p_limit: 15,
    } as any)
    .then(({ data, error }) => {
      if (error || !data?.length) return;
      const posts = (data as any[]).map((row) => ({
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
        reaction_type: row.reaction_type || null,
      }));
      queryClient.setQueryData(feedKey, {
        pages: [{ posts, nextPage: posts.length >= 15 ? 1 : null }],
        pageParams: [0],
      });
      const urls = posts.flatMap((p) => [p.media_url, p.thumbnail_url, p.author?.avatar_url]).filter(Boolean);
      batchSignUrls(urls).catch(() => {});
    });
}

// Helper function to process raw stories into grouped format
function processStoriesIntoGroups(stories: any[], profileId: string) {
  const groupedMap = new Map<string, any>();

  for (const story of stories) {
    const authorId = story.author_id || story.author?.id;
    if (!groupedMap.has(authorId)) {
      groupedMap.set(authorId, {
        user: story.author || {
          id: story.author_id,
          username: story.author?.username || 'Unknown',
          avatar_url: story.author?.avatar_url || null,
          display_name: story.author?.display_name || null,
        },
        stories: [],
        hasUnviewed: false,
      });
    }
    const group = groupedMap.get(authorId)!;
    group.stories.push(story);
  }

  // Sort: own stories first, then others
  const groups = Array.from(groupedMap.values());
  groups.sort((a, b) => {
    if (a.user.id === profileId) return -1;
    if (b.user.id === profileId) return 1;
    return 0;
  });

  return groups;
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
