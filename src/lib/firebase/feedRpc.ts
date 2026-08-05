import { getDocuments, where } from './firestoreDb';
import { listPosts, type PostWithAuthor } from './posts';
import { resolveAuthorIds } from '@/lib/dmMembershipRepair';
import type { ReactionType } from '@/lib/reactions';
import {
  DEFAULT_FEED_MOOD_WEIGHTS,
  getFeedMoodForReaction,
  type FeedMood,
} from '@/lib/reactionMoods';

const FEED_RPC_NAMES = new Set([
  'get_posts_with_counts',
  'get_ranked_feed_v2',
  'get_following_posts_with_counts',
  'get_trending_feed',
  'get_local_posts',
]);

export function isFeedRpc(name: string): boolean {
  return FEED_RPC_NAMES.has(name);
}

/** Unwrap Cloud Function payloads and reject stub/not-ported bodies. */
export function normalizeRpcFeedRows(data: unknown): Record<string, unknown>[] | null {
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (!data || typeof data !== 'object') return null;
  const obj = data as Record<string, unknown>;
  if (obj.error === 'not_yet_ported' || obj.ok === false) return null;
  if (Array.isArray(obj.posts)) return obj.posts as Record<string, unknown>[];
  return null;
}

function postToFeedRow(post: PostWithAuthor): Record<string, unknown> {
  const authorId = post.author_id || post.author?.id || '';
  const username =
    post.author?.username ||
    (authorId ? `user_${authorId.slice(0, 8)}` : 'unknown');
  return {
    id: post.id,
    type: post.type,
    media_url: post.media_url,
    thumbnail_url: post.thumbnail_url ?? null,
    caption: post.caption || '',
    tags: post.tags || [],
    created_at: post.created_at,
    is_pinned: post.is_pinned ?? false,
    view_count: post.view_count ?? 0,
    author_id: authorId,
    author_username: username,
    author_avatar_url: post.author?.avatar_url ?? null,
    like_count: post.like_count ?? 0,
    comment_count: post.comment_count ?? 0,
    is_liked: post.is_liked ?? false,
    is_bookmarked: post.is_bookmarked ?? false,
    reaction_type: post.reaction_type ?? null,
  };
}

async function loadPostsSlice(opts: {
  type?: string;
  authorId?: string;
  excludeAuthorId?: string;
  offset: number;
  limit: number;
  authorIds?: Set<string>;
}): Promise<Record<string, unknown>[]> {
  const fetchLimit = Math.min(Math.max(opts.offset + opts.limit + 30, opts.limit), 200);
  let posts: PostWithAuthor[];

  if (opts.authorId) {
    const ids = await resolveAuthorIds(opts.authorId);
    const seen = new Set<string>();
    posts = [];
    for (const aid of ids) {
      const batch = await listPosts({
        type: opts.type,
        authorId: aid,
        limit: fetchLimit,
      });
      for (const p of batch) {
        if (!seen.has(p.id)) {
          seen.add(p.id);
          posts.push(p);
        }
      }
    }
    posts.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  } else {
    posts = await listPosts({
      type: opts.type,
      authorId: undefined,
      excludeAuthorId: opts.authorId ? undefined : opts.excludeAuthorId,
      limit: fetchLimit,
    });
  }

  if (opts.authorIds) {
    const expanded = new Set<string>();
    for (const id of opts.authorIds) {
      for (const aid of await resolveAuthorIds(id)) expanded.add(aid);
    }
    posts = posts.filter((p) => expanded.has(p.author_id));
  }

  return posts.slice(opts.offset, opts.offset + opts.limit).map(postToFeedRow);
}

async function rpcGetPostsWithCounts(params: Record<string, unknown>): Promise<Record<string, unknown>[]> {
  return loadPostsSlice({
    type: (params.p_type as string | null) || undefined,
    authorId: (params.p_author_id as string | null) || undefined,
    offset: Number(params.p_offset || 0),
    limit: Number(params.p_limit || 15),
  });
}

async function rpcGetRankedFeed(params: Record<string, unknown>): Promise<Record<string, unknown>[]> {
  const userId = String(params.p_user_id || '');
  const rows = await loadPostsSlice({
    type: (params.p_content_type as string | null) || undefined,
    offset: Number(params.p_offset || 0),
    limit: Number(params.p_limit || 15),
  });

  if (!userId) {
    return rows.sort((a, b) => engagementScore(b) - engagementScore(a));
  }

  const userMoods = await loadUserFeedMoodWeights(userId);
  const postIds = rows.map((r) => String(r.id));
  const postMoods = await loadPostMoodSignals(postIds);

  return rows
    .map((row) => {
      const base = engagementScore(row);
      const moodMatch = moodMatchScore(String(row.id), userMoods, postMoods);
      return { ...row, _rank: base + moodMatch * 2 };
    })
    .sort((a, b) => Number(b._rank || 0) - Number(a._rank || 0))
    .map(({ _rank, ...row }) => row);
}

function engagementScore(row: Record<string, unknown>): number {
  return (
    Number(row.like_count || 0) * 2 +
    Number(row.comment_count || 0) * 3 +
    Number(row.view_count || 0) * 0.1
  );
}

async function loadUserFeedMoodWeights(userId: string): Promise<Map<FeedMood, number>> {
  const likes = await getDocuments<{ reaction_type?: string }>('likes', [
    where('user_id', '==', userId),
  ]);
  const weights = new Map<FeedMood, number>(
    Object.entries(DEFAULT_FEED_MOOD_WEIGHTS) as [FeedMood, number][],
  );

  for (const like of likes) {
    const raw = like.reaction_type as ReactionType | undefined;
    if (!raw) continue;
    const mood = getFeedMoodForReaction(raw);
    weights.set(mood, (weights.get(mood) || 0) + 1);
  }
  return weights;
}

