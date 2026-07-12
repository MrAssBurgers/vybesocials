import type { QueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { getCachedCurrentProfile } from '@/lib/profileCache';
import { resolveProfileAvatarUrl } from '@/lib/profileAvatarCache';
import { prefetchDMConversations } from '@/lib/loadDMConversations';
import { setCachedUserLevel } from '@/lib/userLevelCache';
import { signAndPreloadFeedPosts, signAndPreloadProfileAvatar } from '@/lib/imagePreload';

function mapFeedRow(row: Record<string, unknown>) {
  return {
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
  };
}

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
    groupedMap.get(authorId)!.stories.push(story);
  }
  const groups = Array.from(groupedMap.values());
  groups.sort((a, b) => {
    if (a.user.id === profileId) return -1;
    if (b.user.id === profileId) return 1;
    return 0;
  });
  return groups;
}

function warmPersonalizedFeed(queryClient: QueryClient, profileId: string) {
  const feedKey = ['personalized-feed-v2', undefined, profileId, 0] as const;
  if (queryClient.getQueryData(feedKey)) return;

  void (async () => {
    const { data, error } = await db.rpc('get_ranked_feed_v2', {
      p_user_id: profileId,
      p_content_type: null,
      p_category: null,
      p_lat: null,
      p_lng: null,
      p_radius_miles: null,
      p_offset: 0,
      p_limit: 15,
    } as any);

    let rows = (!error && data?.length ? data : null) as any[] | null;
    if (!rows?.length) {
      const fallback = await db.rpc('get_posts_with_counts', {
        p_type: null,
        p_author_id: null,
        p_user_id: profileId,
        p_offset: 0,
        p_limit: 15,
      });
      if (!fallback.error && fallback.data?.length) rows = fallback.data as any[];
    }
    if (!rows?.length) return;

    const posts = rows.map(mapFeedRow);
    queryClient.setQueryData(feedKey, {
      pages: [{ posts, nextPage: posts.length >= 15 ? 1 : null }],
      pageParams: [0],
    });
    void signAndPreloadFeedPosts(posts, 8);
  })();
}

function warmFollowingFeed(queryClient: QueryClient, profileId: string) {
  const feedKey = ['infinite-following-posts', undefined, profileId, 0] as const;
  if (queryClient.getQueryData(feedKey)) return;

  void db
    .rpc('get_following_posts_with_counts', {
      p_user_id: profileId,
      p_type: null,
      p_offset: 0,
      p_limit: 15,
    })
    .then(({ data, error }) => {
      if (error || !data?.length) return;
      const posts = (data as any[])
        .map(mapFeedRow)
        .filter((p) => p.author?.id !== profileId);
      if (posts.length === 0) return;
      queryClient.setQueryData(feedKey, {
        pages: [{ posts, nextPage: posts.length >= 15 ? 1 : null }],
        pageParams: [0],
      });
      void signAndPreloadFeedPosts(posts, 8);
    });
}

function warmStories(queryClient: QueryClient, profileId: string) {
  const key = ['stories', profileId] as const;
  if (queryClient.getQueryData(key)) return;

  void db
    .from('stories')
    .select(`*, author:profiles!stories_author_id_fkey(id, username, avatar_url, display_name)`)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(30)
    .then(({ data }) => {
      if (!data?.length) return;
      const storyGroups = processStoriesIntoGroups(data, profileId);
      queryClient.setQueryData(key, storyGroups);
      const storyPosts = data.map((s: any) => ({
        media_url: s.media_url,
        thumbnail_url: s.thumbnail_url,
        author: { avatar_url: s.author?.avatar_url },
      }));
      void signAndPreloadFeedPosts(storyPosts, 6);
    });
}

function warmNotifications(queryClient: QueryClient, profileId: string) {
  const key = ['notifications', profileId] as const;
  if (queryClient.getQueryData(key)) return;

  void db
    .from('notifications')
    .select(`*, actor:profiles!notifications_actor_id_fkey(id, username, avatar_url)`)
    .eq('user_id', profileId)
    .order('created_at', { ascending: false })
    .limit(15)
    .then(({ data }) => {
      if (data) queryClient.setQueryData(key, data);
    });
}

function warmUserMeta(queryClient: QueryClient, uid: string, profileId: string) {
  void Promise.allSettled([
    db
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
    db
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
        await db.rpc('ensure_user_level');
        const { data: retryRow } = await db
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
    db
      .from('dna_agent_settings')
      .select('*')
      .eq('user_id', uid)
      .maybeSingle()
      .then(({ data: dnaRow }) => {
        if (dnaRow) queryClient.setQueryData(['dna-agent-settings', uid], dnaRow);
      }),
  ]);
}

function signCachedProfileMedia() {
  const cached = getCachedCurrentProfile();
  if (!cached?.id) return;
  const avatar = resolveProfileAvatarUrl(cached.id, cached.avatar_url);
  if (avatar) void signAndPreloadProfileAvatar(avatar, 192);
}

/**
 * Single boot warm path — feeds, DMs, stories, notifications, user meta.
 * Safe to call multiple times; skips keys that already have cache.
 */
export function warmHomeCachesForProfile(
  queryClient: QueryClient,
  uid: string,
  profileId: string,
  profileRow?: Record<string, unknown> | null,
) {
  if (profileRow) {
    queryClient.setQueryData(['profile', profileId], profileRow);
    const avatar = resolveProfileAvatarUrl(
      profileId,
      (profileRow.avatar_url as string | null | undefined) ?? null,
    );
    if (avatar) void signAndPreloadProfileAvatar(avatar, 192);
  }

  signCachedProfileMedia();
  warmPersonalizedFeed(queryClient, profileId);
  warmFollowingFeed(queryClient, profileId);
  void prefetchDMConversations(queryClient, profileId, uid);
  warmStories(queryClient, profileId);
  warmNotifications(queryClient, profileId);
  warmUserMeta(queryClient, uid, profileId);
}

/**
 * Resolve session + profile, then warm all home caches (non-blocking).
 */
export async function warmHomeCaches(queryClient: QueryClient): Promise<void> {
  try {
    signCachedProfileMedia();

    const cached = getCachedCurrentProfile();
    if (cached?.id) {
      const { data: { session } } = await db.auth.getSession();
      const uid = session?.user?.id || cached.user_id || '';
      if (uid) {
        warmHomeCachesForProfile(queryClient, uid, cached.id, {
          id: cached.id,
          user_id: uid,
          username: cached.username,
          display_name: cached.display_name,
          avatar_url: cached.avatar_url,
          bio: cached.bio || '',
        });
        if (session?.user) return;
      }
    }

    const { data: { session } } = await db.auth.getSession();
    if (!session?.user) return;
    const uid = session.user.id;

    if (cached?.id) {
      warmHomeCachesForProfile(queryClient, uid, cached.id);
      return;
    }

    const { data: profileData } = await db
      .from('profiles')
      .select('*')
      .eq('user_id', uid)
      .maybeSingle();

    if (profileData?.id) {
      warmHomeCachesForProfile(queryClient, uid, profileData.id, profileData);
    }
  } catch {
    /* non-blocking */
  }
}
