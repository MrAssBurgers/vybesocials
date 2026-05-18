import { useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { batchSignUrls } from '@/lib/signedUrlCache';
import { preloadCriticalRoutes, preloadSecondaryRoutes } from '@/lib/routePreloader';

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
    if (hasStarted.current) return;
    hasStarted.current = true;

    // Check for cached data - if we have feed data, skip preloading entirely
    const existingFeedData = queryClient.getQueryData(['infinite-posts']);
    if (existingFeedData) {
      console.log('[Preloader] Cached data found, skipping splash');
      setStatus({ step: 'Ready!', progress: 100, isComplete: true });
      return;
    }

    // Safety timeout - 600ms max so the splash never blocks the user.
    // Page-level queries will hydrate behind the scenes via React Query.
    const safetyTimeout = setTimeout(() => {
      animateTo(100, 'Ready!', true);
    }, 600);

    const preload = async () => {
      const startTime = performance.now();
      
      try {
        // Step 1: Initialize
        updateStatus('init');
        await new Promise(r => setTimeout(r, 80)); // tiny delay so user sees first frame

        // Step 2: Check authentication with tight timeout — splash should never wait long.
        updateStatus('auth');

        let session = null;
        try {
          const authResult = await Promise.race([
            supabase.auth.getSession(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Auth timeout')), 1000))
          ]) as { data: { session: any } };
          session = authResult.data.session;
        } catch {
          console.warn('[Preloader] Auth check slow, continuing — page-level queries will hydrate');
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

          updateStatus('clips');
          updateStatus('final');

          console.log(`[Preloader] Guest mode ready (non-blocking) - ${(performance.now() - startTime).toFixed(0)}ms`);
          updateStatus('ready');
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
            new Promise((_, reject) => setTimeout(() => reject(new Error('Profile timeout')), 800)),
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

        // Step 4: Fire feed + clips in background — DON'T block splash on them.
        updateStatus('feed');

        if (profileId) {
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

        updateStatus('clips');
        updateStatus('final');
        updateStatus('ready');

        console.log(`[Preloader] Splash ready (non-blocking) - ${(performance.now() - startTime).toFixed(0)}ms`);

        // DEFERRED: Load social data in background (non-blocking)
        requestAnimationFrame(() => {
          preloadCriticalRoutes();
          
          // Background social data fetch
          Promise.allSettled([
            // Conversations
            (async () => {
              const { data: membershipData } = await supabase
                .from('conversation_members')
                .select('conversation_id, last_read_at, is_pinned, is_muted')
                .eq('user_id', profileId);

              if (!membershipData?.length) return [];

              const convIds = membershipData.map(m => m.conversation_id);
              const membershipMap = new Map(membershipData.map(m => [m.conversation_id, m]));

              const [hiddenRes, trashedRes, convsRes, msgsRes] = await Promise.all([
                supabase.from('hidden_conversations').select('conversation_id').eq('user_id', profileId),
                supabase.from('trashed_conversations').select('conversation_id').eq('user_id', profileId),
                supabase.from('conversations').select(`
                  *,
                  members:conversation_members(
                    user_id, role, is_muted, is_pinned, last_read_at,
                    profile:profiles(id, username, avatar_url, display_name)
                  )
                `).in('id', convIds).order('updated_at', { ascending: false }),
                supabase.from('messages')
                  .select('id, conversation_id, sender_id, content, media_type, viewed_at, created_at')
                  .in('conversation_id', convIds)
                  .eq('is_deleted', false)
                  .order('created_at', { ascending: false })
                  .limit(100),
              ]);

              const hiddenIds = new Set((hiddenRes.data || []).map(h => h.conversation_id));
              const trashedIds = new Set((trashedRes.data || []).map(t => t.conversation_id));

              const lastMessageMap = new Map<string, any>();
              const unreadCountMap = new Map<string, number>();

              (msgsRes.data || []).forEach(msg => {
                if (!lastMessageMap.has(msg.conversation_id)) {
                  lastMessageMap.set(msg.conversation_id, msg);
                }
                const membership = membershipMap.get(msg.conversation_id);
                const lastReadAt = membership?.last_read_at || '1970-01-01';
                if (msg.sender_id !== profileId && msg.created_at > lastReadAt) {
                  unreadCountMap.set(msg.conversation_id, (unreadCountMap.get(msg.conversation_id) || 0) + 1);
                }
              });

              const result = (convsRes.data || [])
                .filter(conv => !hiddenIds.has(conv.id) && !trashedIds.has(conv.id))
                .map(conv => ({
                  ...conv,
                  last_message: lastMessageMap.get(conv.id) || null,
                  unread_count: unreadCountMap.get(conv.id) || 0,
                  _sortTime: lastMessageMap.get(conv.id)?.created_at || conv.updated_at,
                  _hasUnread: (unreadCountMap.get(conv.id) || 0) > 0,
                }))
                .sort((a: any, b: any) => {
                  const aPin = a.members?.find((m: any) => m.user_id === profileId)?.is_pinned;
                  const bPin = b.members?.find((m: any) => m.user_id === profileId)?.is_pinned;
                  if (aPin && !bPin) return -1;
                  if (!aPin && bPin) return 1;
                  if (aPin && bPin) return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
                  if (a._hasUnread && !b._hasUnread) return -1;
                  if (!a._hasUnread && b._hasUnread) return 1;
                  return new Date(b._sortTime).getTime() - new Date(a._sortTime).getTime();
                });
              
              queryClient.setQueryData(['dm-conversations', profileId], result);
              queryClient.setQueryData(['conversations', profileId], result);
            })(),
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
        animateTo(100, 'Ready!', true);
      } finally {
        clearTimeout(safetyTimeout);
      }
    };

    preload();
    
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [queryClient, updateStatus, animateTo]);

  return status;
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
