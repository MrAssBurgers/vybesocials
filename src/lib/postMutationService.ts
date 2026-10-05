import { z } from 'zod';
import { invokeFunction } from '@/lib/firebase/functionsService';
import { validPostMediaUrl } from './postMediaUrl';

const id = z.string().min(1).max(1500).refine(value => !value.includes('/') && value !== '.' && value !== '..' && new TextEncoder().encode(value).length <= 1500);
const revision = z.string().regex(/^[a-f0-9]{48}$/);
const url = z.string().max(8192).url().refine(validPostMediaUrl);
const payload = z.object({
  type: z.enum(['post', 'short', 'video']), caption: z.string().max(10000), tags: z.array(z.string().max(100)).max(30),
  mediaUrl: url.nullable(), mediaUrls: z.array(url).max(20), thumbnailUrl: url.nullable(),
  ageRating: z.enum(['safe', '13+', '18+', 'unrated']), visibility: z.enum(['public', 'followers', 'friends', 'close_friends', 'only_me']),
  vybeCheckId: id.nullable().optional(), gameCaptureId: z.string().regex(/^[a-f0-9]{48}$/).optional(), soundId: id.nullable().optional(), filterId: id.nullable().optional(),
}).strict();
const publishedPost = payload.extend({ id, authorId: id, createdAt: z.string().datetime(), isPinned: z.boolean(), aiOverride: z.boolean().nullable() }).strict();
const receipt = z.object({
  ok: z.literal(true), ownerUid: id, profileId: id, action: z.enum(['read', 'create', 'update', 'delete', 'pin', 'recover']), postId: id,
  requestId: z.string().uuid().nullable(), revision: revision.nullable(), status: z.enum(['published', 'legacy', 'deleted', 'missing']),
  post: publishedPost.nullable(), needsOwnerConfirmation: z.boolean(), created: z.boolean(), unpinnedPostIds: z.array(id).max(50),
}).strict();
export type PostActor = { uid: string; profileId: string };
export type PostPublishPayload = z.infer<typeof payload>;
export type PostMutationState = z.infer<typeof receipt>;
export type PostMutationRequest = { action: 'read'; postId: string }
  | { action: 'create'; postId: string; requestId: string; payload: PostPublishPayload }
  | { action: 'recover'; postId: string; requestId: string; expectedRevision: string; payload: PostPublishPayload }
  | { action: 'update'; postId: string; requestId: string; expectedRevision: string; payload: { caption?: string; tags?: string[]; aiOverride?: boolean | null } }
  | { action: 'pin'; postId: string; requestId: string; expectedRevision: string; payload: { isPinned: boolean } }
  | { action: 'delete'; postId: string; requestId: string; expectedRevision: string };

/** Only a bound, fully checked server receipt confirms a post operation. */
export async function managePost(actor: PostActor, request: PostMutationRequest, guard: () => void, options?: { allowStaffRead?: boolean }): Promise<PostMutationState> {
  guard();
  const response = await invokeFunction<unknown>('managePost', { ...request, expectedOwnerUid: actor.uid, expectedProfileId: actor.profileId });
  guard();
  if (response.error) throw Object.assign(new Error(response.error.message || 'This post could not be confirmed. Please retry.'), { code: response.error.code || response.error.name });
  const parsed = receipt.safeParse(response.data);
  if (!parsed.success) throw new Error('The post response could not be verified. Please retry.');
  const value = parsed.data, present = value.status === 'published' || value.status === 'legacy';
  if (value.ownerUid !== actor.uid || value.profileId !== actor.profileId || value.action !== request.action || value.postId !== request.postId
    || value.requestId !== (request.action === 'read' ? null : request.requestId)
    || value.needsOwnerConfirmation !== (value.status === 'legacy') || present !== !!value.post || present !== !!value.revision
    || (value.post && (value.post.id !== request.postId || (value.post.authorId !== actor.profileId && !(request.action === 'read' && options?.allowStaffRead))))
    || (value.created && !['create', 'recover'].includes(request.action))
    || new Set(value.unpinnedPostIds).size !== value.unpinnedPostIds.length || (request.action !== 'pin' && value.unpinnedPostIds.length > 0)) {
    throw new Error('The post response does not match this account or action. Please retry.');
  }
  if (request.action !== 'read') {
    let matches = request.action === 'delete' ? value.status === 'deleted' : value.status === 'published';
    matches = matches && value.created === (request.action === 'create');
    if (request.action === 'update' && value.post) {
      matches = matches && Object.entries(request.payload).every(([key, expected]) => JSON.stringify(value.post![key as keyof typeof value.post]) === JSON.stringify(expected));
    } else if (request.action === 'pin') {
      matches = matches && value.post?.isPinned === request.payload.isPinned && !value.unpinnedPostIds.includes(request.postId);
    } else if ((request.action === 'create' || request.action === 'recover') && value.post) {
      const expected = request.payload;
      matches = matches && ['type', 'caption', 'tags', 'mediaUrl', 'mediaUrls', 'thumbnailUrl', 'visibility', 'gameCaptureId'].every(key =>
        JSON.stringify(value.post![key as keyof typeof value.post]) === JSON.stringify(expected[key as keyof PostPublishPayload]));
      matches = matches && ['vybeCheckId', 'soundId', 'filterId'].every(key =>
        (value.post![key as keyof typeof value.post] ?? null) === (expected[key as keyof PostPublishPayload] ?? null));
      matches = matches && (expected.vybeCheckId
        ? value.post.ageRating === expected.ageRating || (expected.ageRating === 'safe' && value.post.ageRating === '13+')
        : value.post.ageRating === 'unrated');
    }
    if (!matches) throw new Error('The saved post does not confirm your requested change. Please retry.');
  }
  return value;
}

const ATTEMPTS = 'vybe-post-mutation-attempts-v1';
type WithoutRequestId<T> = T extends unknown ? Omit<T, 'requestId'> : never;
export type PostMutationDraft = WithoutRequestId<Exclude<PostMutationRequest, { action: 'read' }>>;
const memory = new Map<string, string>();
function stored(): Record<string, string> {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(ATTEMPTS) || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([key, item]) => /^[a-f0-9]{64}$/.test(key) && typeof item === 'string' && z.string().uuid().safeParse(item).success).slice(-32));
  } catch { return {}; }
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}
/** Retain retry identity without persisting captions or media links. */
export async function postMutationAttempt(actor: PostActor, request: PostMutationDraft) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(canonical({ actor, request }))));
  const key = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
  const values = stored(), requestId = memory.get(key) || values[key] || crypto.randomUUID();
  memory.set(key, requestId); values[key] = requestId;
  while (memory.size > 32) memory.delete(memory.keys().next().value!);
  try { sessionStorage.setItem(ATTEMPTS, JSON.stringify(Object.fromEntries(Object.entries(values).slice(-32)))); } catch { /* The mounted draft retains its attempt in memory. */ }
  return { requestId, complete: () => {
    memory.delete(key); const next = stored(); delete next[key];
    try { sessionStorage.setItem(ATTEMPTS, JSON.stringify(next)); } catch { /* No automatic retry. */ }
  } };
}

export function postPayloadFromState(state: PostMutationState): PostPublishPayload {
  if (!state.post) throw new Error('This post is no longer available.');
  const { id: _id, authorId: _authorId, createdAt: _createdAt, isPinned: _isPinned, aiOverride: _aiOverride, ...body } = state.post;
  return body;
}
