import { FieldPath } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { db } from './admin.js';
import { authorizePartner, PARTNER_CHUNK_BYTES, PartnerError } from './gamePartnerCore.js';
import { assertCaptureLive, captureReceipt, committedCapturePost, hashGameValue } from './gameCaptureCore.js';
import { MAX_GAME_CAPTURE_BYTES, matchesGameCaptureSignature, validateGameCaptureId } from '../gameIntegrationValidation.js';
const unavailable = () => new PartnerError(404, 'not_found', 'This capture preview is unavailable.');
/** Bounded, connection-owned gallery. The cursor is only an ordering key, never authority. */
export async function listPartnerCaptures(token, rawCursor) {
    const cursor = rawCursor === undefined ? null : validateGameCaptureId(rawCursor);
    return db.runTransaction(async (tx) => {
        const principal = await authorizePartner(tx, token, 'capture:status');
        let query = db.collection('game_captures').where('partner_connection_id', '==', principal.connectionId)
            .orderBy(FieldPath.documentId()).limit(21);
        if (cursor)
            query = query.startAfter(cursor);
        const page = await tx.get(query);
        const rows = page.docs.slice(0, 20);
        const captures = [];
        for (const row of rows) {
            const capture = row.data();
            if (capture.owner_uid !== principal.uid || capture.game_id !== principal.clientId
                || capture.partner_connection_id !== principal.connectionId)
                throw unavailable();
            if (!Number.isSafeInteger(capture.expires_at_ms) || capture.expires_at_ms <= Date.now()
                || !['uploading', 'ready', 'imported'].includes(capture.status))
                continue;
            const postId = capture.status === 'ready' ? await committedCapturePost(tx, row.id, principal.uid) : null;
            const { storagePath: _path, ...receipt } = captureReceipt(row.id, postId ? { ...capture, status: 'imported', post_id: postId } : capture);
            captures.push(receipt);
        }
        return { captures, nextCursor: page.docs.length > 20 ? rows.at(-1).id : null };
    });
}
async function previewAuthority(token, id) {
    return db.runTransaction(async (tx) => {
        const principal = await authorizePartner(tx, token, 'capture:preview');
        const capture = (await tx.get(db.collection('game_captures').doc(id))).data();
        if (!capture || capture.owner_uid !== principal.uid || capture.game_id !== principal.clientId
            || capture.partner_connection_id !== principal.connectionId || capture.status !== 'ready'
            || !Number.isSafeInteger(capture.expires_at_ms) || capture.expires_at_ms <= Date.now()
            || capture.storage_path !== `game-captures/${principal.uid}/${id}`
            || typeof capture.content_sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(capture.content_sha256)
            || !Number.isSafeInteger(capture.byte_size) || capture.byte_size < 12 || capture.byte_size > MAX_GAME_CAPTURE_BYTES
            || !['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'video/webm'].includes(capture.content_type))
            throw unavailable();
        assertCaptureLive(capture);
        // Imported captures are managed through the post, including its deletion/audience.
        if (await committedCapturePost(tx, id, principal.uid))
            throw unavailable();
        return capture;
    });
}
export async function checkPartnerCapturePreview(token, rawId) {
    await previewAuthority(token, validateGameCaptureId(rawId));
}
/** Return bytes, never Storage URLs, account identifiers or long-lived bearer links. */
export async function readPartnerCapturePreview(token, rawId, chunk = 0) {
    const id = validateGameCaptureId(rawId);
    const capture = await previewAuthority(token, id);
    if (!Number.isInteger(chunk) || chunk < 0 || chunk >= Math.ceil(capture.byte_size / PARTNER_CHUNK_BYTES))
        throw new PartnerError(400, 'invalid_request', 'Choose an available preview chunk.');
    const bucket = getStorage().bucket();
    let bytes;
    try {
        const [metadata] = await bucket.file(capture.storage_path).getMetadata();
        if (!metadata.generation || Number(metadata.size) !== capture.byte_size || metadata.contentType !== capture.content_type)
            throw unavailable();
        [bytes] = await bucket.file(capture.storage_path, { generation: metadata.generation }).download();
    }
    catch (error) {
        if (error instanceof PartnerError)
            throw error;
        if ([404, 412].includes(Number(error?.code)))
            throw unavailable();
        throw error;
    }
    if (bytes.length !== capture.byte_size || hashGameValue(bytes) !== capture.content_sha256
        || !matchesGameCaptureSignature(bytes.subarray(0, 32), capture.content_type))
        throw unavailable();
    const current = await previewAuthority(token, id);
    if (current.fingerprint !== capture.fingerprint || current.content_sha256 !== capture.content_sha256
        || current.byte_size !== capture.byte_size || current.content_type !== capture.content_type)
        throw unavailable();
    const offset = chunk * PARTNER_CHUNK_BYTES;
    return { bytes: bytes.subarray(offset, offset + PARTNER_CHUNK_BYTES), contentType: capture.content_type,
        offset, total: capture.byte_size, sha256: capture.content_sha256 };
}
//# sourceMappingURL=gamePartnerPreview.js.map