import { createHash, randomUUID } from 'node:crypto';
import { FieldPath, Timestamp } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db, requireAuth, rateLimit, enforceRateLimit } from './_shared/admin.js';
import { validAudienceId } from './_shared/profileAudienceAuthority.js';
import { admitSound, resolveSoundActor } from './soundUpload.js';
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const soundId = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const legacyId = (value) => typeof value === 'string' && value.length > 0 && value.length <= 1500 && !value.includes('/') && value !== '.' && value !== '..';
function validRef(row, uid, profileId, id) {
    return !!row && row.version === 1 && row.owner_uid === uid && row.profile_id === profileId && row.sound_id === id && typeof row.active === 'boolean';
}
export async function runManageSavedSounds(database, uid, raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        throw new HttpsError('invalid-argument', 'Saved sound details are required.');
    const input = raw;
    if (input.expectedOwnerUid !== uid)
        throw new HttpsError('failed-precondition', 'Your account changed. Reopen sounds.');
    if (!validAudienceId(input.expectedProfileId) || !['list', 'status', 'set', 'removeLegacy'].includes(input.action))
        throw new HttpsError('invalid-argument', 'Invalid saved sound action.');
    const fields = input.action === 'list' ? ['cursor'] : input.action === 'status' ? ['soundId'] : input.action === 'set' ? ['soundId', 'saved', 'requestId'] : ['referenceId', 'requestId'];
    if (Object.keys(input).some(key => !['action', 'expectedOwnerUid', 'expectedProfileId', ...fields].includes(key))
        || (['status', 'set'].includes(input.action) && !soundId(input.soundId))
        || (input.action === 'set' && typeof input.saved !== 'boolean')
        || (input.action === 'removeLegacy' && !legacyId(input.referenceId))
        || (['set', 'removeLegacy'].includes(input.action) && (typeof input.requestId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(input.requestId)))
        || (input.cursor !== undefined && (typeof input.cursor !== 'string' || !/^[a-f0-9]{32}$/.test(input.cursor))))
        throw new HttpsError('invalid-argument', 'Invalid saved sound details.');
    return database.runTransaction(async (tx) => {
        const viewer = await resolveSoundActor(database, tx, uid, input.expectedProfileId);
        const base = { success: true, ownerUid: uid, profileId: viewer.profileId };
        if (input.action === 'list') {
            let phase = 'current', after = null;
            if (input.cursor) {
                const cursor = (await tx.get(database.doc(`_sound_library_cursors/${input.cursor}`))).data();
                if (!cursor || cursor.version !== 1 || cursor.owner_uid !== uid || cursor.profile_id !== viewer.profileId || cursor.kind !== 'saved' || cursor.expires_at_ms <= Date.now() || !['current', 'legacy'].includes(cursor.phase) || !(cursor.after === null || legacyId(cursor.after)))
                    throw new HttpsError('failed-precondition', 'This saved page expired. Refresh saved sounds.');
                phase = cursor.phase;
                after = cursor.after;
            }
            const entries = [];
            const currentQuery = database.collection('_saved_sound_refs').where('owner_uid', '==', uid).where('active', '==', true).orderBy(FieldPath.documentId()).limit(25);
            const oldQuery = database.collection('user_saved_sounds').where('user_id', 'in', viewer.aliases).orderBy(FieldPath.documentId()).limit(25);
            let documents = (await tx.get(phase === 'current' ? (after ? currentQuery.startAfter(after) : currentQuery) : (after ? oldQuery.startAfter(after) : oldQuery))).docs;
            if (phase === 'current' && documents.length === 0) {
                phase = 'legacy';
                after = null;
                documents = (await tx.get(oldQuery)).docs;
            }
            for (const document of documents) {
                const row = document.data();
                if (phase === 'legacy') {
                    // Old caller-writable references are private cleanup leads only. They
                    // never attest a sound, title, URL or current saved preference.
                    entries.push({ referenceId: document.id, soundId: null, legacy: true, sound: null });
                }
                else if (soundId(row.sound_id) && validRef(row, uid, viewer.profileId, row.sound_id) && document.id === hash([uid, row.sound_id])) {
                    entries.push({ referenceId: document.id, soundId: row.sound_id, legacy: false, sound: await admitSound(database, tx, viewer, row.sound_id) });
                }
            }
            let nextPhase = documents.length === 25 ? phase : null, nextAfter = documents.at(-1)?.id || null;
            if (phase === 'current' && documents.length < 25 && !(await tx.get(oldQuery.limit(1))).empty) {
                nextPhase = 'legacy';
                nextAfter = null;
            }
            let nextCursor = null;
            if (nextPhase) {
                nextCursor = randomUUID().replaceAll('-', '');
                const expiry = Date.now() + 600000;
                tx.create(database.doc(`_sound_library_cursors/${nextCursor}`), { version: 1, owner_uid: uid, profile_id: viewer.profileId, kind: 'saved', phase: nextPhase, after: nextAfter, expires_at_ms: expiry, expireAt: Timestamp.fromMillis(expiry) });
            }
            return { ...base, entries, nextCursor };
        }
        const reference = input.action === 'removeLegacy' ? database.doc(`user_saved_sounds/${input.referenceId}`) : database.doc(`_saved_sound_refs/${hash([uid, input.soundId])}`);
        const row = (await tx.get(reference)).data();
        const currentSaved = validRef(row, uid, viewer.profileId, input.soundId) && row.active === true;
        if (input.action === 'status')
            return { ...base, soundId: input.soundId, saved: currentSaved };
        const requestRef = database.doc(`_saved_sound_requests/${hash([uid, input.requestId])}`), prior = (await tx.get(requestRef)).data();
        const fingerprint = hash([viewer.profileId, input.action, input.soundId ?? null, input.saved ?? null, input.referenceId ?? null]);
        if (prior) {
            if (prior.version !== 1 || prior.owner_uid !== uid || prior.profile_id !== viewer.profileId || prior.fingerprint !== fingerprint)
                throw new HttpsError('already-exists', 'This retry belongs to a different saved-sound action.');
            // A replay acknowledges the original action without resurrecting a later
            // removal or undoing a later save. Report the current canonical state.
            return input.action === 'set' ? { ...base, soundId: input.soundId, saved: currentSaved } : { ...base, referenceId: input.referenceId, removed: !row || !viewer.aliases.includes(row.user_id) };
        }
        const quotaRef = database.doc(`_saved_sound_limits/${uid}`), quota = (await tx.get(quotaRef)).data();
        const day = new Date().toISOString().slice(0, 10), requests = quota?.day === day ? quota.requests : 0, active = quota?.active ?? 0;
        if (!Number.isSafeInteger(requests) || !Number.isSafeInteger(active) || requests >= 200)
            throw new HttpsError('resource-exhausted', 'Your saved-sound change limit is reached. Try again tomorrow.');
        if (input.action === 'removeLegacy') {
            if (!row || !viewer.aliases.includes(row.user_id))
                throw new HttpsError('not-found', 'That saved reference is unavailable. Refresh the list.');
            tx.delete(reference);
        }
        else {
            if (row && !validRef(row, uid, viewer.profileId, input.soundId))
                throw new HttpsError('failed-precondition', 'This saved reference needs review.');
            if (input.saved && !await admitSound(database, tx, viewer, input.soundId))
                throw new HttpsError('failed-precondition', 'This sound is no longer available to save.');
            if (input.saved && !currentSaved && active >= 500)
                throw new HttpsError('resource-exhausted', 'Your saved sounds are full. Remove a sound before saving another.');
            tx.set(reference, { version: 1, owner_uid: uid, profile_id: viewer.profileId, sound_id: input.soundId, active: input.saved, updated_at_ms: Date.now() });
        }
        tx.set(quotaRef, { day, requests: requests + 1, active: active + (input.action === 'set' ? Number(input.saved) - Number(currentSaved) : 0) });
        tx.create(requestRef, { version: 1, owner_uid: uid, profile_id: viewer.profileId, fingerprint, created_at_ms: Date.now() });
        return input.action === 'set' ? { ...base, soundId: input.soundId, saved: input.saved } : { ...base, referenceId: input.referenceId, removed: true };
    });
}
export const manageSavedSounds = onCall({ region: 'us-central1', cpu: 0.083, concurrency: 1, maxInstances: 10 }, async (request) => {
    const uid = requireAuth(request);
    enforceRateLimit(await rateLimit(`saved-sounds:${uid}`, 120, 60));
    return runManageSavedSounds(db, uid, request.data);
});
//# sourceMappingURL=soundSaved.js.map