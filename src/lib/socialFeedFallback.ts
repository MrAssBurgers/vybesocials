import type { Post } from '@/hooks/useInfinitePosts';
import { runFeedRpc } from '@/lib/firebase/feedRpc';
import type { SocialFeedInput, SocialFeedPage } from '@/lib/socialFeedService';

const PAGE_SIZE = 15;

/** A structured unavailable-implementation response; never infer this from text. */
export function missingSocialFeedFunction(error: { code?: string; name?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  // Structured failures take precedence over incidental text such as a missing
  // profile ID. Never turn permission, auth or validation errors into raw reads.
  const codes = [error.code, error.name].filter(Boolean).map(value => value!.toLowerCase().replace(/^functions\//, ''));
  return codes.length > 0 && codes.every(code => code === 'not-found' || code === 'unimplemented');
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
 * Legacy discovery candidates only. The caller must obtain current server
 * admission before displaying content; this query does not enforce audiences.
 */
export async function readClientSocialFeed(input: SocialFeedInput, guard: () => void): Promise<Omit<SocialFeedPage, 'leaseUntil'>> {
  guard();
  // The legacy query has no trustworthy locality proof, current follow
  // admission or personalized ranking. Do not relabel its general timeline.
  if (input.feed && input.feed !== 'discover') throw new Error('This feed is temporarily unavailable. Please retry shortly.');
  const offset = clientFeedOffset(input.cursor);
  if (offset === null) throw new Error('Your feed could not be refreshed.');
  const type = input.contentType ?? null;
  const viewer = input.expectedProfileId;
  const rows = await runFeedRpc('get_posts_with_counts', { p_type: type, p_user_id: viewer, p_offset: offset, p_limit: PAGE_SIZE });
  guard();
  const posts = rows.map(rowToPost).filter((post): post is Post => !!post);
  const nextCursor = rows.length >= PAGE_SIZE ? `c:${offset + PAGE_SIZE}` : null;
  return { posts, nextCursor };
}
