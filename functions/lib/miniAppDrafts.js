import { createHash } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db, requireAuth, rateLimit, enforceRateLimit } from './_shared/admin.js';
import { miniAppSource } from './miniAppPublish.js';
export const MINI_APP_DRAFT_LIMIT = 200;
export const MINI_APP_DRAFT_CREATION_LIMIT = 100;
const windowMs = 24 * 60 * 60 * 1000;
const sourceFields = ['title', 'description', 'category', 'html', 'css', 'javascript'];
function sourceOnly(value) {
    const source = miniAppSource(value);
    if (Object.keys(value).some(key => !sourceFields.includes(key)))
        throw new HttpsError('invalid-argument', 'Save only the mini-app source.');
    return source;
}
function conflict() {
    throw new HttpsError('aborted', 'This draft changed in another tab or device. Your code is still here. Save it as a new draft, or reopen the latest saved version.');
}
function activeIdentity(uid, appId, created) {
    return { version: 1, owner_uid: uid, app_id: appId, status: 'active', created_at: created };
}
function validateIdentity(identity, uid, appId) {
    if (!identity)
        return;
    if (identity.owner_uid !== uid)
        throw new HttpsError('permission-denied', 'This draft identity belongs to another account.');
    if (identity.version !== 1 || identity.app_id !== appId || !(identity.created_at instanceof Timestamp)
        || !['active', 'deleted'].includes(identity.status)
        || (identity.status === 'deleted' && (!(identity.deleted_at instanceof Timestamp) || typeof identity.source_fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(identity.source_fingerprint)))) {
        throw new HttpsError('failed-precondition', 'This draft identity needs review. Your source is still available.');
    }
}
/** Admission for new drafts; existing drafts remain editable at either limit. */
export async function runMiniAppDraftSave(database, uid, input) {
    if (!input || typeof input !== 'object' || Array.isArray(input))
        throw new HttpsError('invalid-argument', 'Choose a mini-app draft.');
    const request = input;
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid) || request.expectedOwnerUid !== uid)
        throw new HttpsError('failed-precondition', 'Your account changed. Sign in again before saving.');
    if (Object.keys(request).some(key => !['expectedOwnerUid', 'appId', 'source', 'expectedSource'].includes(key))
        || typeof request.appId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(request.appId))
        throw new HttpsError('invalid-argument', 'Reopen the studio before saving.');
    const source = sourceOnly(request.source);
    const expected = request.expectedSource === null ? null : sourceOnly(request.expectedSource);
    const appId = request.appId;
    const reference = database.doc(`mini_app_drafts/${appId}`);
    const quotaRef = database.doc(`_mini_app_draft_quotas/${uid}`);
    const identityRef = database.doc(`_mini_app_draft_identities/${appId}`);
    return database.runTransaction(async (tx) => {
        const [snapshot, identitySnapshot] = await tx.getAll(reference, identityRef);
        const current = snapshot.data();
        const identity = identitySnapshot.data();
        validateIdentity(identity, uid, appId);
        if (identity && (!current || identity.status !== 'active'))
            conflict();
        if (current && current.owner_id !== uid)
            throw new HttpsError('permission-denied', 'You can only save your own drafts.');
        if (current && (current.schema_version !== 1 || !(current.created_at instanceof Timestamp) || !(current.updated_at instanceof Timestamp))) {
            throw new HttpsError('failed-precondition', 'This draft needs review before it can be changed. Your code is still available in the studio.');
        }
        const receipt = (created, updated) => ({ appId, source, createdAt: { seconds: created.seconds, nanoseconds: created.nanoseconds }, updatedAt: { seconds: updated.seconds, nanoseconds: updated.nanoseconds } });
        // Retrying an acknowledged-equivalent save does not consume quota or update dates.
        if (current && JSON.stringify(miniAppSource(current)) === JSON.stringify(source)) {
            if (!identity)
                tx.create(identityRef, activeIdentity(uid, appId, current.created_at));
            return receipt(current.created_at, current.updated_at);
        }
        if (current ? expected === null || JSON.stringify(miniAppSource(current)) !== JSON.stringify(expected) : expected !== null)
            conflict();
        const now = Timestamp.now();
        if (!current) {
            const quota = (await tx.get(quotaRef)).data();
            const millis = now.toMillis();
            if (quota && (quota.version !== 1 || quota.owner_uid !== uid || !Number.isSafeInteger(quota.window_started_at_ms)
                || quota.window_started_at_ms < 0 || quota.window_started_at_ms > millis || !Number.isSafeInteger(quota.count) || quota.count < 0
                || !Number.isSafeInteger(quota.revision) || quota.revision < 0 || quota.revision >= Number.MAX_SAFE_INTEGER)) {
                throw new HttpsError('failed-precondition', 'Your draft limits need review. You can still edit existing drafts.');
            }
            const start = quota && millis - quota.window_started_at_ms < windowMs ? quota.window_started_at_ms : millis;
            const count = quota && start === quota.window_started_at_ms ? quota.count : 0;
            if (count >= MINI_APP_DRAFT_CREATION_LIMIT)
                throw new HttpsError('resource-exhausted', 'You have created 100 drafts in 24 hours. You can still edit existing drafts. Try creating another later.', { retryAfter: Math.ceil((start + windowMs - millis) / 1000) });
            // Include legacy drafts and serialize concurrent admissions with the owner row.
            const drafts = await tx.get(database.collection('mini_app_drafts').where('owner_id', '==', uid).select().limit(MINI_APP_DRAFT_LIMIT));
            if (drafts.size >= MINI_APP_DRAFT_LIMIT)
                throw new HttpsError('resource-exhausted', 'Your library has 200 saved drafts. Delete an old draft before creating another. You can still edit existing drafts.');
            tx.set(quotaRef, { version: 1, owner_uid: uid, window_started_at_ms: start, count: count + 1, revision: (quota?.revision ?? 0) + 1, updated_at: now });
        }
        const created = current?.created_at ?? now;
        if (!identity)
            tx.create(identityRef, activeIdentity(uid, appId, created));
        tx.set(reference, { ...source, owner_id: uid, schema_version: 1, created_at: created, updated_at: now });
        return receipt(created, now);
    });
}
export const saveMiniAppDraft = onCall({ region: 'us-central1', memory: '256MiB', timeoutSeconds: 60 }, async (request) => {
    const uid = requireAuth(request);
    if (request.data?.expectedOwnerUid !== uid)
        throw new HttpsError('failed-precondition', 'Your account changed. Sign in again before saving.');
    enforceRateLimit(await rateLimit(`mini-app-draft:${createHash('sha256').update(uid).digest('hex')}`, 60, 60));
    return runMiniAppDraftSave(db, uid, request.data);
});
/** Retire an identity atomically with deletion; old creates can never reuse it. */
export async function runMiniAppDraftDelete(database, uid, input) {
    if (!input || typeof input !== 'object' || Array.isArray(input))
        throw new HttpsError('invalid-argument', 'Choose a saved draft.');
    const request = input;
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid) || request.expectedOwnerUid !== uid)
        throw new HttpsError('failed-precondition', 'Your account changed. Reopen your draft library.');
    if (Object.keys(request).some(key => !['expectedOwnerUid', 'appId', 'expectedSource'].includes(key))
        || typeof request.appId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(request.appId))
        throw new HttpsError('invalid-argument', 'Choose a saved draft.');
    const source = sourceOnly(request.expectedSource);
    const appId = request.appId;
    const fingerprint = createHash('sha256').update(JSON.stringify(source)).digest('hex');
    const draftRef = database.doc(`mini_app_drafts/${appId}`);
    const identityRef = database.doc(`_mini_app_draft_identities/${appId}`);
    return database.runTransaction(async (tx) => {
        const [draftSnap, identitySnap] = await tx.getAll(draftRef, identityRef);
        const draft = draftSnap.data();
        const identity = identitySnap.data();
        validateIdentity(identity, uid, appId);
        const receipt = { appId, deleted: true };
        if (!draft) {
            if (identity?.status === 'deleted' && identity.source_fingerprint === fingerprint)
                return receipt;
            conflict();
        }
        if (draft.owner_id !== uid)
            throw new HttpsError('permission-denied', 'You can only delete your own drafts.');
        if (draft.schema_version !== 1 || !(draft.created_at instanceof Timestamp) || !(draft.updated_at instanceof Timestamp))
            throw new HttpsError('failed-precondition', 'This draft needs review before deletion.');
        if (identity?.status === 'deleted' || JSON.stringify(miniAppSource(draft)) !== JSON.stringify(source))
            conflict();
        tx.set(identityRef, { ...activeIdentity(uid, appId, identity?.created_at ?? draft.created_at), status: 'deleted', source_fingerprint: fingerprint, deleted_at: Timestamp.now() });
        tx.delete(draftRef);
        return receipt;
    });
}
export const deleteMiniAppDraft = onCall({ region: 'us-central1', memory: '256MiB', timeoutSeconds: 60 }, async (request) => {
    const uid = requireAuth(request);
    if (request.data?.expectedOwnerUid !== uid)
        throw new HttpsError('failed-precondition', 'Your account changed. Reopen your draft library.');
    enforceRateLimit(await rateLimit(`mini-app-draft-delete:${createHash('sha256').update(uid).digest('hex')}`, 60, 60));
    return runMiniAppDraftDelete(db, uid, request.data);
});
//# sourceMappingURL=miniAppDrafts.js.map