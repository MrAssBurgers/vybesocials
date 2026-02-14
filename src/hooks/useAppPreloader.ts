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

// Granular preload steps with descriptive labels
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

export function useAppPreloader() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<PreloadStatus>({
    step: 'Waking up...',
    progress: 0,
    isComplete: false,
  });
  const hasStarted = useRef(false);

  const updateStatus = useCallback((stepKey: string, partialProgress?: number) => {
    const stepIndex = PRELOAD_STEPS.findIndex(s => s.key === stepKey);
    if (stepIndex === -1) return;

    const step = PRELOAD_STEPS[stepIndex];
    const progressBefore = PRELOAD_STEPS.slice(0, stepIndex).reduce((acc, s) => acc + s.weight, 0);
    const stepProgress = partialProgress !== undefined ? (step.weight * partialProgress) : step.weight;
    
    setStatus({
      step: step.label,
      progress: Math.min(Math.round(progressBefore + stepProgress), 100),
      isComplete: stepKey === 'ready',
    });
  }, []);

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

    // Safety timeout - 4 seconds max (allows real data to load before forcing)
    const safetyTimeout = setTimeout(() => {
      console.warn('[Preloader] Safety timeout reached, forcing complete');
      setStatus({ step: 'Ready!', progress: 100, isComplete: true });
    }, 4000);

    const preload = async () => {
      const startTime = performance.now();
      
      try {
        // Step 1: Initialize
        updateStatus('init');

        // Step 2: Check authentication with timeout
        updateStatus('auth');
        
        let session = null;
        try {
          const authResult = await Promise.race([
            supabase.auth.getSession(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Auth timeout')), 1000))
          ]) as { data: { session: any } };
          session = authResult.data.session;
        } catch {
          console.warn('[Preloader] Auth check failed, continuing as guest');
        }

        if (!session?.user) {
          // Guest mode - load public content in parallel
          updateStatus('feed');
          
          const [feedResult, clipsResult] = await Promise.allSettled([
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
          ]);

          // Cache feed
          if (feedResult.status === 'fulfilled' && feedResult.value.data) {
            const posts = feedResult.value.data as any[];
            cacheFeedData(queryClient, posts, null, 'feed_post');
            
            // Pre-sign URLs
            const urlsToSign = posts.flatMap(p => [p.media_url, p.author_avatar_url, p.thumbnail_url]).filter(Boolean);
            batchSignUrls(urlsToSign).catch(() => {});
          }

          // Cache clips
          if (clipsResult.status === 'fulfilled' && clipsResult.value.data) {
            const clips = clipsResult.value.data as any[];
            cacheFeedData(queryClient, clips, null, 'clip');
            
            const urlsToSign = clips.flatMap(p => [p.media_url, p.author_avatar_url, p.thumbnail_url]).filter(Boolean);
            batchSignUrls(urlsToSign).catch(() => {});
          }

          console.log(`[Preloader] Guest mode complete - ${(performance.now() - startTime).toFixed(0)}ms`);
          updateStatus('ready');
          return;
        }

        const uid = session.user.id;

        // Step 3: Load profile first (fast, needed for other queries)
        updateStatus('profile');
        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('user_id', uid)
          .maybeSingle();

        const profileId = profileData?.id;
        if (profileData) {
          queryClient.setQueryData(['profile', profileId], profileData);
        }

        // Step 4: Load feed posts, clips, AND social data ALL in parallel for speed
        updateStatus('feed');

        const [feedResult, clipsResult, conversationsResult, notificationsResult, friendRequestsResult, storiesResult, ownProfileResult] = await Promise.allSettled([
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
          // Full DM conversations with members + last messages
          (async () => {
            const { data: membershipData } = await supabase
              .from('conversation_members')
              .select('conversation_id, last_read_at, is_pinned, is_muted')
              .eq('user_id', profileId);

            if (!membershipData?.length) return [];

            const convIds = membershipData.map(m => m.conversation_id);
            const membershipMap = new Map(membershipData.map(m => [m.conversation_id, m]));

            // Fetch hidden + trashed in parallel
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
              supabase.from('messages').select('*')
                .in('conversation_id', convIds)
                .eq('is_deleted', false)
                .order('created_at', { ascending: false })
                .limit(500),
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

            return (convsRes.data || [])
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
          })(),
          // Notifications
          supabase
            .from('notifications')
            .select(`*, actor:profiles!notifications_actor_id_fkey(id, username, avatar_url)`)
            .eq('user_id', profileId)
            .order('created_at', { ascending: false })
            .limit(15),
          // Friend requests
          supabase
            .from('friend_requests')
            .select(`*, sender:profiles!friend_requests_sender_id_fkey(id, username, display_name, avatar_url)`)
            .eq('receiver_id', profileId)
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
            .limit(10),
          // Stories
          supabase
            .from('stories')
            .select(`*, author:profiles!stories_author_id_fkey(id, username, avatar_url)`)
            .gt('expires_at', new Date().toISOString())
            .order('created_at', { ascending: false })
            .limit(30),
          // Own profile stats for profile page
          (async () => {
            const [followerCount, followingCount, postCount] = await Promise.all([
              supabase.from('follows').select('id', { count: 'exact', head: true }).eq('following_id', profileId),
              supabase.from('follows').select('id', { count: 'exact', head: true }).eq('follower_id', profileId),
              supabase.from('posts').select('id', { count: 'exact', head: true }).eq('author_id', profileId),
            ]);
            return {
              ...profileData,
              follower_count: followerCount.count || 0,
              following_count: followingCount.count || 0,
              post_count: postCount.count || 0,
              is_following: false,
            };
          })(),
        ]);

        // Cache feed
        if (feedResult.status === 'fulfilled' && feedResult.value.data) {
          const posts = feedResult.value.data as any[];
          cacheFeedData(queryClient, posts, profileId, null); // Cache as general feed
          
          // Non-blocking URL signing
          const urlsToSign = posts.flatMap(p => [p.media_url, p.author_avatar_url, p.thumbnail_url]).filter(Boolean);
          batchSignUrls(urlsToSign).catch(() => {});
        }

        updateStatus('clips');

        // Cache clips
        if (clipsResult.status === 'fulfilled' && clipsResult.value.data) {
          const clips = clipsResult.value.data as any[];
          cacheFeedData(queryClient, clips, profileId, 'short');
          
          const urlsToSign = clips.flatMap(p => [p.media_url, p.author_avatar_url, p.thumbnail_url]).filter(Boolean);
          batchSignUrls(urlsToSign).catch(() => {});
        }

        updateStatus('social');

        // Cache conversations - now a full array, not {data} wrapper
        if (conversationsResult.status === 'fulfilled') {
          const convData = conversationsResult.value;
          // Cache under BOTH keys so useDMConversations picks it up instantly
          queryClient.setQueryData(['dm-conversations', profileId], convData);
          queryClient.setQueryData(['conversations', profileId], convData);
        }

        // Cache notifications
        if (notificationsResult.status === 'fulfilled' && notificationsResult.value.data) {
          queryClient.setQueryData(['notifications', profileId], notificationsResult.value.data);
        }

        // Cache friend requests
        if (friendRequestsResult.status === 'fulfilled' && friendRequestsResult.value.data) {
          queryClient.setQueryData(['friend-requests', profileId], friendRequestsResult.value.data);
        }

        // Cache stories and pre-sign URLs (must include profileId in key)
        if (storiesResult.status === 'fulfilled' && storiesResult.value.data) {
          const stories = storiesResult.value.data;
          // Process stories into grouped format matching useStories output
          const storyGroups = processStoriesIntoGroups(stories, profileId);
          queryClient.setQueryData(['stories', profileId], storyGroups);
          
          const storyUrls = stories.flatMap((s: any) => [s.media_url, s.author?.avatar_url]).filter(Boolean);
          batchSignUrls(storyUrls).catch(() => {});
        }

        // Cache own profile with stats for instant profile page
        if (ownProfileResult.status === 'fulfilled') {
          queryClient.setQueryData(['profile-by-id', profileId, profileId], ownProfileResult.value);
        }

        // Step 6: Final optimizations
        updateStatus('final');

        // Pre-fetch user's own posts for profile view (non-blocking)
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
        });

        // Log performance
        console.log(`[Preloader] Complete - ${(performance.now() - startTime).toFixed(0)}ms`);
        
        // Preload all route components for instant navigation
        preloadCriticalRoutes();
        setTimeout(() => preloadSecondaryRoutes(), 2000);
        
        updateStatus('ready');

      } catch (error) {
        console.error('[Preloader] Error:', error);
        setStatus({ step: 'Ready!', progress: 100, isComplete: true });
      } finally {
        clearTimeout(safetyTimeout);
      }
    };

    preload();
  }, [queryClient, updateStatus]);

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
