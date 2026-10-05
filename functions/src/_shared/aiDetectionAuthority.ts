import type { Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { resolveIdentity, type AudienceIdentity, type AudienceRow } from './profileAudienceAuthority.js';
import { validPostPublication, validPublicationPostId } from './postPublicationProof.js';

export type AiDetectionInput = {
  post_id: string;
  caption?: string;
  image_base64?: string;
  mime_type?: string;
  content_type?: string;
};
export type AiDetectionAnalysis = { caption: string; contentType: 'image' | 'video' | 'text'; imageBase64?: string; mimeType?: string };
export type AiDetectionResult = { is_ai: boolean; confidence: number; reason: string };
const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/heic', 'image/heif']);

function normalizeInput(raw: unknown): AiDetectionInput {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new HttpsError('invalid-argument', 'Post analysis details are required.');
  const input = raw as AudienceRow;
  if (Object.keys(input).some(key => !['post_id', 'caption', 'image_base64', 'mime_type', 'content_type'].includes(key))
    || !validPublicationPostId(input.post_id)
    || (input.caption !== undefined && (typeof input.caption !== 'string' || input.caption.length > 10000))
    || (input.image_base64 !== undefined && (typeof input.image_base64 !== 'string' || !input.image_base64.length
      || input.image_base64.length > 2_500_000 || input.image_base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(input.image_base64)))
    || (input.mime_type !== undefined && (typeof input.mime_type !== 'string' || !imageTypes.has(input.mime_type)))
    || (input.content_type !== undefined && !['image', 'video', 'text', 'content'].includes(input.content_type as string))) {
    throw new HttpsError('invalid-argument', 'Invalid post analysis details.');
  }
  return input as AiDetectionInput;
}

/** Provider output is untrusted: a failed or malformed analysis is never a human-content verdict. */
export function parseAiDetectionResult(raw: unknown): AiDetectionResult {
  let value: unknown;
  try { value = typeof raw === 'string' && raw.length <= 5000 ? JSON.parse(raw) : null; } catch { value = null; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpsError('data-loss', 'The analysis response was invalid. Retry later.');
  const row = value as AudienceRow;
  if (Object.keys(row).some(key => !['is_ai', 'confidence', 'reason'].includes(key)) || typeof row.is_ai !== 'boolean'
    || typeof row.confidence !== 'number' || !Number.isFinite(row.confidence) || row.confidence < 0 || row.confidence > 1
    || typeof row.reason !== 'string' || !row.reason.trim() || row.reason.length > 1000) {
    throw new HttpsError('data-loss', 'The analysis response was invalid. Retry later.');
  }
  return { is_ai: row.is_ai, confidence: row.confidence, reason: row.reason.trim() };
}

function requireOwnedPost(row: AudienceRow, actor: AudienceIdentity) {
  const owners = [row.author_id, row.user_id].filter(value => value !== undefined);
  if (!owners.length || owners.some(value => typeof value !== 'string' || !actor.aliases.includes(value))) {
    throw new HttpsError('permission-denied', 'This post does not belong to your current account.');
  }
  if (row.deleted_at || row.is_deleted || row.is_removed || row.removed_at) throw new HttpsError('failed-precondition', 'This post is no longer available.');
}

/** Analyze once outside transactions, then update only the exact admitted publication.
 * The image remains the caller's supplied sample; this does not attest media provenance.
 */
export async function detectOwnedPostAiContent(
  db: Firestore, uid: string, raw: unknown, analyze: (input: AiDetectionAnalysis) => Promise<unknown>,
) {
  const input = normalizeInput(raw);
  const postRef = db.collection('posts').doc(input.post_id);
  const publicationRef = db.collection('_post_publications').doc(input.post_id);
  const before = await db.runTransaction(async tx => {
    const [actor, post, publication] = await Promise.all([resolveIdentity(db, tx, uid), tx.get(postRef), tx.get(publicationRef)]);
    if (!actor || actor.uid !== uid) throw new HttpsError('failed-precondition', 'Your profile identity could not be verified.');
    if (!post.exists) throw new HttpsError('not-found', 'This post no longer exists.');
    const row = post.data()!;
    requireOwnedPost(row, actor);
    if (!validPostPublication(row, publication.data(), actor, input.post_id)) throw new HttpsError('failed-precondition', 'This post needs a verified publication before analysis.');
    if (typeof row.caption !== 'string' || row.caption.length > 10000 || !['post', 'short', 'video'].includes(row.type as string)) {
      throw new HttpsError('failed-precondition', 'This post cannot be analyzed.');
    }
    if (input.caption !== undefined && input.caption !== row.caption) throw new HttpsError('aborted', 'The post changed. Start a new analysis.');
    if (!input.image_base64 && !row.caption.trim()) throw new HttpsError('failed-precondition', 'There is no content to analyze.');
    return { actor, post, publication, caption: row.caption, contentType: row.type === 'short' || row.type === 'video' ? 'video' as const : input.image_base64 ? 'image' as const : 'text' as const };
  }, { maxAttempts: 3 });

  const result = parseAiDetectionResult(await analyze({ caption: before.caption, contentType: before.contentType,
    ...(input.image_base64 ? { imageBase64: input.image_base64, mimeType: input.mime_type || 'image/jpeg' } : {}) }));

  return db.runTransaction(async tx => {
    const [actor, post, publication] = await Promise.all([resolveIdentity(db, tx, uid), tx.get(postRef), tx.get(publicationRef)]);
    if (!actor || actor.uid !== uid || actor.profileId !== before.actor.profileId) throw new HttpsError('failed-precondition', 'Your profile identity changed. Start a new analysis.');
    if (!post.exists || !post.createTime?.isEqual(before.post.createTime!) || !post.updateTime?.isEqual(before.post.updateTime!)
      || !publication.exists || !publication.createTime?.isEqual(before.publication.createTime!) || !publication.updateTime?.isEqual(before.publication.updateTime!)
      || publication.data()?.revision !== before.publication.data()?.revision) {
      throw new HttpsError('aborted', 'The post changed or was removed. This analysis was not saved.');
    }
    const row = post.data()!;
    requireOwnedPost(row, actor);
    if (!validPostPublication(row, publication.data(), actor, input.post_id)) throw new HttpsError('aborted', 'This publication changed. This analysis was not saved.');
    tx.update(postRef, { is_ai_generated: result.is_ai, ai_confidence: result.confidence, ai_detection_confidence: result.confidence,
      ai_detection_reason: result.reason, ai_checked_at: new Date().toISOString() });
    return { ...result, applied: true as const, postId: input.post_id, ownerUid: uid, profileId: actor.profileId };
  }, { maxAttempts: 3 });
}
