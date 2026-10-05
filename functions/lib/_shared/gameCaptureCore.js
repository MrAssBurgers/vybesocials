import { createHash } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import { db } from './admin.js';
import { GAME_CAPTURE_TTL_MS, MAX_GAME_CAPTURE_BYTES } from '../gameIntegrationValidation.js';
import { resolveIdentity } from './profileAudienceAuthority.js';
import { validPostPublication } from './postPublicationProof.js';
export const hashGameValue = (value) => createHash('sha256').update(value).digest('hex');
const quotaRetryAfter = (resetAt, now) => Math.max(1, Math.min(86400, Math.ceil((Number(resetAt) - now) / 1000) || 86400));
export function captureReceipt(id, capture) {
    return {
        captureId: id, status: capture.status, gameId: capture.game_id, gameName: capture.game_name,
        contentType: capture.content_type, byteSize: capture.byte_size, caption: capture.caption, tags: capture.tags,
        storagePath: capture.storage_path, expiresAt: capture.expires_at_ms,
        reviewUrl: `https://vybehub.app/game-capture/${id}`, postId: capture.post_id ?? null,
    };
}
export function assertCaptureOwner(capture, uid) {
    if (!capture || capture.owner_uid !== uid)
        throw new HttpsError('not-found', 'Capture not found for this account.');
}
export function assertCaptureLive(capture) {
    if (capture.expires_at_ms <= Date.now() || capture.status === 'expired' || capture.status === 'cancelled') {
        throw new HttpsError('failed-precondition', 'This capture expired or was discarded. Create a new capture in your game.');
    }
}
/** Read alongside the capture so a concurrent publish/cancel triggers a retry. */
export async function committedCapturePost(tx, id, uid) {
    const postId = `game_${id}`;
    const post = (await tx.get(db.collection('posts').doc(postId))).data();
    const authorId = typeof post?.author_id === 'string' ? post.author_id : '';
    if (post?.game_capture_id !== id || !authorId || authorId.includes('/'))
        return null;
    const owner = await resolveIdentity(db, tx, uid);
    const proof = (await tx.get(db.collection('_post_publications').doc(postId))).data();
    return owner?.uid === uid && post && validPostPublication(post, proof, owner, postId) ? postId : null;
}
export function reconcileImportedCapture(tx, id, capture, postId) {
    const cleanupAt = Date.now();
    tx.update(db.collection('game_captures').doc(id), {
        status: 'imported', post_id: postId, imported_at: new Date(cleanupAt).toISOString(), cleanup_at_ms: cleanupAt,
    });
    return { ...capture, status: 'imported', post_id: postId, cleanup_at_ms: cleanupAt };
}
/** Both trusted Firebase clients and partner clients reserve the same account quota. */
export async function reserveCapture(tx, uid, input, game, partner) {
    const gameLimit = typeof game.max_upload_bytes === 'number' ? Math.min(game.max_upload_bytes, MAX_GAME_CAPTURE_BYTES) : MAX_GAME_CAPTURE_BYTES;
    if (input.byteSize > gameLimit)
        throw new HttpsError('invalid-argument', 'This capture exceeds the game upload limit.');
    const namespace = `${uid}\0${input.gameId}\0${input.idempotencyKey}${partner ? `\0${partner.connectionId}` : ''}`;
    const id = hashGameValue(namespace).slice(0, 48);
    const fingerprint = hashGameValue(JSON.stringify(partner ? { ...input, contentSha256: partner.contentSha256 } : input));
    const ref = db.collection('game_captures').doc(id);
    const previous = (await tx.get(ref)).data();
    if (previous) {
        assertCaptureOwner(previous, uid);
        if (previous.fingerprint !== fingerprint || previous.partner_connection_id !== partner?.connectionId) {
            throw new HttpsError('already-exists', 'That upload key belongs to a different capture.');
        }
        assertCaptureLive(previous);
        return { id, capture: previous, created: false };
    }
    const quotaRef = db.collection('_rate_limits').doc(`game_capture_quota_${hashGameValue(uid)}`);
    const quota = (await tx.get(quotaRef)).data();
    const now = Date.now();
    const fresh = !quota || Number(quota.reset_at) <= now;
    const count = fresh ? 0 : Number(quota.count) || 0;
    const bytes = fresh ? 0 : Number(quota.bytes) || 0;
    if (count >= 20 || bytes + input.byteSize > 200 * 1024 * 1024) {
        throw new HttpsError('resource-exhausted', 'Game capture limit reached. Try again after the daily limit resets.', { retryAfter: quotaRetryAfter(quota?.reset_at, now) });
    }
    const pilotRef = db.collection('_rate_limits').doc('game_partner_capture_global');
    const pilot = partner ? (await tx.get(pilotRef)).data() : undefined;
    const pilotFresh = !pilot || Number(pilot.reset_at) <= now;
    const pilotCount = pilotFresh ? 0 : Number(pilot.count) || 0;
    if (partner && pilotCount >= 1000)
        throw new HttpsError('resource-exhausted', 'The partner pilot reached its daily capture capacity. Try again later.', { retryAfter: quotaRetryAfter(pilot?.reset_at, now) });
    const capture = {
        owner_uid: uid, game_id: input.gameId, game_name: game.display_name.trim().slice(0, 80),
        content_type: input.contentType, byte_size: input.byteSize, caption: input.caption, tags: input.tags,
        fingerprint, storage_path: `game-captures/${uid}/${id}`, status: 'uploading',
        expires_at_ms: now + GAME_CAPTURE_TTL_MS, cleanup_at_ms: now + GAME_CAPTURE_TTL_MS,
        ...(partner ? { partner_connection_id: partner.connectionId, content_sha256: partner.contentSha256 } : {}),
    };
    tx.create(ref, { ...capture, created_at: new Date(now).toISOString() });
    tx.set(quotaRef, { count: count + 1, bytes: bytes + input.byteSize, reset_at: fresh ? now + GAME_CAPTURE_TTL_MS : quota.reset_at });
    if (partner)
        tx.set(pilotRef, { count: pilotCount + 1, reset_at: pilotFresh ? now + GAME_CAPTURE_TTL_MS : pilot.reset_at });
    return { id, capture, created: true };
}
//# sourceMappingURL=gameCaptureCore.js.map