async function loadPostMoodSignals(
  postIds: string[],
): Promise<Map<string, Map<FeedMood, number>>> {
  const byPost = new Map<string, Map<FeedMood, number>>();
  if (!postIds.length) return byPost;

  const signals = await getDocuments<{ post_id?: string; mood?: string; signal_strength?: number }>(
    'post_mood_signals',
    [where('post_id', 'in', postIds.slice(0, 10))],
  );

  for (const signal of signals) {
    const postId = signal.post_id;
    const mood = signal.mood as FeedMood | undefined;
    if (!postId || !mood) continue;
    const map = byPost.get(postId) || new Map<FeedMood, number>();
    map.set(mood, Number(signal.signal_strength || 0));
    byPost.set(postId, map);
  }

  if (postIds.length > 10) {
    const rest = await getDocuments<{ post_id?: string; mood?: string; signal_strength?: number }>(
      'post_mood_signals',
      [where('post_id', 'in', postIds.slice(10, 20))],
    );
    for (const signal of rest) {
      const postId = signal.post_id;
      const mood = signal.mood as FeedMood | undefined;
      if (!postId || !mood) continue;
      const map = byPost.get(postId) || new Map<FeedMood, number>();
      map.set(mood, Number(signal.signal_strength || 0));
      byPost.set(postId, map);
    }
  }

  return byPost;
}

function moodMatchScore(
  postId: string,
  userMoods: Map<FeedMood, number>,
  postMoods: Map<string, Map<FeedMood, number>>,
): number {
  const signals = postMoods.get(postId);
  if (!signals) return 0;
  let score = 0;
  for (const [mood, strength] of signals) {
    score += strength * (userMoods.get(mood) || 0);
  }
  return score;
}

async function rpcGetFollowingPosts(params: Record<string, unknown>): Promise<Record<string, unknown>[]> {
  const userId = String(params.p_user_id || '');
  if (!userId) return [];

  const [asSender, asReceiver] = await Promise.all([
    getDocuments<{ receiver_id?: string }>('friend_requests', [
      where('sender_id', '==', userId),
      where('status', '==', 'accepted'),
    ]),
    getDocuments<{ sender_id?: string }>('friend_requests', [
      where('receiver_id', '==', userId),
      where('status', '==', 'accepted'),
    ]),
  ]);

  const friendIds = new Set<string>();
  for (const row of asSender) {
    if (row.receiver_id) friendIds.add(row.receiver_id);
  }
  for (const row of asReceiver) {
    if (row.sender_id) friendIds.add(row.sender_id);
  }
  if (friendIds.size === 0) return [];

  // Query each friend's posts directly. Global-fetch-then-filter missed older
  // friend posts and caused For You to flicker/empty after adding a friend.
  const offset = Number(params.p_offset || 0);
  const limit = Number(params.p_limit || 15);
  const type = (params.p_type as string | null) || undefined;
  const perFriendLimit = Math.min(Math.max(offset + limit, limit), 40);
  const seen = new Set<string>();
  const merged: PostWithAuthor[] = [];

  const friendList = [...friendIds].slice(0, 40);
  const chunks: string[][] = [];
  for (let i = 0; i < friendList.length; i += 5) {
    chunks.push(friendList.slice(i, i + 5));
  }

  for (const chunk of chunks) {
    const batches = await Promise.all(
      chunk.map(async (friendId) => {
        const authorIds = await resolveAuthorIds(friendId);
        const posts: PostWithAuthor[] = [];
        for (const aid of authorIds) {
          const batch = await listPosts({
            type,
            authorId: aid,
            limit: perFriendLimit,
          });
          posts.push(...batch);
        }
        return posts;
      }),
    );
    for (const batch of batches) {
      for (const post of batch) {
        if (seen.has(post.id)) continue;
        seen.add(post.id);
        merged.push(post);
      }
    }
  }

  merged.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  return merged.slice(offset, offset + limit).map(postToFeedRow);
}

async function rpcGetTrendingFeed(params: Record<string, unknown>): Promise<Record<string, unknown>[]> {
  const page = Number(params.p_page || 0);
  const pageSize = Number(params.p_page_size || 15);
  return loadPostsSlice({
    type: (params.p_content_type as string | null) || undefined,
    offset: page * pageSize,
    limit: pageSize,
  });
}

async function rpcGetLocalPosts(params: Record<string, unknown>): Promise<Record<string, unknown>[]> {
  // Geo filter not ported client-side yet — return recent posts so Local tab isn't empty.
  return loadPostsSlice({
    excludeAuthorId: (params.p_user_id as string | null) || undefined,
    offset: Number(params.p_offset || 0),
    limit: Number(params.p_limit || 15),
  });
}

export async function runFeedRpc(
  name: string,
  params: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
  switch (name) {
    case 'get_posts_with_counts':
      return rpcGetPostsWithCounts(params);
    case 'get_ranked_feed_v2':
      return rpcGetRankedFeed(params);
    case 'get_following_posts_with_counts':
      return rpcGetFollowingPosts(params);
    case 'get_trending_feed':
      return rpcGetTrendingFeed(params);
    case 'get_local_posts':
      return rpcGetLocalPosts(params);
    default:
      return [];
  }
}
