import { createHash, randomBytes } from 'node:crypto';
import { getStorage } from 'firebase-admin/storage';
import { HttpsError } from 'firebase-functions/v2/https';
import { db } from './admin.js';
import { communityActor, channelAccess, communityId, type Row } from './communityPolicy.js';

export const COMMUNITY_ATTACHMENT_MAX = 20 * 1024 * 1024;
export const COMMUNITY_ATTACHMENT_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'video/webm'];
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const unavailable = () => new HttpsError('failed-precondition', 'This attachment is unavailable. Select the file again to start a new upload.');
const proofRef = (assetId: string) => db.doc(`_community_attachments/${assetId}`);
const assetKey = (value: unknown): string => { if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw unavailable(); return value; };
function checkOwner(uid: string, input: Row) { if (input.expectedOwnerUid !== uid) throw new HttpsError('failed-precondition', 'Your account changed. Open this upload again.'); }
function validProof(row: Row | undefined, assetId: string): row is Row {
  return !!row && row.version === 1 && row.asset_id === assetId && typeof row.owner_uid === 'string'
    && (row.status === 'uploading' ? row.object_path === `community-private/${row.owner_uid}/${assetId}/original`
      : typeof row.object_path === 'string' && row.object_path.startsWith(`community-private/${row.owner_uid}/${assetId}/`) && /^sealed_[a-f0-9]{32}$/.test(row.object_path.slice(`community-private/${row.owner_uid}/${assetId}/`.length)))
    && row.message_id === `attachment_${assetId}`
    && Number.isSafeInteger(row.byte_size) && row.byte_size > 0 && row.byte_size <= COMMUNITY_ATTACHMENT_MAX
    && COMMUNITY_ATTACHMENT_TYPES.includes(row.content_type);
}
function acknowledgement(row: Row) {
  return { success: true, assetId: row.asset_id, ownerUid: row.owner_uid, channelId: row.channel_id, messageId: row.message_id,
    objectPath: row.object_path, byteSize: row.byte_size, contentType: row.content_type, status: row.status, expiresAt: row.expires_at_ms };
}

export async function reserveCommunityAttachment(uid: string, input: Row) {
  checkOwner(uid, input);
  if (typeof input.requestId !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(input.requestId)) throw new HttpsError('invalid-argument', 'Upload request ID required.');
  const channelId = communityId(input.channelId);
  if (!Number.isSafeInteger(input.byteSize) || input.byteSize < 1 || input.byteSize > COMMUNITY_ATTACHMENT_MAX
    || !COMMUNITY_ATTACHMENT_TYPES.includes(input.contentType)) throw new HttpsError('invalid-argument', 'Choose a PNG, JPEG, WebP, MP4 or WebM file up to 20 MiB.');
  if (input.content != null && (typeof input.content !== 'string' || input.content.length > 8000)) throw new HttpsError('invalid-argument', 'Attachment text is too long.');
  const content = typeof input.content === 'string' ? input.content.trim() : '';
  const actor = await communityActor(uid); const assetId = digest([uid, input.requestId]);
  const fingerprint = digest([channelId, input.byteSize, input.contentType, content]);
  const quotaRef = db.doc(`_community_attachment_limits/${uid}`);
  return db.runTransaction(async tx => {
    const access = await channelAccess(tx, channelId, actor);
    if (!access.permissions.can_send || !access.permissions.can_attach_media) throw new HttpsError('permission-denied', 'You cannot attach files in this channel.');
    const [prior, quota] = await Promise.all([tx.get(proofRef(assetId)), tx.get(quotaRef)]);
    if (prior.exists) {
      const row = prior.data();
      if (!validProof(row, assetId) || row.owner_uid !== uid || row.fingerprint !== fingerprint || row.profile_id !== actor.profileId) throw new HttpsError('already-exists', 'This upload request was already used with different details.');
      if (row.status !== 'ready' && row.expires_at_ms <= Date.now()) throw unavailable();
      return acknowledgement(row);
    }
    const now = Date.now(), day = new Date(now).toISOString().slice(0, 10); const old = quota.data();
    const count = old?.day === day ? old.count : 0, bytes = old?.day === day ? old.total_bytes : 0;
    if (!Number.isSafeInteger(count) || !Number.isSafeInteger(bytes) || count >= 30 || bytes + input.byteSize > 200 * 1024 * 1024) throw new HttpsError('resource-exhausted', 'Your daily attachment limit is reached. Try again tomorrow.');
    const row = { version: 1, asset_id: assetId, owner_uid: uid, profile_id: actor.profileId, server_id: access.serverId, channel_id: channelId,
      message_id: `attachment_${assetId}`, object_path: `community-private/${uid}/${assetId}/original`, byte_size: input.byteSize, content_type: input.contentType,
      status: 'uploading', created_at_ms: now, expires_at_ms: now + 15 * 60_000, content, fingerprint };
    tx.create(proofRef(assetId), row); tx.set(quotaRef, { day, count: count + 1, total_bytes: bytes + input.byteSize }); return acknowledgement(row);
  });
}

