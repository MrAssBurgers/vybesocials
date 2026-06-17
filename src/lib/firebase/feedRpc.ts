import { getDocuments, where } from './firestoreDb';
import { listPosts, type PostWithAuthor } from './posts';

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
    reaction_type: null,
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
  let posts = await listPosts({
    type: opts.type,
    authorId: opts.authorId,
    excludeAuthorId: opts.authorId ? undefined : opts.excludeAuthorId,
    limit: fetchLimit,
  });

  if (opts.authorIds) {
    posts = posts.filter((p) => opts.authorIds!.has(p.author_id));
  }

  return posts.slice(opts.offset, opts.offset + opts.limit).map(postToFeedRow);
}

async function rpcGetPostsWithCounts(params: Record<string, unknown>): Promise<Record<string, unknown>[]> {
  return loadPostsSlice({
    type: (params.p_type as string | null) || undefined,
    authorId: (params.p_author_id as string | null) || undefined,
    excludeAuthorId: (params.p_user_id as string | null) || undefined,
    offset: Number(params.p_offset || 0),
    limit: Number(params.p_limit || 15),
  });
}

async function rpcGetRankedFeed(params: Record<string, unknown>): Promise<Record<string, unknown>[]> {
  const rows = await loadPostsSlice({
    type: (params.p_content_type as string | null) || undefined,
    excludeAuthorId: (params.p_user_id as string | null) || undefined,
    offset: Number(params.p_offset || 0),
    limit: Number(params.p_limit || 15),
  });
  return rows.sort((a, b) => {
    const score = (r: Record<string, unknown>) =>
      Number(r.like_count || 0) * 2 +
      Number(r.comment_count || 0) * 3 +
      Number(r.view_count || 0) * 0.1;
    return score(b) - score(a);
  });
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

  return loadPostsSlice({
    type: (params.p_type as string | null) || undefined,
    offset: Number(params.p_offset || 0),
    limit: Number(params.p_limit || 15),
    authorIds: friendIds,
  });
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
