import { z } from 'zod';
import { invokeFunction } from '@/lib/firebase/functionsService';
import { tokenAccountGuard, tokenAccountSnapshot } from '@/lib/tokenMarketplaceService';
const id = z.string().min(1).max(128).refine(value => !value.includes('/'));
const revision = z.string().regex(/^[a-f0-9]{48}$/);
const url = z.string().max(8192).url().refine(value => { try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password; } catch { return false; } });
const binding = { ok: z.literal(true), ownerUid: id, profileId: id };
const comment = z.object({ id, postId: id, text: z.string().max(4000), imageUrl: url.nullable(), createdAt: z.string().datetime(),
  revision: revision.nullable(), needsOwnerConfirmation: z.boolean(), isFlagged: z.boolean(), safetyScore: z.number().min(0).max(1), safetyCategories: z.array(z.string().max(80)).max(20),
  likeCount: z.number().int().nonnegative(), isLiked: z.boolean(), user: z.object({ id, username: z.string().min(1).max(100), avatarUrl: url.nullable() }).strict() }).strict();
const page = z.object({ ...binding, postId: id, comments: z.array(comment).max(20), nextCursor: revision.nullable() }).strict();
const countPage = z.object({ ...binding, requestedPostIds: z.array(id).min(1).max(20), since: z.string().datetime().nullable(), counts: z.array(z.object({ postId: id, count: z.number().int().nonnegative() }).strict()).max(20) }).strict();
const receipt = z.object({ ...binding, action: z.enum(['create', 'edit', 'delete', 'like']), postId: id, commentId: id, requestId: z.string().uuid(), revision, liked: z.boolean().optional() }).strict();
export type CommentIdentity = { expectedOwnerUid: string; expectedProfileId: string };
export type Comment = { id: string; text: string; image_url: string | null; created_at: string; revision: string | null; needs_owner_confirmation: boolean;
  is_flagged: boolean; safety_score: number; safety_categories: string[]; like_count: number; is_liked: boolean; user: { id: string; username: string; avatar_url: string | null } };
export type CommentPage = { comments: Comment[]; nextCursor: string | null; leaseUntil: number };
export type CommentChange = { action: 'create'; text: string; imageUrl: string | null; isFlagged?: boolean; safetyScore?: number; safetyCategories?: string[] }
  | { action: 'edit'; commentId: string; text: string; expectedRevision: string | null }
  | { action: 'delete'; commentId: string; expectedRevision: string | null }
  | { action: 'like'; commentId: string; liked: boolean };
function bound(value: { ownerUid?: string; profileId?: string }, input: CommentIdentity) {
  return value.ownerUid === input.expectedOwnerUid && value.profileId === input.expectedProfileId;
}
function fail() { return new Error('Comment access could not be verified. Refresh and retry.'); }
function check(guard: () => void, signal?: AbortSignal) { guard(); if (signal?.aborted) throw new DOMException('Comments closed.', 'AbortError'); }
async function call(name: string, input: Record<string, unknown>, guard: () => void) {
  guard(); const response = await invokeFunction<unknown>(name, input);
  if (response.error) { guard(); throw Object.assign(new Error(response.error.message || 'Comments could not be loaded.'), { code: response.error.code || response.error.name }); }
  return response.data;
}
export async function readCommentsPage(input: CommentIdentity & { postId: string; cursor?: string }, guard: () => void, signal?: AbortSignal): Promise<CommentPage> {
  const started = Date.now();
  check(guard, signal); const parsed = page.safeParse(await call('readPostComments', input, guard)); check(guard, signal);
  if (!parsed.success) throw fail(); const data = parsed.data;
  if (!bound(data, input) || data.postId !== input.postId || (input.cursor && data.nextCursor === input.cursor)
    || new Set(data.comments.map(row => row.id)).size !== data.comments.length || data.comments.some(row => row.postId !== input.postId || (!row.text.trim() && !row.imageUrl)
      || (row.needsOwnerConfirmation ? row.revision !== null || row.user.id !== input.expectedProfileId : row.revision === null))) throw fail();
  return { nextCursor: data.nextCursor, leaseUntil: started + 30000, comments: data.comments.map(row => ({ id: row.id, text: row.text, image_url: row.imageUrl, created_at: row.createdAt,
    revision: row.revision, needs_owner_confirmation: row.needsOwnerConfirmation, is_flagged: row.isFlagged, safety_score: row.safetyScore, safety_categories: row.safetyCategories,
    like_count: row.likeCount, is_liked: row.isLiked, user: { id: row.user.id, username: row.user.username, avatar_url: row.user.avatarUrl } })) };
}
/** The receipt contains no comment text. A valid committed acknowledgement is
 * retained across account changes; callers guard all UI/cache side effects. */
export async function changePostComment(input: CommentIdentity & CommentChange & { postId: string; requestId: string }, guard: () => void) {
  const parsed = receipt.safeParse(await call('managePostComment', input, guard));
  if (!parsed.success) { guard(); throw fail(); } const data = parsed.data;
  if (!bound(data, input) || data.action !== input.action || data.postId !== input.postId || data.requestId !== input.requestId
    || ('commentId' in input && input.commentId !== data.commentId) || (input.action === 'like' ? data.liked !== input.liked : data.liked !== undefined)) { guard(); throw fail(); }
  return data;
}
export async function readCommentCounts(postIds: string[], profileId: string | null | undefined, since?: string, extraGuard?: () => void): Promise<Record<string, number>> {
  if (!postIds.length) return {};
  const session = tokenAccountSnapshot(), account = tokenAccountGuard(session.uid);
  const guard = () => { account(); extraGuard?.(); };
  guard(); if (!session.uid || !profileId) throw new Error('Sign in to load comment counts.');
  const ids = [...new Set(postIds)], counts: Record<string, number> = {};
  if (ids.length > 500 || ids.some(value => !id.safeParse(value).success)) throw fail();
  for (let start = 0; start < ids.length; start += 20) {
    const input = { expectedOwnerUid: session.uid, expectedProfileId: profileId, postIds: ids.slice(start, start + 20), ...(since ? { since } : {}) };
    const parsed = countPage.safeParse(await call('readPostCommentCounts', input, guard)); guard();
    if (!parsed.success) throw fail(); const data = parsed.data;
    if (!bound(data, input) || JSON.stringify(data.requestedPostIds) !== JSON.stringify(input.postIds) || data.since !== (since ?? null)
      || new Set(data.counts.map(row => row.postId)).size !== data.counts.length || data.counts.some(row => !input.postIds.includes(row.postId))) throw fail();
    for (const row of data.counts) counts[row.postId] = row.count;
  }
  return counts;
}
export async function readCommentParent(input: CommentIdentity & { commentId: string }, guard: () => void) {
  const schema = z.object({ ...binding, commentId: id, postId: id.nullable() }).strict();
  const parsed = schema.safeParse(await call('readCommentContext', input, guard)); guard();
  if (!parsed.success || !bound(parsed.data, input) || parsed.data.commentId !== input.commentId) throw fail();
  return parsed.data.postId;
}
