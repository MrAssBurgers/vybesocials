import { createHash } from 'node:crypto';
import { getStorage } from 'firebase-admin/storage';
import type { Transaction } from 'firebase-admin/firestore';
import { db } from './admin.js';
import { assertCaptureLive, captureReceipt, committedCapturePost, hashGameValue, reconcileImportedCapture, reserveCapture, type Capture } from './gameCaptureCore.js';
import { authorizePartner, PARTNER_CHUNK_BYTES, PartnerError, type PartnerPrincipal } from './gamePartnerCore.js';
import { matchesGameCaptureSignature, validateGameCaptureId, validateGameCaptureInput } from '../gameIntegrationValidation.js';

interface Chunk { byte_size: number; sha256: string; generation: string; }
interface Upload { status: 'pending' | 'complete' | 'expired'; chunks: Record<string, Chunk>; cleanup_at_ms: number; purge_at_ms: number; }
const partnerReceipt = (id: string, capture: Capture) => {
  const { storagePath: _privatePath, ...publicReceipt } = captureReceipt(id, capture);
  return publicReceipt;
};
function checkBinding(capture: Capture | undefined, principal: PartnerPrincipal, allowCancelled = false): asserts capture is Capture {
  if (!capture || capture.owner_uid !== principal.uid || capture.game_id !== principal.clientId || capture.partner_connection_id !== principal.connectionId) {
    throw new PartnerError(404, 'not_found', 'Capture not found for this connection.');
  }
  if (allowCancelled && capture.status === 'cancelled') return;
  try { assertCaptureLive(capture); } catch { throw new PartnerError(410, 'expired_capture', 'This capture expired or was discarded.'); }
}
async function boundCapture(tx: Transaction, token: string, id: string, write = false, allowCancelled = false) {
  const principal = await authorizePartner(tx, token, write ? 'capture:write' : 'capture:status');
  const capture = (await tx.get(db.collection('game_captures').doc(id))).data() as Capture | undefined;
  checkBinding(capture, principal, allowCancelled);
  return { principal, capture };
}
function digest(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new PartnerError(400, 'invalid_request', 'Provide a lowercase SHA-256 checksum.');
  return value;
}
const storageCode = (error: unknown) => Number((error as { code?: unknown })?.code);
const chunkPath = (id: string, index: number) => `game-partner-staging/${id}/${index}`;
function chunkLength(capture: Capture, index: number) {
  if (!Number.isInteger(index) || index < 0 || index >= Math.ceil(capture.byte_size / PARTNER_CHUNK_BYTES)) throw new PartnerError(400, 'invalid_request', 'Invalid chunk index.');
  return Math.min(PARTNER_CHUNK_BYTES, capture.byte_size - index * PARTNER_CHUNK_BYTES);
}
function requireOpenUpload(upload: Upload | undefined) {
  if (!upload || upload.status !== 'pending' || upload.cleanup_at_ms <= Date.now()) throw new PartnerError(409, 'conflict', 'This upload is no longer accepting chunks.');
}

export async function createPartnerCapture(token: string, raw: unknown) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new PartnerError(400, 'invalid_request', 'Capture details are required.');
  const data = raw as Record<string, unknown>;
  const contentSha256 = digest(data.contentSha256);
  return db.runTransaction(async tx => {
    const principal = await authorizePartner(tx, token, 'capture:write');
    if (data.gameId !== undefined && data.gameId !== principal.clientId) throw new PartnerError(403, 'access_denied', 'This token belongs to a different game.');
    const input = validateGameCaptureInput({ ...data, gameId: principal.clientId });
    const reserved = await reserveCapture(tx, principal.uid, input, principal.game, { connectionId: principal.connectionId, contentSha256 });
    if (reserved.created) tx.create(db.collection('game_partner_uploads').doc(reserved.id), {
      status: 'pending', chunks: {}, cleanup_at_ms: principal.expiresAt + 120000, purge_at_ms: principal.expiresAt + 86400000,
    } satisfies Upload);
    return partnerReceipt(reserved.id, reserved.capture);
  });
}