async function ownedUpload(uid: string, assetId: string) {
  const row = (await proofRef(assetId).get()).data();
  if (!validProof(row, assetId) || row.owner_uid !== uid) throw unavailable();
  if (!['uploading', 'uploaded', 'ready'].includes(row.status) || (row.status !== 'ready' && row.expires_at_ms <= Date.now())) throw unavailable();
  return row;
}

/** The client never creates a Firebase object or receives a download token. */
export async function uploadCommunityAttachment(uid: string, assetIdValue: unknown, bytes: Buffer, contentType: string) {
  const assetId = assetKey(assetIdValue), actor = await communityActor(uid);
  if (!Buffer.isBuffer(bytes) || bytes.length < 1 || bytes.length > COMMUNITY_ATTACHMENT_MAX || !COMMUNITY_ATTACHMENT_TYPES.includes(contentType)) throw new HttpsError('invalid-argument', 'Unsupported attachment bytes.');
  const checksum = createHash('sha256').update(bytes).digest('hex');
  const readAdmission = async (tx: import('firebase-admin/firestore').Transaction) => {
    const proof = await tx.get(proofRef(assetId)); const row = proof.data();
    if (!validProof(row, assetId) || row.owner_uid !== uid || row.profile_id !== actor.profileId) throw unavailable();
    const access = await channelAccess(tx, row.channel_id, actor);
    if (!access.permissions.can_send || !access.permissions.can_attach_media || access.serverId !== row.server_id) throw new HttpsError('permission-denied', 'Attachment access changed.');
    if (row.byte_size !== bytes.length || row.content_type !== contentType) throw new HttpsError('already-exists', 'This upload does not match its reservation.');
    if (row.status !== 'ready' && row.expires_at_ms <= Date.now()) throw unavailable();
    if (row.status === 'ready' || row.status === 'uploaded') {
      if (row.content_sha256 !== checksum) throw new HttpsError('already-exists', 'This attachment already contains different bytes.');
    } else if (row.status !== 'uploading' || row.expires_at_ms <= Date.now()) throw unavailable();
    return row;
  };
  const before = await db.runTransaction(readAdmission);
  if (before.status !== 'uploading') return acknowledgement(before);
  // Each contender gets a unique path; a losing request can never overwrite the
  // object selected by another request, even in emulators lacking preconditions.
  const path = `community-private/${uid}/${assetId}/sealed_${randomBytes(16).toString('hex')}`;
  const file = getStorage().bucket().file(path);
  let selectionStaged = false;
  let selected: Row;
  try {
    await file.save(bytes, { resumable: false, preconditionOpts: { ifGenerationMatch: 0 },
      metadata: { contentType, cacheControl: 'private, no-store' } });
    const [metadata] = await file.getMetadata();
    if (!metadata.generation || Number(metadata.size) !== bytes.length || metadata.contentType !== contentType || metadata.metadata?.firebaseStorageDownloadTokens) throw unavailable();
    const generation = String(metadata.generation);
    selected = await db.runTransaction(async tx => {
      const row = await readAdmission(tx);
      if (row.status !== 'uploading') return row;
      const updated = { ...row, status: 'uploaded', object_path: path, generation, content_sha256: checksum, uploaded_at_ms: Date.now() };
      // Keep this flag across retries: a failed acknowledgement after any staged
      // selection may represent a committed winning object.
      selectionStaged = true;
      tx.update(proofRef(assetId), { status: updated.status, object_path: path, generation, content_sha256: checksum, uploaded_at_ms: updated.uploaded_at_ms });
      return updated;
    });
  } catch (error) {
    let definitelyUnselected = !selectionStaged;
    if (!definitelyUnselected) {
      // A committed different selection is immutable. Any pending transaction
      // based on the old uploading version can no longer win against it.
      try {
        const current = (await proofRef(assetId).get()).data();
        definitelyUnselected = validProof(current, assetId) && ['uploaded', 'ready'].includes(current.status) && current.object_path !== path;
      } catch { /* No proof of a different winner: retain an uncertain candidate. */ }
    }
    if (definitelyUnselected) await file.delete({ ignoreNotFound: true }).catch(() => {});
    throw error;
  }
  // Cleanup only a positively identified loser. An unknown commit outcome must
  // retain its candidate, since deleting it could erase the winning object.
  if (selected.object_path !== path) await file.delete({ ignoreNotFound: true }).catch(() => {});
  return acknowledgement(selected);
}

