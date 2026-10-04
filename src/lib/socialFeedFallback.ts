import type { Post } from '@/hooks/useInfinitePosts';
import { runFeedRpc } from '@/lib/firebase/feedRpc';
import type { SocialFeedInput, SocialFeedPage } from '@/lib/socialFeedService';

const PAGE_SIZE = 15;

/** Callable missing from production (HTTP 404 / functions/not-found). */
export function missingSocialFeedFunction(error: { code?: string; name?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  const code = `${error.code || ''} ${error.name || ''}`.toLowerCase();
  if (/\bnot[-_ ]?found\b/.test(code) || code.includes('unimplemented')) return true;
  const message = (error.message || '').toLowerCase();
  return message.includes('not found') || message.includes('not-found') || message.includes('404') || message.includes('does not exist');
}

export function clientFeedOffset(cursor?: string): number | null {
  if (!cursor) return 0;
  const match = /^c:(\d+)$/.exec(cursor);
  if (!match) return null;
  const offset = Number(match[1]);
  return Number.isSafeInteger(offset) && offset >= 0 ? offset : null;
}

function hiddenRow(row: Record<string, unknown>): boolean {
  return !!(row.deleted_at || row.is_deleted || row.is_hidden || row.is_removed || row.removed_at);
}

function rowToPost(row: Record<string, unknown>): Post | null {
  if (hiddenRow(row)) return null;
  const id = typeof row.id === 'string' ? row.id : '';
  const authorId = typeof row.author_id === 'string' ? row.author_id : '';
  if (!id || !authorId || id.includes('/') || authorId.includes('/')) return null;
  const username = typeof row.author_username === 'string' && row.author_username.trim()
    ? row.author_username
    : `user_${authorId.slice(0, 8)}`;
  const tags = Array.isArray(row.tags) ? row.tags.filter((tag): tag is string => typeof tag === 'string').slice(0, 30) : [];
  return {
    id,
    type: row.type === 'short' || row.type === 'video' ? row.type : 'post',
    caption: typeof row.caption === 'string' ? row.caption : '',
    created_at: typeof row.created_at === 'string' ? row.created_at : new Date(0).toISOString(),
    tags,
    media_url: typeof row.media_url === 'string' ? row.media_url : '',
    thumbnail_url: typeof row.thumbnail_url === 'string' ? row.thumbnail_url : null,
    is_pinned: row.is_pinned === true,
    like_count: Number(row.like_count) || 0,
    comment_count: Number(row.comment_count) || 0,
    view_count: Number(row.view_count) || 0,
    is_liked: row.is_liked === true,
    is_bookmarked: row.is_bookmarked === true,
    reaction_type: typeof row.reaction_type === 'string' ? row.reaction_type : null,
    author: {
      id: authorId,
      username,
      avatar_url: typeof row.author_avatar_url === 'string' ? row.author_avatar_url : null,
    },
  };
}

/**
 * Production does not have readSocialFeed deployed. Read the same signed-in
 * timeline the app used before that callable, so Home is not an empty error.
 */
export async function readClientSocialFeed(input: SocialFeedInput, guard: () => void): Promise<SocialFeedPage> {
  guard();
  const offset = clientFeedOffset(input.cursor);
  if (offset === null) throw new Error('Your feed could not be refreshed.');
  const type = input.contentType ?? null;
  const viewer = input.expectedProfileId;
  const rpc = input.feed === 'following' ? 'get_following_posts_with_counts' : 'get_posts_with_counts';
  const params = input.feed === 'following'
    ? { p_user_id: viewer, p_type: type, p_offset: offset, p_limit: PAGE_SIZE }
    : { p_type: type, p_user_id: viewer, p_offset: offset, p_limit: PAGE_SIZE };
  const rows = await runFeedRpc(rpc, params);
  guard();
  const posts = rows.map(rowToPost).filter((post): post is Post => !!post);
  const nextCursor = rows.length >= PAGE_SIZE ? `c:${offset + PAGE_SIZE}` : null;
  return { posts, nextCursor };
}
