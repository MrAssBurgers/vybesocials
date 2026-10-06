import { createHash, randomBytes } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import { parentalRequestIdentity, checkParentalAuth, resolveParentalActor } from './parentalAccountAuthority.js';
const grace = 30 * 24 * 60 * 60 * 1000;
const revision = (value) => typeof value === 'string' && /^[a-f0-9]{48}$/.test(value);
const uuid = (value) => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
const stale = () => new HttpsError('aborted', 'The deletion request changed. Refresh its status before trying again.');
/** Track/cancel an owner-reviewed deletion request. This is not a purge worker:
 * a pending request is eligible after its grace period and still needs cleanup. */
export async function accountDeletionRequest(db, auth, request, now = Date.now()) {
    const raw = request.data;
    const action = { request_delete: 'request', request_deletion: 'request', delete: 'request', cancel_delete: 'cancel', cancel_deletion: 'cancel', deletion_status: 'read' }[String(raw?.action)];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || typeof action !== 'string' || !['read', 'request', 'cancel'].includes(action) || !uuid(raw.requestId)
        || Object.keys(raw).some(key => !['action', 'requestId', 'expectedOwnerUid', 'expectedProfileId', 'expectedAccountCreatedAt', ...(action === 'read' ? [] : ['expectedRevision'])].includes(key))
        || action !== 'read' && raw.expectedRevision !== null && !revision(raw.expectedRevision))
        throw new HttpsError('invalid-argument', 'Verified deletion request details are required.');
    const identity = parentalRequestIdentity(request, raw);
    await checkParentalAuth(auth, identity, now);
    if (action === 'request' && (now - identity.authTime * 1000 > 5 * 60 * 1000))
        throw new HttpsError('unauthenticated', 'Sign in again before requesting account deletion.');
    // Token auth_time can legitimately change during retry. It is not intent.
    const intent = createHash('sha256').update(JSON.stringify({ action, uid: identity.uid, profileId: identity.profileId, created: identity.created, expectedRevision: raw.expectedRevision ?? null })).digest('hex');
    return db.runTransaction(async (tx) => {
        const actor = await resolveParentalActor(db, tx, identity);
        if (actor.profileId !== actor.uid) {
            try {
                await auth.getUser(actor.profileId);
                throw new HttpsError('failed-precondition', 'Profile ownership needs review. Nothing changed.');
            }
            catch (error) {
                if (error.code !== 'auth/user-not-found')
                    throw error;
            }
        }
        const stateRef = db.doc(`account_deletion_requests/${actor.uid}`);
        const receiptRef = db.doc(`_account_deletion_receipts/${createHash('sha256').update(`${actor.uid}:${raw.requestId}`).digest('hex')}`);
        const [stateDoc, receiptDoc, legacy] = await Promise.all([tx.get(stateRef), tx.get(receiptRef), tx.get(db.collection('account_deletion_requests').where('user_id', 'in', [...new Set([actor.uid, actor.profileId])]).limit(3))]);
        const row = stateDoc.data(), receipt = receiptDoc.data();
        const review = legacy.docs.some(doc => doc.id !== actor.uid) || !!row && (row.version !== 2 || row.user_id !== actor.uid || row.profile_id !== actor.profileId || row.auth_created_at_ms !== actor.created || row.binding_revision !== actor.bindingRevision);
        if (review) {
            if (action !== 'read')
                throw new HttpsError('failed-precondition', 'Your existing deletion request needs an ownership review. Contact support; nothing changed.');
            await checkParentalAuth(auth, actor, now);
            return { ok: true, version: 2, ownerUid: actor.uid, profileId: actor.profileId, accountCreatedAt: actor.created, requestId: raw.requestId, status: 'review_required', revision: null, requestedAt: null, eligibleAfter: null, automaticCleanup: false };
        }
        if (row && (!revision(row.revision) || !['pending_review', 'cancelled', 'processing', 'completed'].includes(String(row.status))
            || !Number.isSafeInteger(row.requested_at_ms) || Number(row.requested_at_ms) <= 0 || Number(row.requested_at_ms) > now
            || !Number.isSafeInteger(row.eligible_after_ms) || Number(row.eligible_after_ms) - Number(row.requested_at_ms) !== grace))
            throw new HttpsError('failed-precondition', 'Deletion status needs review. Contact support.');
        let current = row;
        if (action !== 'read') {
            if (receipt) {
                if (receipt.owner_uid !== actor.uid || receipt.auth_created_at_ms !== actor.created || receipt.profile_id !== actor.profileId || receipt.binding_revision !== actor.bindingRevision || receipt.intent !== intent)
                    throw new HttpsError('already-exists', 'This retry belongs to a different deletion request.');
                if (receipt.result_revision !== row?.revision)
                    throw stale();
            }
            else {
                if (raw.expectedRevision !== (row?.revision ?? null))
                    throw stale();
                if (row && ['processing', 'completed'].includes(String(row.status)))
                    throw new HttpsError('failed-precondition', 'Deletion is already being processed. Contact support.');
                if (action === 'cancel' && row?.status !== 'pending_review')
                    throw new HttpsError('failed-precondition', 'There is no pending deletion request to cancel.');
                if (action === 'request' && row?.status === 'pending_review')
                    current = row; // Never extend a pending grace period.
                else
                    current = { version: 2, user_id: actor.uid, profile_id: actor.profileId, auth_created_at_ms: actor.created, binding_revision: actor.bindingRevision,
                        revision: randomBytes(24).toString('hex'), status: action === 'request' ? 'pending_review' : 'cancelled',
                        requested_at_ms: action === 'request' ? now : row.requested_at_ms, eligible_after_ms: action === 'request' ? now + grace : row.eligible_after_ms, updated_at_ms: now };
                await checkParentalAuth(auth, actor, now);
                if (current !== row)
                    tx.set(stateRef, current);
                tx.create(receiptRef, { version: 1, owner_uid: actor.uid, profile_id: actor.profileId, auth_created_at_ms: actor.created, binding_revision: actor.bindingRevision, intent, result_revision: current.revision, created_at_ms: now });
            }
        }
        await checkParentalAuth(auth, actor, now);
        return { ok: true, version: 2, ownerUid: actor.uid, profileId: actor.profileId, accountCreatedAt: actor.created, requestId: raw.requestId,
            status: current?.status ?? 'none', revision: current?.revision ?? null, requestedAt: current ? new Date(Number(current.requested_at_ms)).toISOString() : null,
            eligibleAfter: current ? new Date(Number(current.eligible_after_ms)).toISOString() : null, automaticCleanup: false };
    });
}
//# sourceMappingURL=accountDeletionAuthority.js.map