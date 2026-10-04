import { useInfiniteQuery, useMutation } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { useBlockedUserIds } from '@/hooks/useBlockedUsers';
import { useFeedMuteFilter } from '@/hooks/useFeedMuteFilter';
import type { Post } from '@/hooks/useInfinitePosts';

/**
 * useRankedFeed — production ranking algorithm
 *
 * Calls `get_ranked_feed_v2`, which merges the cron-computed `ranking_score`
 * (content quality + engagement velocity + creator level + freshness, minus
 * penalties, multiplied by a soft-log level cap) with a per-viewer
 * personal_match score (interest overlap + prior interactions with the
 * creator) and applies a diversity cap so the same creator never dominates
 * a page.
 *
 * Works for Clips ('short'), Posts ('post'), Explore (all types), Local
 * (pass lat/lng/radius_miles), and Search (pass category tag).
 */
const PAGE_SIZE = 20;

function transform(row: any): Post {
  return {
    id: row.id,
    type: row.type,
    media_url: row.media_url,
    thumbnail_url: row.thumbnail_url,
    caption: row.caption || '',
    tags: row.tags || [],
    created_at: row.created_at,
    is_pinned: !!row.is_pinned,
    author: {
      id: row.author_id,
      username: row.author_username,
      avatar_url: row.author_avatar_url,
    },
    like_count: Number(row.like_count) || 0,
    comment_count: Number(row.comment_count) || 0,
    is_liked: !!row.is_liked,
    is_bookmarked: !!row.is_bookmarked,
    reaction_type: row.reaction_type || null,
    view_count: Number(row.view_count) || 0,
  };
}

export interface RankedFeedOptions {
  contentType?: 'short' | 'post' | 'video' | null;
  category?: string | null;
  lat?: number | null;
  lng?: number | null;
  radiusMiles?: number | null;
}

export function useRankedFeed(opts: RankedFeedOptions = {}) {
  const profileId = useAuthProfileId();
  const blockedIds = useBlockedUserIds();

  const query = useInfiniteQuery({
    queryKey: [
      'ranked-feed-v2',
      profileId,
      opts.contentType ?? null,
      opts.category ?? null,
      opts.lat ?? null,
      opts.lng ?? null,
      opts.radiusMiles ?? null,
      blockedIds.length,
    ],
    enabled: !!profileId,
    networkMode: 'always',
    queryFn: async ({ pageParam = 0 }) => {
      const offset = (pageParam as number) * PAGE_SIZE;
      const { data, error } = await db.rpc('get_ranked_feed_v2', {
        p_user_id: profileId!,
        p_content_type: opts.contentType ?? null,
        p_category: opts.category ?? null,
        p_lat: opts.lat ?? null,
        p_lng: opts.lng ?? null,
        p_radius_miles: opts.radiusMiles ?? null,
        p_offset: offset,
        p_limit: PAGE_SIZE,
      } as any);
      if (error) throw error;
      const posts = (data || []).map(transform);
      return {
        posts,
        nextPage: posts.length >= PAGE_SIZE ? (pageParam as number) + 1 : null,
      };
    },
    getNextPageParam: (last) => last.nextPage,
    initialPageParam: 0,
    staleTime: 5 * 60_000,
    gcTime: 1000 * 60 * 60 * 24 * 14,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    placeholderData: (prev) => prev,
    retry: 2,
  });
  return useFeedMuteFilter(query);
}

/**
 * Record a ranking-affecting interaction (skip, complete, rewatch, report,
 * follow_creator, profile_tap). Idempotent per (user, post, type) thanks to
 * the unique constraint on user_interactions.
 */
export function useRecordRankingSignal() {
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async ({
      postId,
      type,
      durationSeconds = 0,
    }: {
      postId: string;
      type: 'skip' | 'complete' | 'rewatch' | 'report' | 'follow_creator' | 'profile_tap';
      durationSeconds?: number;
    }) => {
      if (!profile?.id) return;
      const { error } = await db.from('user_interactions').upsert(
        {
          user_id: profile.id,
          post_id: postId,
          interaction_type: type,
          duration_seconds: durationSeconds,
          created_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,post_id,interaction_type' },
      );
      if (error) throw error;
    },
  });
}

/** Bump impression count atomically. Fire when a post enters the viewport. */
export function bumpImpression(postId: string) {
  return db.rpc('bump_post_impression', { p_post_id: postId } as any);
}
