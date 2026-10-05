import type { PostActor, PostMutationState, PostPublishPayload } from './postMutationService';
import { reportAccountGuard } from './reportModerationService';

const STORAGE = 'vybe-pending-publications-v1';
const MAX_ATTEMPTS = 24;
export type PreparedPostCreate = { version: 1; actor: PostActor; postId: string; requestId: string; payload: PostPublishPayload; sourceKey?: string; preparedAt: number };
const pending = new Map<string, PreparedPostCreate>();
const key = (uid: string, postId: string) => JSON.stringify([uid, postId]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function stored(): PreparedPostCreate[] {
  try {
    const rows: unknown = JSON.parse(sessionStorage.getItem(STORAGE) || '[]');
    return Array.isArray(rows) ? rows.filter((row): row is PreparedPostCreate => !!row && typeof row === 'object' && row.version === 1
      && typeof row.actor?.uid === 'string' && typeof row.actor?.profileId === 'string' && row.actor.uid.length <= 128 && row.actor.profileId.length <= 128
      && typeof row.postId === 'string' && (uuid.test(row.postId) || /^game_[a-f0-9]{48}$/.test(row.postId)) && uuid.test(row.requestId)
      && Number.isSafeInteger(row.preparedAt) && row.payload && typeof row.payload === 'object' && JSON.stringify(row.payload).length <= 200000).slice(-96) : [];
  } catch { return []; }
}
function remember(attempt: PreparedPostCreate) {
  const rows = new Map(stored().map(row => [key(row.actor.uid, row.postId), row]));
  for (const row of pending.values()) rows.set(key(row.actor.uid, row.postId), row);
  rows.set(key(attempt.actor.uid, attempt.postId), attempt);
  // Never discard an unresolved publication to silently make room for another.
  if ([...rows.values()].filter(row => row.actor.uid === attempt.actor.uid).length > MAX_ATTEMPTS || rows.size > 96) throw new Error('Resolve a pending publication before posting again.');
  try { sessionStorage.setItem(STORAGE, JSON.stringify([...rows.values()])); }
  catch { throw new Error('This browser could not retain your publish receipt. Enable session storage and retry; your post has not been submitted.'); }
  pending.set(key(attempt.actor.uid, attempt.postId), structuredClone(attempt));
}
export function getPreparedPost(uid: string, postId: string): PreparedPostCreate | undefined {
  const row = pending.get(key(uid, postId)) || stored().find(row => row.actor.uid === uid && row.postId === postId);
  return row ? structuredClone(row) : undefined;
}
export function listPreparedPosts(uid: string): PreparedPostCreate[] {
  const rows = new Map(stored().filter(row => row.actor.uid === uid).map(row => [row.postId, row]));
  for (const row of pending.values()) if (row.actor.uid === uid) rows.set(row.postId, row);
  return [...rows.values()].map(row => structuredClone(row));
}
export function forgetPreparedPost(uid: string, postId: string) {
  pending.delete(key(uid, postId));
  try { sessionStorage.setItem(STORAGE, JSON.stringify(stored().filter(row => row.actor.uid !== uid || row.postId !== postId))); } catch { /* Replaying a retained confirmed receipt is harmless. */ }
}
export function preparePostCreate(actor: PostActor, postId: string, payload: PostPublishPayload, sourceKey?: string): PreparedPostCreate {
  const existing = getPreparedPost(actor.uid, postId);
  if (existing) {
    if (existing.actor.profileId !== actor.profileId || JSON.stringify(existing.payload) !== JSON.stringify(payload)) throw new Error('This publication is already pending with different content. Recover its original result before posting changes.');
    return existing;
  }
  const attempt: PreparedPostCreate = { version: 1, actor: { ...actor }, postId, requestId: crypto.randomUUID(), payload: structuredClone(payload), sourceKey, preparedAt: Date.now() };
  remember(attempt); return structuredClone(attempt);
}
export async function submitPreparedPost(attempt: PreparedPostCreate, guard: () => void = reportAccountGuard(attempt.actor.uid)): Promise<PostMutationState> {
  guard();
  const { managePost } = await import('./postMutationService');
  guard();
  const result = await managePost(attempt.actor, { action: 'create', postId: attempt.postId, requestId: attempt.requestId, payload: structuredClone(attempt.payload) }, guard);
  guard();
  if (result.status === 'deleted') { forgetPreparedPost(attempt.actor.uid, attempt.postId); throw new Error('This publication was already removed. Retrying will not restore it.'); }
  if (result.status !== 'published' || !result.post) throw new Error('The publication was not confirmed. Retry this same draft.');
  forgetPreparedPost(attempt.actor.uid, attempt.postId);
  return result;
}
export function legacyPostFromReceipt(state: PostMutationState) {
  if (!state.post) throw new Error('This post is no longer available.');
  const row = state.post;
  return { id: row.id, author_id: row.authorId, type: row.type, caption: row.caption, tags: row.tags, media_url: row.mediaUrl,
    media_urls: row.mediaUrls, thumbnail_url: row.thumbnailUrl, age_rating: row.ageRating, visibility: row.visibility,
    game_capture_id: row.gameCaptureId, created_at: row.createdAt, is_pinned: row.isPinned, ai_override: row.aiOverride,
    publication_revision: state.revision };
}
/** Compatibility fields are input data only; author/status/counters are derived
 * by the server and never copied from a browser row. */
export function postPayloadFromLegacy(row: Record<string, unknown>): PostPublishPayload {
  const visibility = row.visibility === 'private' ? 'only_me' : row.visibility === 'everyone' || row.visibility === undefined ? 'public' : row.visibility;
  if (!['public', 'followers', 'friends', 'close_friends', 'only_me'].includes(String(visibility))) throw new Error('Choose a supported audience before publishing.');
  return { type: row.type === 'short' || row.type === 'video' ? row.type : 'post', caption: String(row.caption || ''),
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [], mediaUrl: typeof row.media_url === 'string' ? row.media_url : null,
    mediaUrls: Array.isArray(row.media_urls) ? row.media_urls.map(String) : [], thumbnailUrl: typeof row.thumbnail_url === 'string' ? row.thumbnail_url : null,
    ageRating: row.age_rating === 'safe' || row.age_rating === '13+' || row.age_rating === '18+' ? row.age_rating : 'unrated',
    visibility: visibility as PostPublishPayload['visibility'],
    ...(typeof row.game_capture_id === 'string' ? { gameCaptureId: row.game_capture_id } : {}),
    ...(typeof row.sound_id === 'string' ? { soundId: row.sound_id } : {}), ...(typeof row.filter_id === 'string' ? { filterId: row.filter_id } : {}),
    ...(typeof row.vybe_check_id === 'string' ? { vybeCheckId: row.vybe_check_id } : {}) };
}
