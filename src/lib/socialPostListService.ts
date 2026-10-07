import { z } from 'zod';
import { invokeFunction } from '@/lib/firebase/functionsService';
import { socialPostSchema, socialPostToPost } from './socialFeedService';
import { readCommentCounts } from './commentService';
const id = z.string().min(1).max(128).refine(value => !value.includes('/'));
const documentId = z.string().min(1).max(1500).refine(value => !value.includes('/') && new TextEncoder().encode(value).byteLength <= 1500);
const cursor = z.string().regex(/^[a-f0-9]{48}$/);
const selection = z.object({ scope: z.enum(['profile', 'saved', 'sound', 'filter', 'search', 'tagged', 'recent']), targetId: id.nullable(), search: z.string().min(2).max(100).nullable(), since: z.string().datetime().nullable(), contentType: z.enum(['post', 'short', 'video']).nullable() }).strict();
const page = z.object({ ownerUid: id, viewerProfileId: id, selection, posts: z.array(socialPostSchema).max(23), unavailableSavedPostIds: z.array(documentId).max(20), nextCursor: cursor.nullable() }).strict();
export type SocialPostSelection = { scope: z.infer<typeof selection>['scope']; targetId?: string; search?: string; since?: string; contentType?: 'post' | 'short' | 'video' };
export type SocialPostListInput = SocialPostSelection & { expectedOwnerUid: string; expectedProfileId: string; cursor?: string };
export async function readSocialPostList(input: SocialPostListInput, guard: () => void, includeCommentCounts = true) {
  const started = Date.now(); guard();
  const response = await invokeFunction<unknown>('readSocialPostList', input, { expectedOwnerUid: input.expectedOwnerUid, guard }); guard();
  if (response.error) throw Object.assign(new Error(response.error.message || 'These posts could not be loaded. Retry.'), { code: response.error.code || response.error.name });
  const parsed = page.safeParse(response.data);
  if (!parsed.success) throw new Error('Post access could not be verified. Retry.');
  const data = parsed.data;
  if (data.ownerUid !== input.expectedOwnerUid || data.viewerProfileId !== input.expectedProfileId
    || Object.entries(data.selection).some(([key, value]) => value !== (input[key as keyof SocialPostListInput] ?? null))
    || (input.cursor && input.cursor === data.nextCursor) || new Set(data.posts.map(row => row.id)).size !== data.posts.length
    || (input.scope !== 'saved' && data.unavailableSavedPostIds.length > 0)
    || new Set(data.unavailableSavedPostIds).size !== data.unavailableSavedPostIds.length
    || data.posts.some(row => data.unavailableSavedPostIds.includes(row.id) || (input.contentType && row.type !== input.contentType)
      || (row.needsOwnerConfirmation && row.author.id !== input.expectedProfileId)
      || (!row.mediaUrl && (row.type !== 'post' || !row.caption.trim())))) throw new Error('Post access could not be verified. Retry.');
  let posts = data.posts.map(socialPostToPost);
  if (includeCommentCounts && posts.length) {
    // Preserve the existing batch count authority. Long historical document IDs
    // remain readable; the older comment API currently accepts IDs up to128.
    const countable = posts.filter(post => post.id.length <= 128).map(post => post.id);
    const counts = await readCommentCounts(countable, input.expectedProfileId, undefined, guard); guard();
    const hasCount = (postId: string) => Object.prototype.hasOwnProperty.call(counts, postId);
    const nowUnavailable = posts.filter(post => countable.includes(post.id) && !hasCount(post.id)).map(post => post.id);
    posts = posts.filter(post => !nowUnavailable.includes(post.id)).map(post => hasCount(post.id) ? { ...post, comment_count: counts[post.id] } : post);
    if (input.scope === 'saved') data.unavailableSavedPostIds.push(...nowUnavailable);
  }
  return { posts, unavailableSavedPostIds: data.unavailableSavedPostIds, nextCursor: data.nextCursor, leaseUntil: started + 30000 };
}

/** A bounded, admitted summary. hasMore means count is a lower bound, never an
 * exact total. Callers must show that distinction. No raw metadata fallback. */
export async function readSocialPostSummary(input: Omit<SocialPostListInput, 'cursor'>, guard: () => void) {
  const started = Date.now(), seen = new Set<string>(), cursors = new Set<string>(), tags = new Map<string, number>();
  let nextCursor: string | undefined;
  for (let pageIndex = 0; pageIndex < 3; pageIndex++) {
    const result = await readSocialPostList({ ...input, ...(nextCursor ? { cursor: nextCursor } : {}) }, guard, false);
    for (const post of result.posts) if (!seen.has(post.id)) {
      seen.add(post.id); for (const tag of post.tags) tags.set(tag, (tags.get(tag) ?? 0) + 1);
    }
    nextCursor = result.nextCursor ?? undefined;
    if (nextCursor) {
      if (cursors.has(nextCursor)) throw new Error('Post counts could not be verified. Retry.');
      cursors.add(nextCursor);
    }
    if (!nextCursor) break;
  }
  guard();
  if (Date.now() >= started + 30000) throw new Error('Post counts expired. Retry.');
  return { count: seen.size, hasMore: !!nextCursor, tags: [...tags].sort((a, b) => b[1] - a[1]), leaseUntil: started + 30000 };
}