export async function finalizeCommunityAttachment(uid: string, input: Row) {
  checkOwner(uid, input); const assetId = assetKey(input.assetId); const actor = await communityActor(uid);
  // Refuse work before touching bytes when the uploader has lost admission.
  const row = await ownedUpload(uid, assetId);
  await db.runTransaction(async tx => {
    const access = await channelAccess(tx, row.channel_id, actor);
    if (!access.permissions.can_send || !access.permissions.can_attach_media || access.serverId !== row.server_id || actor.profileId !== row.profile_id) throw new HttpsError('permission-denied', 'Attachment access changed.');
  });
  if (row.status === 'uploading') return { ...acknowledgement(row), uploadRequired: true, message: null };
  const generation = row.generation;
  if (typeof generation !== 'string' || !/^\d+$/.test(generation) || typeof row.content_sha256 !== 'string') throw unavailable();
  const [clean] = await getStorage().bucket().file(row.object_path, { generation }).getMetadata();
  if (String(clean.generation) !== generation || clean.metadata?.firebaseStorageDownloadTokens || Number(clean.size) !== row.byte_size || clean.contentType !== row.content_type) throw unavailable();
  return db.runTransaction(async tx => {
    const proof = await tx.get(proofRef(assetId)); const latest = proof.data();
    if (!validProof(latest, assetId) || latest.owner_uid !== uid || latest.profile_id !== actor.profileId || latest.fingerprint !== row.fingerprint) throw unavailable();
    const access = await channelAccess(tx, latest.channel_id, actor);
    if (!access.permissions.can_send || !access.permissions.can_attach_media || access.serverId !== latest.server_id) throw new HttpsError('permission-denied', 'Attachment access changed.');
    const messageRef = db.doc(`channel_messages/${latest.message_id}`), message = await tx.get(messageRef);
    if (latest.status === 'ready') {
      if (!message.exists || message.data()?.is_deleted || message.data()?.attachment_id !== assetId || message.data()?.channel_id !== latest.channel_id || message.data()?.server_id !== latest.server_id || message.data()?.author_id !== uid || message.data()?.sender_id !== latest.profile_id || message.data()?.media_url != null) throw new HttpsError('failed-precondition', 'This attachment was already sent and removed. It has not been posted again.', { reason: 'consumed' });
      return { ...acknowledgement(latest), message: { ...message.data(), id: message.id } };
    }
    if (latest.status !== 'uploaded' || latest.generation !== generation || latest.object_path !== row.object_path || latest.expires_at_ms <= Date.now() || message.exists) throw unavailable();
    const messageRow = { id: latest.message_id, channel_id: latest.channel_id, server_id: latest.server_id, sender_id: actor.profileId, author_id: uid,
      content: latest.content || null, media_url: null, media_type: latest.content_type.startsWith('image/') ? 'image' : 'video', attachment_id: assetId,
      is_pinned: false, is_deleted: false, is_edited: false, reply_to_id: null, created_at: new Date().toISOString() };
    tx.create(messageRef, messageRow); tx.update(proof.ref, { status: 'ready', generation, finalized_at_ms: Date.now() });
    return { ...acknowledgement({ ...latest, status: 'ready' }), message: messageRow };
  });
}

