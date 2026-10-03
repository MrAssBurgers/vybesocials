import { createHash } from 'node:crypto';
import { getStorage } from 'firebase-admin/storage';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db, requireAuth, rateLimit, enforceRateLimit } from './_shared/admin.js';
import { GAME_CAPTURE_TTL_MS, MAX_GAME_CAPTURE_BYTES, GameCaptureValidationError, matchesGameCaptureSignature, validateGameCaptureId, validateGameCaptureInput, } from './gameIntegrationValidation.js';
const hash = (value) => createHash('sha256').update(value).digest('hex');
const opts = { region: 'us-central1', invoker: 'public', timeoutSeconds: 60 };
function validate(fn) {
    try {
        return fn();
    }
    catch (error) {
        if (error instanceof GameCaptureValidationError)
            throw new HttpsError('invalid-argument', error.message);
        throw error;
    }
}
async function authenticate(request) {
    const uid = requireAuth(request);
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid))
        throw new HttpsError('failed-precondition', 'This account cannot use game capture uploads.');
    enforceRateLimit(await rateLimit(`game_capture_call_${hash(uid)}`, 60, 60));
    return uid;
}
function receipt(id, capture) {
    return {
        captureId: id, status: capture.status, gameId: capture.game_id, gameName: capture.game_name,
        contentType: capture.content_type, byteSize: capture.byte_size,
        caption: capture.caption, tags: capture.tags, storagePath: capture.storage_path,
        expiresAt: capture.expires_at_ms, reviewUrl: `https://vybehub.app/game-capture/${id}`,
        postId: capture.post_id ?? null,
    };
}
function assertOwner(capture, uid) {
    if (!capture || capture.owner_uid !== uid)
        throw new HttpsError('not-found', 'Capture not found for this account.');
}
function assertLive(capture) {
    if (capture.expires_at_ms <= Date.now() || capture.status === 'expired' || capture.status === 'cancelled') {
        throw new HttpsError('failed-precondition', 'This capture expired or was discarded. Create a new capture in your game.');
    }
}
/** Read in the caller's transaction so a concurrent publish/cancel is retried. */
async function committedCapturePost(tx, id, uid) {
    const postId = `game_${id}`;
    const post = (await tx.get(db.collection('posts').doc(postId))).data();
    const authorId = typeof post?.author_id === 'string' ? post.author_id : '';
    if (post?.game_capture_id !== id || !authorId || authorId.includes('/'))
        return null;
    if (authorId === uid)
        return postId;
    const profile = (await tx.get(db.collection('profiles').doc(authorId))).data();
    return profile?.user_id === uid ? postId : null;
}
function reconcileImportedCapture(tx, id, capture, postId) {
    const cleanupAt = Date.now();
    tx.update(db.collection('game_captures').doc(id), {
        status: 'imported', post_id: postId, imported_at: new Date(cleanupAt).toISOString(), cleanup_at_ms: cleanupAt,
    });
    return { ...capture, status: 'imported', post_id: postId, cleanup_at_ms: cleanupAt };
}
async function enabledGame(gameId) {
    const game = (await db.collection('game_integrations').doc(gameId).get()).data();
    if (!game || game.enabled !== true || typeof game.display_name !== 'string' || !game.display_name.trim()) {
        throw new HttpsError('failed-precondition', 'This game integration is not enabled.');
    }
    return game;
}
/** A game ID identifies a registered integration; it is deliberately not a secret. */
export const createGameCapture = onCall(opts, async (request) => {
    const uid = await authenticate(request);
    const input = validate(() => validateGameCaptureInput(request.data));
    const game = await enabledGame(input.gameId);
    const gameLimit = typeof game.max_upload_bytes === 'number' ? Math.min(game.max_upload_bytes, MAX_GAME_CAPTURE_BYTES) : MAX_GAME_CAPTURE_BYTES;
    if (input.byteSize > gameLimit)
        throw new HttpsError('invalid-argument', 'This capture exceeds the game upload limit.');
    const id = hash(`${uid}\0${input.gameId}\0${input.idempotencyKey}`).slice(0, 48);
    const fingerprint = hash(JSON.stringify(input));
    const ref = db.collection('game_captures').doc(id);
    const quotaRef = db.collection('_rate_limits').doc(`game_capture_quota_${hash(uid)}`);
    const capture = await db.runTransaction(async (tx) => {
        const previous = (await tx.get(ref)).data();
        if (previous) {
            assertOwner(previous, uid);
            if (previous.fingerprint !== fingerprint)
                throw new HttpsError('already-exists', 'That upload key belongs to a different capture.');
            assertLive(previous);
            return previous;
        }
        const now = Date.now();
        const quota = (await tx.get(quotaRef)).data();
        const fresh = !quota || Number(quota.reset_at) <= now;
        const count = fresh ? 0 : Number(quota.count) || 0;
        const bytes = fresh ? 0 : Number(quota.bytes) || 0;
        if (count >= 20 || bytes + input.byteSize > 200 * 1024 * 1024) {
            throw new HttpsError('resource-exhausted', 'Game capture limit reached. Try again after the daily limit resets.');
        }
        const next = {
            owner_uid: uid, game_id: input.gameId, game_name: game.display_name.trim().slice(0, 80),
            content_type: input.contentType, byte_size: input.byteSize, caption: input.caption, tags: input.tags,
            fingerprint, storage_path: `game-captures/${uid}/${id}`, status: 'uploading',
            expires_at_ms: now + GAME_CAPTURE_TTL_MS, cleanup_at_ms: now + GAME_CAPTURE_TTL_MS,
        };
        tx.create(ref, { ...next, created_at: new Date(now).toISOString() });
        tx.set(quotaRef, { count: count + 1, bytes: bytes + input.byteSize, reset_at: fresh ? now + GAME_CAPTURE_TTL_MS : quota.reset_at });
        return next;
    });
    return receipt(id, capture);
});
export const getGameCapture = onCall(opts, async (request) => {
    const uid = await authenticate(request);
    const id = validate(() => validateGameCaptureId(request.data?.captureId));
    return db.runTransaction(async (tx) => {
        const capture = (await tx.get(db.collection('game_captures').doc(id))).data();
        assertOwner(capture, uid);
        // Recover lost acknowledgements without overwriting a concurrent cancellation
        // from a stale ready snapshot. The canonical post and capture share a read set.
        if (capture.status === 'ready') {
            const postId = await committedCapturePost(tx, id, uid);
            if (postId)
                return receipt(id, reconcileImportedCapture(tx, id, capture, postId));
        }
        if (capture.status === 'imported')
            return receipt(id, capture);
        assertLive(capture);
        return receipt(id, capture);
    });
});
/** No post is created here. Only the signed-in VYBE review screen can import it. */
export const finishGameCapture = onCall(opts, async (request) => {
    const uid = await authenticate(request);
    const id = validate(() => validateGameCaptureId(request.data?.captureId));
    const ref = db.collection('game_captures').doc(id);
    const capture = (await ref.get()).data();
    assertOwner(capture, uid);
    assertLive(capture);
    await enabledGame(capture.game_id);
    if (capture.status !== 'uploading')
        return receipt(id, capture);
    const file = getStorage().bucket().file(capture.storage_path);
    let head;
    try {
        const [metadata] = await file.getMetadata();
        if (Number(metadata.size) !== capture.byte_size || metadata.contentType !== capture.content_type) {
            throw new HttpsError('invalid-argument', 'The uploaded file does not match this capture.');
        }
        // Storage rules prohibit client rewrites, and the read is pinned to the
        // observed generation as a second boundary against a replacement race.
        [head] = await getStorage().bucket().file(capture.storage_path, { generation: metadata.generation }).download({ start: 0, end: 31 });
    }
    catch (error) {
        if (error instanceof HttpsError)
            throw error;
        if (typeof error === 'object' && error && 'code' in error && Number(error.code) === 404) {
            throw new HttpsError('failed-precondition', 'Upload the capture before finishing it.', { reason: 'upload-required' });
        }
        throw new HttpsError('unavailable', 'Could not verify this upload. Please retry.');
    }
    if (!matchesGameCaptureSignature(head, capture.content_type))
        throw new HttpsError('invalid-argument', 'The file format does not match its media type.');
    return db.runTransaction(async (tx) => {
        const current = (await tx.get(ref)).data();
        assertOwner(current, uid);
        assertLive(current);
        if (current.status === 'uploading') {
            tx.update(ref, { status: 'ready', ready_at: new Date().toISOString() });
            current.status = 'ready';
        }
        return receipt(id, current);
    });
});
/** Acknowledge an existing own post after the standard VYBE moderated composer. */
export const completeGameCapture = onCall(opts, async (request) => {
    const uid = await authenticate(request);
    const id = validate(() => validateGameCaptureId(request.data?.captureId));
    const postId = request.data?.postId;
    if (postId !== `game_${id}`)
        throw new HttpsError('invalid-argument', 'The published post must belong to this capture.');
    const ref = db.collection('game_captures').doc(id);
    const result = await db.runTransaction(async (tx) => {
        const capture = (await tx.get(ref)).data();
        assertOwner(capture, uid);
        if (capture.status === 'imported')
            return receipt(id, capture);
        assertLive(capture);
        if (capture.status !== 'ready')
            throw new HttpsError('failed-precondition', 'Finish uploading this capture first.');
        if (!await committedCapturePost(tx, id, uid))
            throw new HttpsError('permission-denied', 'This post does not belong to you.');
        return receipt(id, reconcileImportedCapture(tx, id, capture, postId));
    });
    return result;
});
export const discardGameCapture = onCall(opts, async (request) => {
    const uid = await authenticate(request);
    const id = validate(() => validateGameCaptureId(request.data?.captureId));
    const ref = db.collection('game_captures').doc(id);
    const alreadyPublished = await db.runTransaction(async (tx) => {
        const capture = (await tx.get(ref)).data();
        assertOwner(capture, uid);
        if (capture.status === 'imported')
            return true;
        const postId = await committedCapturePost(tx, id, uid);
        if (postId) {
            reconcileImportedCapture(tx, id, capture, postId);
            return true;
        }
        tx.update(ref, { status: 'cancelled', cleanup_at_ms: Date.now() });
        return false;
    });
    // Throw after the transaction commits, or the recovered imported state rolls back.
    if (alreadyPublished)
        throw new HttpsError('failed-precondition', 'This capture is already published. Manage the post in VYBE.');
    return { ok: true };
});
/** Bounded cleanup keeps tombstones for seven days to preserve upload retries. */
export const cleanupGameCaptures = onSchedule({ schedule: 'every 60 minutes', region: 'us-central1', timeoutSeconds: 120 }, async () => {
    const now = Date.now();
    const expired = await db.collection('game_captures').where('cleanup_at_ms', '<=', now).limit(200).get();
    for (const doc of expired.docs) {
        const capture = doc.data();
        // Set a terminal state before deleting: a delayed upload can no longer pass rules.
        await db.runTransaction(async (tx) => {
            const current = (await tx.get(doc.ref)).data();
            if (current && (current.status === 'uploading' || current.status === 'ready'))
                tx.update(doc.ref, { status: 'expired' });
        });
        await getStorage().bucket().file(capture.storage_path).delete({ ignoreNotFound: true });
        if (now > capture.expires_at_ms + 7 * GAME_CAPTURE_TTL_MS)
            await doc.ref.delete();
        else
            await doc.ref.update({ cleanup_at_ms: capture.expires_at_ms + 7 * GAME_CAPTURE_TTL_MS + 1 });
    }
});
//# sourceMappingURL=gameIntegration.js.map