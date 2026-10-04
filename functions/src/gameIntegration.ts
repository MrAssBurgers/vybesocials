import { createHash } from 'node:crypto';
import { getStorage } from 'firebase-admin/storage';
import { onCall, HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db, requireAuth, rateLimit, enforceRateLimit } from './_shared/admin.js';
import {
  GAME_CAPTURE_TTL_MS, GameCaptureValidationError,
  matchesGameCaptureSignature, validateGameCaptureId, validateGameCaptureInput,
} from './gameIntegrationValidation.js';

import { type Capture, captureReceipt as receipt, assertCaptureOwner as assertOwner, assertCaptureLive as assertLive, reserveCapture, committedCapturePost, reconcileImportedCapture } from './_shared/gameCaptureCore.js';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const opts = { region: 'us-central1', invoker: 'public' as const, timeoutSeconds: 60 };

function validate<T>(fn: () => T): T {
  try { return fn(); } catch (error) {
    if (error instanceof GameCaptureValidationError) throw new HttpsError('invalid-argument', error.message);
    throw error;
  }
}

async function authenticate(request: CallableRequest): Promise<string> {
  const uid = requireAuth(request);
  if (request.data?.expectedOwnerUid !== undefined && request.data.expectedOwnerUid !== uid) {
    throw new HttpsError('failed-precondition', 'Your account changed. Start this capture action again.');
  }
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) throw new HttpsError('failed-precondition', 'This account cannot use game capture uploads.');
  enforceRateLimit(await rateLimit(`game_capture_call_${hash(uid)}`, 60, 60));
  return uid;
}

async function enabledGame(gameId: string) {
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
  const reserved = await db.runTransaction(tx => reserveCapture(tx, uid, input, game as { display_name: string; max_upload_bytes?: unknown }));
  return receipt(reserved.id, reserved.capture);
});

export const getGameCapture = onCall(opts, async (request) => {
  const uid = await authenticate(request);
  const id = validate(() => validateGameCaptureId(request.data?.captureId));
  return db.runTransaction(async tx => {
    const capture = (await tx.get(db.collection('game_captures').doc(id))).data() as Capture | undefined;
    assertOwner(capture, uid);
    // Recover lost acknowledgements without overwriting a concurrent cancellation
    // from a stale ready snapshot. The canonical post and capture share a read set.
    if (capture.status === 'ready') {
      const postId = await committedCapturePost(tx, id, uid);
      if (postId) return receipt(id, reconcileImportedCapture(tx, id, capture, postId));
    }
    if (capture.status === 'imported') return receipt(id, capture);
    assertLive(capture);
    return receipt(id, capture);
  });
});

/** No post is created here. Only the signed-in VYBE review screen can import it. */
export const finishGameCapture = onCall(opts, async (request) => {
  const uid = await authenticate(request);
  const id = validate(() => validateGameCaptureId(request.data?.captureId));
  const ref = db.collection('game_captures').doc(id);
  const capture = (await ref.get()).data() as Capture | undefined;
  assertOwner(capture, uid);
  assertLive(capture);
  await enabledGame(capture.game_id);
  if (capture.status !== 'uploading') return receipt(id, capture);
  const file = getStorage().bucket().file(capture.storage_path);
  let head: Buffer;
  try {
    const [metadata] = await file.getMetadata();
    if (Number(metadata.size) !== capture.byte_size || metadata.contentType !== capture.content_type) {
      throw new HttpsError('invalid-argument', 'The uploaded file does not match this capture.');
    }
    // Storage rules prohibit client rewrites, and the read is pinned to the
    // observed generation as a second boundary against a replacement race.
    [head] = await getStorage().bucket().file(capture.storage_path, { generation: metadata.generation }).download({ start: 0, end: 31 });
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    if (typeof error === 'object' && error && 'code' in error && Number(error.code) === 404) {
      throw new HttpsError('failed-precondition', 'Upload the capture before finishing it.', { reason: 'upload-required' });
    }
    throw new HttpsError('unavailable', 'Could not verify this upload. Please retry.');
  }
  if (!matchesGameCaptureSignature(head, capture.content_type)) throw new HttpsError('invalid-argument', 'The file format does not match its media type.');
  return db.runTransaction(async tx => {
    const current = (await tx.get(ref)).data() as Capture | undefined;
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
  if (postId !== `game_${id}`) throw new HttpsError('invalid-argument', 'The published post must belong to this capture.');
  const ref = db.collection('game_captures').doc(id);
  const result = await db.runTransaction(async tx => {
    const capture = (await tx.get(ref)).data() as Capture | undefined;
    assertOwner(capture, uid);
    if (capture.status === 'imported') return receipt(id, capture);
    assertLive(capture);
    if (capture.status !== 'ready') throw new HttpsError('failed-precondition', 'Finish uploading this capture first.');
    if (!await committedCapturePost(tx, id, uid)) throw new HttpsError('permission-denied', 'This post does not belong to you.');
    return receipt(id, reconcileImportedCapture(tx, id, capture, postId));
  });
  return result;
});

export const discardGameCapture = onCall(opts, async (request) => {
  const uid = await authenticate(request);
  const id = validate(() => validateGameCaptureId(request.data?.captureId));
  const ref = db.collection('game_captures').doc(id);
  const alreadyPublished = await db.runTransaction(async tx => {
    const capture = (await tx.get(ref)).data() as Capture | undefined;
    assertOwner(capture, uid);
    if (capture.status === 'imported') return true;
    const postId = await committedCapturePost(tx, id, uid);
    if (postId) {
      reconcileImportedCapture(tx, id, capture, postId);
      return true;
    }
    tx.update(ref, { status: 'cancelled', cleanup_at_ms: Date.now() });
    return false;
  });
  // Throw after the transaction commits, or the recovered imported state rolls back.
  if (alreadyPublished) throw new HttpsError('failed-precondition', 'This capture is already published. Manage the post in VYBE.');
  return { ok: true };
});

/** Bounded cleanup keeps tombstones for seven days to preserve upload retries. */
export const cleanupGameCaptures = onSchedule({ schedule: 'every 60 minutes', region: 'us-central1', timeoutSeconds: 120 }, async () => {
  const now = Date.now();
  const expired = await db.collection('game_captures').where('cleanup_at_ms', '<=', now).limit(200).get();
  for (const doc of expired.docs) {
    const capture = doc.data() as Capture;
    // Set a terminal state before deleting: a delayed upload can no longer pass rules.
    await db.runTransaction(async tx => {
      const current = (await tx.get(doc.ref)).data() as Capture | undefined;
      if (current && (current.status === 'uploading' || current.status === 'ready')) tx.update(doc.ref, { status: 'expired' });
    });
    await getStorage().bucket().file(capture.storage_path).delete({ ignoreNotFound: true });
    if (now > capture.expires_at_ms + 7 * GAME_CAPTURE_TTL_MS) await doc.ref.delete();
    else await doc.ref.update({ cleanup_at_ms: capture.expires_at_ms + 7 * GAME_CAPTURE_TTL_MS + 1 });
  }
});
