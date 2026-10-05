import { createHash, randomUUID } from 'node:crypto';
import { FieldPath, Timestamp } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db, requireAuth, rateLimit, enforceRateLimit } from './_shared/admin.js';
import { resolveIdentity, validAudienceId } from './_shared/profileAudienceAuthority.js';
import { inspectSound, SOUND_MAX_BYTES, SOUND_TYPES } from './_shared/soundInspection.js';
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const unavailable = () => new HttpsError('failed-precondition', 'This sound upload is unavailable. Start a new upload.');
const proofRef = (database, id) => database.doc(`_sound_uploads/${id}`);
const validUpload = (id) => typeof id === 'string' && /^[a-f0-9]{64}$/.test(id);
function inputRow(uid, raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        throw new HttpsError('invalid-argument', 'Sound details are required.');
    const input = raw;
    if (input.expectedOwnerUid !== uid)
        throw new HttpsError('failed-precondition', 'Your account changed. Reopen the sound upload.');
    if (!validAudienceId(input.expectedProfileId))
        throw new HttpsError('invalid-argument', 'A valid profile is required.');
    return input;
}
async function actor(database, tx, uid, profileId) {
    const result = await resolveIdentity(database, tx, uid);
    if (!result || result.uid !== uid || result.profileId !== profileId)
        throw new HttpsError('failed-precondition', 'Your profile identity changed. Reopen sounds.');
    return result;
}
function validProof(row, id) {
    return !!row && row.version === 1 && row.upload_id === id && validAudienceId(row.owner_uid) && validAudienceId(row.profile_id)
        && row.source_path === `sound-uploads/${row.owner_uid}/${id}/source` && Number.isSafeInteger(row.byte_size) && row.byte_size > 0 && row.byte_size <= SOUND_MAX_BYTES
        && SOUND_TYPES.includes(row.content_type) && /^[a-f0-9]{64}$/.test(row.source_sha256) && typeof row.expires_at_ms === 'number';
}
function publicSound(row, proof) {
    return !!row && row.publication_version === 1 && row.sound_id === proof.upload_id && row.owner_uid === proof.owner_uid && row.uploader_id === proof.profile_id
        && row.status === 'published' && row.is_approved === true && !row.is_deleted && !row.deleted_at
        && ['not_reviewed', 'approved'].includes(row.moderation_status) && row.object_path === proof.object_path && row.generation === proof.generation && proof.status === 'published';
}
function receipt(row) {
    return { success: true, ownerUid: row.owner_uid, profileId: row.profile_id, uploadId: row.upload_id, status: row.status,
        sourcePath: row.source_path, expiresAt: row.expires_at_ms, soundId: row.status === 'published' ? row.upload_id : null };
}
function keys(input, allowed) {
    if (Object.keys(input).some(key => !['action', 'expectedOwnerUid', 'expectedProfileId', ...allowed].includes(key)))
        throw new HttpsError('invalid-argument', 'Unsupported sound details.');
}
export async function runUploadSound(database, uid, raw, decode = inspectSound) {
    const input = inputRow(uid, raw), profileId = input.expectedProfileId;
    if (!['reserve', 'status', 'finalize', 'cancel'].includes(input.action))
        throw new HttpsError('invalid-argument', 'Unsupported upload action.');
    keys(input, input.action === 'reserve' ? ['requestId', 'title', 'tags', 'byteSize', 'contentType', 'sha256', 'publicConsent'] : ['uploadId']);
    if (input.action === 'reserve') {
        if (typeof input.requestId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(input.requestId) || typeof input.title !== 'string' || !input.title.trim() || input.title.length > 100
            || !Array.isArray(input.tags) || input.tags.length > 10 || input.tags.some((tag) => typeof tag !== 'string' || !tag.trim() || tag.length > 30)
            || !Number.isSafeInteger(input.byteSize) || input.byteSize < 16 || input.byteSize > SOUND_MAX_BYTES || !SOUND_TYPES.includes(input.contentType)
            || typeof input.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(input.sha256) || input.publicConsent !== true)
            throw new HttpsError('invalid-argument', 'Choose valid audio up to 20 MiB and confirm public sharing.');
        const id = hash([uid, input.requestId]), fingerprint = hash([profileId, input.title.trim(), input.tags, input.byteSize, input.contentType, input.sha256, true]);
        return database.runTransaction(async (tx) => {
            await actor(database, tx, uid, profileId);
            const ref = proofRef(database, id), prior = await tx.get(ref), quotaRef = database.doc(`_sound_upload_limits/${uid}`), quota = await tx.get(quotaRef);
            if (prior.exists) {
                const row = prior.data();
                if (!validProof(row, id) || row.owner_uid !== uid || row.profile_id !== profileId || row.fingerprint !== fingerprint)
                    throw new HttpsError('already-exists', 'This request was already used for different sound details.');
                if (row.status === 'published') {
                    const sound = await tx.get(database.doc(`sounds/${id}`));
                    if (!publicSound(sound.data(), row))
                        throw unavailable();
                }
                else if (row.status === 'cancelled')
                    return receipt(row);
                else if (row.expires_at_ms <= Date.now())
                    return receipt({ ...row, status: 'expired' });
                return receipt(row);
            }
            const now = Date.now(), day = new Date(now).toISOString().slice(0, 10), old = quota.data();
            const count = old?.day === day ? old.count : 0, bytes = old?.day === day ? old.bytes : 0;
            if (!Number.isSafeInteger(count) || !Number.isSafeInteger(bytes) || count >= 20 || bytes + input.byteSize > 200 * 1024 * 1024)
                throw new HttpsError('resource-exhausted', 'Your daily sound upload limit is reached. Try again tomorrow.');
            const row = { version: 1, upload_id: id, owner_uid: uid, profile_id: profileId, fingerprint, source_path: `sound-uploads/${uid}/${id}/source`,
                byte_size: input.byteSize, content_type: input.contentType, source_sha256: input.sha256, title: input.title.trim(), tags: input.tags,
                status: 'uploading', public_consent: true, created_at_ms: now, expires_at_ms: now + 15 * 60_000 };
            tx.create(ref, row);
            tx.set(quotaRef, { day, count: count + 1, bytes: bytes + input.byteSize });
            return receipt(row);
        });
    }
    if (!validUpload(input.uploadId))
        throw new HttpsError('invalid-argument', 'A valid upload is required.');
    const id = input.uploadId, ref = proofRef(database, id), lease = randomUUID();
    const initial = await database.runTransaction(async (tx) => {
        await actor(database, tx, uid, profileId);
        const snap = await tx.get(ref), row = snap.data();
        if (!validProof(row, id) || row.owner_uid !== uid || row.profile_id !== profileId)
            throw new HttpsError('not-found', 'Sound upload not found.');
        const sound = await tx.get(database.doc(`sounds/${id}`));
        if (row.status === 'published') {
            if (!publicSound(sound.data(), row))
                throw unavailable();
            return row;
        }
        if (input.action === 'cancel') {
            tx.update(ref, { status: 'cancelled', cancelled_at_ms: Date.now() });
            return { ...row, status: 'cancelled' };
        }
        if (input.action === 'status' && row.status === 'cancelled')
            return row;
        if (input.action === 'status' && row.expires_at_ms <= Date.now())
            return { ...row, status: 'expired' };
        if (row.status === 'cancelled' || row.expires_at_ms <= Date.now() || sound.exists)
            throw unavailable();
        if (input.action === 'status')
            return row;
        if (row.status === 'checking' && row.lease_until > Date.now())
            return row;
        if (!['checking', 'uploading'].includes(row.status))
            throw unavailable();
        tx.update(ref, { status: 'checking', lease, lease_until: Date.now() + 150000 });
        return { ...row, status: 'checking', lease };
    });
    if (input.action !== 'finalize' || initial.status === 'published' || initial.lease !== lease) {
        if (input.action === 'cancel' && initial.status === 'cancelled')
            await getStorage().bucket().file(initial.source_path).delete({ ignoreNotFound: true }).catch(() => { });
        return receipt(initial);
    }
    const bucket = getStorage().bucket();
    let candidate, publicationStaged = false;
    try {
        const source = bucket.file(initial.source_path), [metadata] = await source.getMetadata();
        if (!metadata.generation || Number(metadata.size) !== initial.byte_size || metadata.contentType !== initial.content_type)
            throw new HttpsError('invalid-argument', 'Uploaded audio does not match its reservation.');
        const generation = String(metadata.generation), [bytes] = await bucket.file(initial.source_path, { generation }).download();
        if (bytes.length !== initial.byte_size || createHash('sha256').update(bytes).digest('hex') !== initial.source_sha256)
            throw new HttpsError('invalid-argument', 'Uploaded audio checksum did not match. Choose the original file again.');
        const checked = await decode(bytes, initial.content_type);
        candidate = `original-sounds/${uid}/${id}/${randomUUID()}.wav`;
        const token = randomUUID(), output = bucket.file(candidate);
        await output.save(checked.bytes, { resumable: false, preconditionOpts: { ifGenerationMatch: 0 }, metadata: { contentType: 'audio/wav', cacheControl: 'public,max-age=300', metadata: { firebaseStorageDownloadTokens: token } } });
        const [outputMetadata] = await output.getMetadata();
        if (!outputMetadata.generation || Number(outputMetadata.size) !== checked.bytes.length || outputMetadata.contentType !== 'audio/wav')
            throw unavailable();
        const path = candidate, outputGeneration = String(outputMetadata.generation);
        const result = await database.runTransaction(async (tx) => {
            const identity = await actor(database, tx, uid, profileId), latest = (await tx.get(ref)).data(), soundRef = database.doc(`sounds/${id}`), sound = await tx.get(soundRef);
            if (!validProof(latest, id) || latest.owner_uid !== uid || latest.profile_id !== profileId)
                throw unavailable();
            if (latest.status === 'published') {
                if (!publicSound(sound.data(), latest))
                    throw unavailable();
                return latest;
            }
            if (latest.status !== 'checking' || latest.lease !== lease || latest.expires_at_ms <= Date.now() || sound.exists)
                throw unavailable();
            const now = new Date().toISOString(), row = { sound_id: id, publication_version: 1, owner_uid: uid, uploader_id: profileId, title: initial.title,
                artist: typeof identity.row.display_name === 'string' ? identity.row.display_name.slice(0, 150) : typeof identity.row.username === 'string' ? identity.row.username.slice(0, 150) : 'VYBE creator',
                duration: checked.duration, tags: initial.tags, status: 'published', is_approved: true, moderation_status: 'not_reviewed', is_original: true,
                is_extracted: false, is_explicit: false, usage_count: 0, trend_score: 0, object_path: path, generation: outputGeneration, created_at: now, updated_at: now };
            const updated = { ...latest, status: 'published', object_path: path, generation: outputGeneration, source_generation: generation, download_token: token, duration: checked.duration, published_at_ms: Date.now() };
            publicationStaged = true;
            tx.create(soundRef, row);
            tx.update(ref, { status: updated.status, object_path: path, generation: outputGeneration, source_generation: generation, download_token: token, duration: checked.duration, published_at_ms: updated.published_at_ms });
            return updated;
        });
        if (result.object_path !== candidate)
            await bucket.file(candidate).delete({ ignoreNotFound: true }).catch(() => { });
        await source.delete({ ignoreNotFound: true, ifGenerationMatch: Number(generation) }).catch(() => { });
        return receipt(result);
    }
    catch (error) {
        if (candidate && !publicationStaged)
            await bucket.file(candidate).delete({ ignoreNotFound: true }).catch(() => { });
        // Never clear another worker's lease or an uncertain committed publication.
        await database.runTransaction(async (tx) => { const row = (await tx.get(ref)).data(); if (row?.status === 'checking' && row.lease === lease)
            tx.update(ref, { status: 'uploading', lease_until: 0 }); }).catch(() => { });
        throw error;
    }
}
export async function runReadSoundLibrary(database, uid, raw) {
    const input = inputRow(uid, raw);
    keys(input, ['kind', 'cursor', 'soundId']);
    if (!['list', 'get'].includes(input.action) || (input.action === 'get' && (!validUpload(input.soundId) || input.kind !== undefined || input.cursor !== undefined))
        || (input.action === 'list' && (!['new', 'trending', 'mine'].includes(input.kind) || input.soundId !== undefined || (input.cursor !== undefined && (typeof input.cursor !== 'string' || !/^[a-f0-9]{32}$/.test(input.cursor))))))
        throw new HttpsError('invalid-argument', 'Invalid sound selection.');
    return database.runTransaction(async (tx) => {
        const viewer = await actor(database, tx, uid, input.expectedProfileId);
        let candidates;
        if (input.action === 'get')
            candidates = [await tx.get(proofRef(database, input.soundId))];
        else {
            let query = database.collection('_sound_uploads').where('status', '==', 'published').orderBy('published_at_ms', 'desc').orderBy(FieldPath.documentId(), 'desc').limit(25);
            if (input.kind === 'mine')
                query = query.where('owner_uid', '==', uid);
            if (input.cursor) {
                const cursor = (await tx.get(database.doc(`_sound_library_cursors/${input.cursor}`))).data();
                if (!cursor || cursor.version !== 1 || cursor.owner_uid !== uid || cursor.profile_id !== viewer.profileId || cursor.kind !== input.kind || cursor.expires_at_ms <= Date.now() || !Number.isSafeInteger(cursor.position_ms) || !validUpload(cursor.position_id))
                    throw new HttpsError('failed-precondition', 'This sound page expired or changed. Refresh sounds.');
                query = query.startAfter(cursor.position_ms, cursor.position_id);
            }
            candidates = (await tx.get(query)).docs;
        }
        const sounds = [];
        for (const document of candidates) {
            if (!document.exists || !validUpload(document.id))
                continue;
            const proof = document.data(), row = (await tx.get(database.doc(`sounds/${document.id}`))).data();
            if (!row || !validProof(proof, document.id) || !publicSound(row, proof) || (input.kind === 'mine' && proof.owner_uid !== uid))
                continue;
            const owner = await resolveIdentity(database, tx, proof.owner_uid);
            if (!owner || owner.uid !== proof.owner_uid || owner.profileId !== proof.profile_id)
                continue;
            if (owner.uid !== uid) {
                const [outgoing, incoming] = await Promise.all([tx.get(database.collection('blocked_users').where('blocker_id', 'in', viewer.aliases).where('blocked_id', 'in', owner.aliases).limit(1)), tx.get(database.collection('blocked_users').where('blocker_id', 'in', owner.aliases).where('blocked_id', 'in', viewer.aliases).limit(1))]);
                if (!outgoing.empty || !incoming.empty)
                    continue;
            }
            if (typeof proof.object_path !== 'string' || !proof.object_path.startsWith(`original-sounds/${proof.owner_uid}/${document.id}/`) || typeof proof.download_token !== 'string' || !/^[a-z0-9-]{36}$/.test(proof.download_token))
                continue;
            const bucket = getStorage().bucket().name;
            const host = process.env.FIREBASE_STORAGE_EMULATOR_HOST ? `http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST}` : 'https://firebasestorage.googleapis.com';
            const url = `${host}/v0/b/${bucket}/o/${encodeURIComponent(proof.object_path)}?alt=media&token=${encodeURIComponent(proof.download_token)}`;
            sounds.push({ sound_id: document.id, title: row.title, artist: row.artist, uploader_id: row.uploader_id, duration: row.duration, audio_url: url, preview_url: url,
                tags: row.tags, usage_count: 0, trend_score: 0, is_original: true, is_extracted: false, is_approved: true, is_explicit: false, moderation_status: row.moderation_status,
                created_at: row.created_at, updated_at: row.updated_at, uploader_profile: { id: owner.profileId, display_name: row.artist, avatar_url: null } });
        }
        let nextCursor = null;
        if (input.action === 'list' && candidates.length === 25) {
            nextCursor = randomUUID().replaceAll('-', '');
            const last = candidates[candidates.length - 1], expires = Date.now() + 10 * 60_000;
            tx.create(database.doc(`_sound_library_cursors/${nextCursor}`), { version: 1, owner_uid: uid, profile_id: viewer.profileId, kind: input.kind, position_ms: last.data().published_at_ms, position_id: last.id, expires_at_ms: expires, expireAt: Timestamp.fromMillis(expires) });
        }
        return { success: true, ownerUid: uid, profileId: viewer.profileId, sounds, nextCursor };
    });
}
export const uploadSound = onCall({ region: 'us-central1', memory: '512MiB', cpu: 1, concurrency: 1, maxInstances: 5, timeoutSeconds: 120 }, async (request) => {
    const uid = requireAuth(request);
    enforceRateLimit(await rateLimit(`sound-upload:${uid}`, 60, 60));
    return runUploadSound(db, uid, request.data);
});
export const readSoundLibrary = onCall({ region: 'us-central1', cpu: 0.083, concurrency: 1, maxInstances: 10 }, async (request) => {
    const uid = requireAuth(request);
    enforceRateLimit(await rateLimit(`sound-library:${uid}`, 90, 60));
    return runReadSoundLibrary(db, uid, request.data);
});
//# sourceMappingURL=soundUpload.js.map