import { z } from 'zod';
import { invokeFunction } from '@/lib/firebase/functionsService';
import type { Post } from '@/hooks/useInfinitePosts';

const id = z.string().min(1).max(1500).refine(value => !value.includes('/'));
const type = z.enum(['post', 'short', 'video']);
const feed = z.enum(['discover', 'personalized', 'following']);
const cursor = z.string().regex(/^[a-f0-9]{48}$/);
const url = z.string().max(8192).url().refine(value => {
  try { const parsed = new URL(value); return parsed.protocol === 'https:' && !parsed.username && !parsed.password; } catch { return false; }
});
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const post = z.object({
  id, type, caption: z.string().max(10000), createdAt: z.string().datetime(),
  mediaUrl: url.nullable(), mediaUrls: z.array(url).max(20), thumbnailUrl: url.nullable(),
  ageRating: z.enum(['safe', '13+', '18+', 'unrated']), tags: z.array(z.string().max(100)).max(30),
  likeCount: count, commentCount: count, viewCount: count, isPinned: z.boolean(), isBookmarked: z.boolean(),
  reactionType: z.enum(['like', 'love', 'care', 'haha', 'wow', 'sad', 'angry']).nullable(),
  author: z.object({ id, username: z.string().min(1).max(100).refine(value => !!value.trim()), displayName: z.string().max(200).nullable(), avatarUrl: url.nullable() }).strict(),
}).strict();
const page = z.object({ ownerUid: id, viewerProfileId: id, contentType: type.nullable(), feed, posts: z.array(post).max(20), nextCursor: cursor.nullable() }).strict();
export type SocialFeedInput = { expectedOwnerUid: string; expectedProfileId: string; contentType?: z.infer<typeof type>; cursor?: string; feed?: z.infer<typeof feed> };
export type SocialFeedPage = { posts: Post[]; nextCursor: string | null };

/** No legacy RPC or cached-data fallback: a failed current read must remain a failure. */
export async function readSocialFeed(input: SocialFeedInput, guard: () => void): Promise<SocialFeedPage> {
  guard();
  const response = await invokeFunction<unknown>('readSocialFeed', input);
  guard();
  if (response.error) throw Object.assign(new Error(response.error.message || 'Your feed could not be refreshed.'), { code: response.error.code });
  const parsed = page.safeParse(response.data);
  if (!parsed.success) throw new Error('Your feed response could not be verified. Refresh and retry.');
  const result = parsed.data;
  if (result.ownerUid !== input.expectedOwnerUid || result.viewerProfileId !== input.expectedProfileId
    || result.contentType !== (input.contentType ?? null) || result.feed !== (input.feed ?? 'discover') || (input.cursor && result.nextCursor === input.cursor)
    || new Set(result.posts.map(row => row.id)).size !== result.posts.length
    || result.posts.some(row => (input.contentType && row.type !== input.contentType)
      || (!row.mediaUrl && (row.type !== 'post' || !row.caption.trim())))) {
    throw new Error('Your feed access could not be verified. Refresh and retry.');
  }
  return { nextCursor: result.nextCursor, posts: result.posts.map(row => ({
    id: row.id, type: row.type, caption: row.caption, created_at: row.createdAt, tags: row.tags,
    media_url: row.mediaUrl ?? '', media_urls: row.mediaUrls, thumbnail_url: row.thumbnailUrl, age_rating: row.ageRating,
    is_pinned: row.isPinned, like_count: row.likeCount, comment_count: row.commentCount, view_count: row.viewCount,
    is_liked: row.reactionType !== null, reaction_type: row.reactionType, is_bookmarked: row.isBookmarked,
    author: { id: row.author.id, username: row.author.username, avatar_url: row.author.avatarUrl },
  })) };
}