export async function getPartnerCapture(token: string, rawId: unknown) {
  const id = validateGameCaptureId(rawId);
  return db.runTransaction(async tx => {
    const { capture, principal } = await boundCapture(tx, token, id);
    if (capture.status === 'ready') {
      const postId = await committedCapturePost(tx, id, principal.uid);
      if (postId) return partnerReceipt(id, reconcileImportedCapture(tx, id, capture, postId));
    }
    return partnerReceipt(id, capture);
  });
}

export async function putPartnerChunk(token: string, rawId: unknown, index: number, bytes: Buffer, rawChecksum: unknown) {
  const id = validateGameCaptureId(rawId);
  const checksum = digest(rawChecksum);
  if (!Buffer.isBuffer(bytes) || bytes.length > PARTNER_CHUNK_BYTES) throw new PartnerError(413, 'payload_too_large', 'Send at most 8 MiB per chunk.');
  if (hashGameValue(bytes) !== checksum) throw new PartnerError(400, 'invalid_request', 'The chunk checksum does not match its bytes.');
  const uploadRef = db.collection('game_partner_uploads').doc(id);
  const initial = await db.runTransaction(async tx => {
    const { capture } = await boundCapture(tx, token, id, true);
    const upload = (await tx.get(uploadRef)).data() as Upload | undefined;
    if (bytes.length !== chunkLength(capture, index)) throw new PartnerError(400, 'invalid_request', 'The chunk has an unexpected byte length.');
    const previous = upload?.chunks?.[String(index)];
    if (previous && (previous.sha256 !== checksum || previous.byte_size !== bytes.length)) throw new PartnerError(409, 'conflict', 'That chunk index already contains different bytes.');
    if (previous) return { previous };
    requireOpenUpload(upload);
    if (capture.status !== 'uploading') throw new PartnerError(409, 'conflict', 'This capture is already finished.');
    return { previous: undefined };
  });
  if (initial.previous) return { index, byteSize: bytes.length, sha256: checksum };
  const file = getStorage().bucket().file(chunkPath(id, index));
  try {
    await file.save(bytes, {
      resumable: false, validation: 'crc32c', preconditionOpts: { ifGenerationMatch: 0 },
      metadata: { contentType: 'application/octet-stream', cacheControl: 'private,no-store', metadata: { sha256: checksum } },
    });
  } catch (error) {
    if (storageCode(error) !== 412) throw error;
    // A crash or concurrent retry may have saved the object before its receipt.
  }
  const [metadata] = await file.getMetadata();
  if (Number(metadata.size) !== bytes.length || metadata.metadata?.sha256 !== checksum || !metadata.generation) throw new PartnerError(409, 'conflict', 'That chunk index already contains different bytes.');
  await db.runTransaction(async tx => {
    const { capture } = await boundCapture(tx, token, id, true);
    const upload = (await tx.get(uploadRef)).data() as Upload | undefined;
    const previous = upload?.chunks?.[String(index)];
    if (previous?.sha256 === checksum && previous.generation === String(metadata.generation)) return;
    requireOpenUpload(upload);
    if (capture.status !== 'uploading' || previous) throw new PartnerError(409, 'conflict', 'This capture changed during upload.');
    tx.update(uploadRef, { [`chunks.${index}`]: { byte_size: bytes.length, sha256: checksum, generation: String(metadata.generation) } });
  });
  return { index, byteSize: bytes.length, sha256: checksum };
}

