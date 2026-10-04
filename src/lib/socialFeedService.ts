import { validLocalArea, type LocalArea } from './localArea';
import { z } from 'zod';
import { invokeFunction } from '@/lib/firebase/functionsService';
import type { Post } from '@/hooks/useInfinitePosts';
import { missingSocialFeedFunction, readClientSocialFeed } from '@/lib/socialFeedFallback';

const id = z.string().min(1).max(1500).refine(value => !value.includes('/'));
const type = z.enum(['post', 'short', 'video']);
const feed = z.enum(['discover', 'personalized', 'following', 'local']);
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
const page = z.object({ ownerUid: id, viewerProfileId: id, contentType: type.nullable(), feed, area: z.custom<LocalArea>(validLocalArea).optional(), posts: z.array(post).max(20), nextCursor: cursor.nullable() }).strict();
export type SocialFeedInput = { expectedOwnerUid: string; expectedProfileId: string; contentType?: z.infer<typeof type>; cursor?: string; feed?: z.infer<typeof feed>; area?: LocalArea };
export type SocialFeedPage = { posts: Post[]; nextCursor: string | null };

const previewPost = post.omit({ reactionType: true, isBookmarked: true });
const previewInput = z.object({ expectedOwnerUid: id, expectedProfileId: id, postIds: z.array(id).min(1).max(20) }).strict();
const previewPage = z.object({ ownerUid: id, viewerProfileId: id, requestedPostIds: z.array(id).min(1).max(20), posts: z.array(previewPost).max(20) }).strict();
export type SocialPostPreview = z.infer<typeof previewPost>;
export type SocialPostPreviewsInput = z.infer<typeof previewInput>;

/** Batch known IDs; missing/inaccessible content never falls back to a stored message snapshot. */
export async function readSocialPostPreviews(input: SocialPostPreviewsInput, guard: () => void): Promise<SocialPostPreview[]> {
  guard();
  if (!previewInput.safeParse(input).success || new Set(input.postIds).size !== input.postIds.length) throw new Error('Choose between one and twenty distinct posts.');
  const response = await invokeFunction<unknown>('readSocialPostPreviews', input);
  guard();
  if (response.error) throw Object.assign(new Error(response.error.message || 'Shared posts could not be refreshed.'), { code: response.error.code });
  const parsed = previewPage.safeParse(response.data);
  if (!parsed.success) throw new Error('Shared post access could not be verified.');
  const result = parsed.data;
  if (result.ownerUid !== input.expectedOwnerUid || result.viewerProfileId !== input.expectedProfileId
    || JSON.stringify(result.requestedPostIds) !== JSON.stringify(input.postIds)
    || new Set(result.posts.map(row => row.id)).size !== result.posts.length
    || result.posts.some(row => !input.postIds.includes(row.id) || (!row.mediaUrl && (row.type !== 'post' || !row.caption.trim())))) {
    throw new Error('Shared post access could not be verified.');
  }
  return result.posts;
}

/** A denied or malformed read stays a failure. A missing callable uses the signed-in timeline. */
export async function readSocialFeed(input: SocialFeedInput, guard: () => void): Promise<SocialFeedPage> {
  guard();
  if (input.feed === 'local' ? !validLocalArea(input.area) : input.area !== undefined) throw new Error('Choose an approximate area for Local.');
  const response = await invokeFunction<unknown>('readSocialFeed', input);
  guard();
  if (response.error) {
    if (missingSocialFeedFunction(response.error)) return readClientSocialFeed(input, guard);
    throw Object.assign(new Error(response.error.message || 'Your feed could not be refreshed.'), { code: response.error.code || response.error.name });
  }
  const parsed = page.safeParse(response.data);
  if (!parsed.success) throw new Error('Your feed response could not be verified. Refresh and retry.');
  const result = parsed.data;
  if (result.ownerUid !== input.expectedOwnerUid || result.viewerProfileId !== input.expectedProfileId
    || result.contentType !== (input.contentType ?? null) || result.feed !== (input.feed ?? 'discover') || (input.cursor && result.nextCursor === input.cursor)
    || (input.feed === 'local' ? !validLocalArea(input.area) || !result.area || result.area.lat !== input.area.lat || result.area.lng !== input.area.lng : result.area !== undefined)
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