export async function authorizeCommunityAttachment(uid: string, messageId: string) {
  communityId(messageId); const actor = await communityActor(uid);
  return db.runTransaction(async tx => {
    const message = await tx.get(db.doc(`channel_messages/${messageId}`)); const row = message.data();
    if (!row || row.is_deleted || typeof row.attachment_id !== 'string') throw unavailable();
    const assetId = assetKey(row.attachment_id); const proof = (await tx.get(proofRef(assetId))).data();
    if (!validProof(proof, assetId) || proof.status !== 'ready' || typeof proof.generation !== 'string' || !/^\d+$/.test(proof.generation)
      || proof.message_id !== messageId || proof.channel_id !== row.channel_id || proof.server_id !== row.server_id || proof.owner_uid !== row.author_id || proof.profile_id !== row.sender_id || row.media_url != null) throw unavailable();
    const access = await channelAccess(tx, proof.channel_id, actor);
    if (!access.permissions.can_view || access.serverId !== proof.server_id) throw new HttpsError('permission-denied', 'You no longer have access to this attachment.');
    return proof;
  });
}

export function communityByteRange(header: string | undefined, size: number) {
  if (!header) return { start: 0, end: size - 1, partial: false };
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) throw new HttpsError('out-of-range', 'Unsupported byte range.');
  const first = match[1] ? Number(match[1]) : null, last = match[2] ? Number(match[2]) : null;
  if ((first !== null && !Number.isSafeInteger(first)) || (last !== null && !Number.isSafeInteger(last))) throw new HttpsError('out-of-range', 'Unsupported byte range.');
  const start = first === null ? Math.max(0, size - last!) : first;
  const end = first === null || last === null ? size - 1 : Math.min(last, size - 1);
  if (start < 0 || start >= size || end < start || (first === null && last === 0)) throw new HttpsError('out-of-range', 'Unsupported byte range.');
  return { start, end, partial: true };
}

export async function readCommunityAttachment(uid: string, messageId: string, rangeHeader?: string, head = false) {
  const proof = await authorizeCommunityAttachment(uid, messageId);
  const range = communityByteRange(rangeHeader, proof.byte_size);
  const file = getStorage().bucket().file(proof.object_path, { generation: proof.generation });
  const [metadata] = await file.getMetadata();
  if (String(metadata.generation) !== proof.generation || Number(metadata.size) !== proof.byte_size || metadata.contentType !== proof.content_type || metadata.metadata?.firebaseStorageDownloadTokens) throw unavailable();
  const bytes = head ? null : (await file.download({ start: range.start, end: range.end }))[0];
  if (bytes && bytes.length !== range.end - range.start + 1) throw unavailable();
  // The file read can outlast a removal; check authority again before returning.
  const current = await authorizeCommunityAttachment(uid, messageId);
  if (current.generation !== proof.generation || current.object_path !== proof.object_path) throw unavailable();
  return { bytes, contentType: proof.content_type as string, size: proof.byte_size as number, range };
}