export async function finishPartnerCapture(token: string, rawId: unknown) {
  const id = validateGameCaptureId(rawId);
  const uploadRef = db.collection('game_partner_uploads').doc(id);
  const initial = await db.runTransaction(async tx => {
    const { capture } = await boundCapture(tx, token, id, true);
    const upload = (await tx.get(uploadRef)).data() as Upload | undefined;
    if (capture.status !== 'uploading') return { capture, upload };
    requireOpenUpload(upload);
    return { capture, upload: upload! };
  });
  const { capture, upload } = initial;
  if (capture.status !== 'uploading') return partnerReceipt(id, capture);
  const count = Math.ceil(capture.byte_size / PARTNER_CHUNK_BYTES);
  const chunks = Array.from({ length: count }, (_, index) => upload!.chunks[String(index)]);
  if (chunks.some((chunk, index) => !chunk || chunk.byte_size !== chunkLength(capture, index))) throw new PartnerError(409, 'conflict', 'Upload every chunk before finishing.');
  const bucket = getStorage().bucket();
  const files = chunks.map((chunk, index) => bucket.file(chunkPath(id, index), { generation: chunk.generation }));
  const wholeHash = createHash('sha256');
  for (let index = 0; index < count; index++) {
    const [bytes] = await files[index].download();
    if (bytes.length !== chunks[index].byte_size || hashGameValue(bytes) !== chunks[index].sha256) throw new PartnerError(409, 'conflict', 'Uploaded chunk verification failed.');
    if (index === 0 && !matchesGameCaptureSignature(bytes.subarray(0, 32), capture.content_type)) throw new PartnerError(400, 'invalid_request', 'The file format does not match its media type.');
    wholeHash.update(bytes);
  }
  if (wholeHash.digest('hex') !== capture.content_sha256) throw new PartnerError(409, 'conflict', 'The whole-file checksum does not match this capture.');
  // Recheck before composing and again before making the capture available for review.
  await db.runTransaction(tx => boundCapture(tx, token, id, true));
  const destination = bucket.file(capture.storage_path);
  destination.metadata = { contentType: capture.content_type };
  let preexisting = false;
  try { await bucket.combine(files, destination, { ifGenerationMatch: 0 }); } catch (error) {
    if (storageCode(error) !== 412) throw error;
    preexisting = true;
  }
  const [metadata] = await destination.getMetadata();
  if (Number(metadata.size) !== capture.byte_size || metadata.contentType !== capture.content_type || !metadata.generation) throw new PartnerError(409, 'conflict', 'The composed capture does not match its reservation.');
  if (preexisting) {
    const [bytes] = await bucket.file(capture.storage_path, { generation: metadata.generation }).download();
    if (bytes.length !== capture.byte_size || hashGameValue(bytes) !== capture.content_sha256) throw new PartnerError(409, 'conflict', 'The composed capture checksum does not match.');
  }
  return db.runTransaction(async tx => {
    const { capture: current } = await boundCapture(tx, token, id, true);
    const currentUpload = (await tx.get(uploadRef)).data() as Upload | undefined;
    if (current.status !== 'uploading') return partnerReceipt(id, current);
    requireOpenUpload(currentUpload);
    tx.update(db.collection('game_captures').doc(id), { status: 'ready', ready_at: new Date().toISOString() });
    tx.update(uploadRef, { status: 'complete' });
    return partnerReceipt(id, { ...current, status: 'ready' });
  });
}

export async function discardPartnerCapture(token: string, rawId: unknown) {
  const id = validateGameCaptureId(rawId);
  const published = await db.runTransaction(async tx => {
    const { capture, principal } = await boundCapture(tx, token, id, true, true);
    if (capture.status === 'imported') return true;
    const postId = await committedCapturePost(tx, id, principal.uid);
    if (postId) {
      reconcileImportedCapture(tx, id, capture, postId);
      return true;
    }
    if (capture.status === 'cancelled') return false;
    tx.update(db.collection('game_captures').doc(id), { status: 'cancelled', cleanup_at_ms: Date.now() });
    return false;
  });
  if (published) throw new PartnerError(409, 'conflict', 'This capture is published. Manage the post in VYBE.');
  return { ok: true };
}

export async function revokePartnerToken(token: string) {
  await db.runTransaction(async tx => {
    const principal = await authorizePartner(tx, token, 'capture:write');
    tx.update(db.collection('game_partner_connections').doc(principal.connectionId), { status: 'revoked', revoked_at_ms: Date.now() });
  });
  return { ok: true };
}
