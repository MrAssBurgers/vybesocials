import { createHash, randomBytes } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db, requireAuth, rateLimit, enforceRateLimit } from './_shared/admin.js';
export const MINI_APP_PUBLISH_LIMIT = 100;
export const MINI_APP_PUBLISH_OPERATION_LIMIT = 200;
export const MINI_APP_PUBLISH_WINDOW_MS = 24 * 60 * 60 * 1000;
const fields = ['title', 'description', 'category', 'html', 'css', 'javascript'];
function invalid(message) { throw new HttpsError('invalid-argument', message); }
function record(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return invalid('Choose a saved mini app.');
    return value;
}
export function miniAppSource(value) {
    const row = record(value);
    if (fields.some(field => typeof row[field] !== 'string'))
        return invalid('Mini-app fields must be text.');
    const source = Object.fromEntries(fields.map(field => [field, row[field]]));
    source.title = source.title.trim();
    source.description = source.description.trim();
    if (!source.title || source.title.length > 60 || source.description.length > 240
        || !['game', 'tool', 'art'].includes(source.category)
        || !(source.html.trim() || source.javascript.trim())
        || source.html.length + source.css.length + source.javascript.length > 100000)
        return invalid('Check the mini-app name, category and 100,000-character code limit.');
    return source;
}
export function miniAppPublishedVersion(row) {
    if (!row)
        return null;
    if (typeof row.publication_revision === 'string' && /^[a-f0-9]{32}$/.test(row.publication_revision))
        return row.publication_revision;
    if (row.publication_revision === undefined && row.updated_at instanceof Timestamp)
        return `legacy:${row.updated_at.seconds}:${row.updated_at.nanoseconds}`;
    throw new HttpsError('failed-precondition', 'This publication needs review before it can be replaced.');
}
function hash(value) { return createHash('sha256').update(value).digest('hex'); }
function checkHold(value, appId, uid) {
    if (value && !(value.version === 1 && value.app_id === appId && value.owner_uid === uid && value.active === false)) {
        throw new HttpsError('permission-denied', 'Publishing is blocked by a moderation hold. Your private draft is still available.');
    }
}
function conflict() { throw new HttpsError('aborted', 'This app changed since you started publishing. Refresh the library and review the latest version before publishing again.'); }
export async function runMiniAppPublish(database, uid, input) {
    const request = record(input);
    if (typeof uid !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(uid) || request.expectedOwnerUid !== uid)
        throw new HttpsError('failed-precondition', 'Your account changed. Sign in again before publishing.');
    if (Object.keys(request).some(key => !['expectedOwnerUid', 'appId', 'requestId', 'expectedVersion', 'source'].includes(key))
        || typeof request.appId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(request.appId)
        || typeof request.requestId !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(request.requestId)
        || !(request.expectedVersion === null || (typeof request.expectedVersion === 'string' && /^(?:[a-f0-9]{32}|legacy:-?\d{1,12}:\d{1,9})$/.test(request.expectedVersion))))
        return invalid('Refresh the studio before publishing.');
    const source = miniAppSource(request.source);
    const appId = request.appId;
    if (Object.keys(record(request.source)).some(key => !fields.includes(key)))
        return invalid('Publish only the mini-app source.');
    const fingerprint = hash(JSON.stringify({ appId, expectedVersion: request.expectedVersion, source }));
    const publicationRevision = randomBytes(16).toString('hex');
    const ownerRef = database.doc(`_mini_app_publish_quotas/${uid}`);
    const receiptRef = database.doc(`_mini_app_publish_operations/${hash(`${uid}:${request.requestId}`)}`);
    const publicRef = database.doc(`mini_apps/${appId}`);
    return database.runTransaction(async (tx) => {
        const [operationSnap, quotaSnap, draftSnap, publishedSnap, holdSnap] = await tx.getAll(receiptRef, ownerRef, database.doc(`mini_app_drafts/${appId}`), publicRef, database.doc(`_mini_app_moderation/${appId}`));
        const published = publishedSnap.data();
        const draft = draftSnap.data();
        const operation = operationSnap.data();
        if (published && published.owner_id !== uid)
            throw new HttpsError('permission-denied', 'You can only publish your own apps.');
        checkHold(holdSnap.data(), appId, uid);
        const version = miniAppPublishedVersion(published);
        if (operation) {
            if (operation.version !== 1 || operation.owner_uid !== uid || operation.app_id !== appId || operation.fingerprint !== fingerprint)
                conflict();
            // A replay may acknowledge its still-current snapshot, never recreate a
            // removed one or overwrite a newer publication after a lost response.
            if (!published || published.status !== 'published' || version !== operation.publication_revision)
                conflict();
            return { appId, status: 'published', publicationRevision: version };
        }
        if (!draft || draft.owner_id !== uid || draft.schema_version !== 1 || !(draft.created_at instanceof Timestamp)) {
            throw new HttpsError('permission-denied', 'Save your own private draft before publishing.');
        }
        if (JSON.stringify(miniAppSource(draft)) !== JSON.stringify(source))
            conflict();
        if (request.expectedVersion !== version)
            conflict();
        const unchanged = published?.status === 'published' && JSON.stringify(miniAppSource(published)) === JSON.stringify(source);
        const now = Date.now();
        const quota = quotaSnap.data();
        if (quota && (quota.version !== 1 || quota.owner_uid !== uid || !Number.isSafeInteger(quota.window_started_at_ms)
            || quota.window_started_at_ms < 0 || quota.window_started_at_ms > now || !Number.isSafeInteger(quota.count) || quota.count < 0
            || !Number.isSafeInteger(quota.revision) || quota.revision < 0 || quota.revision >= Number.MAX_SAFE_INTEGER
            || (quota.operation_count !== undefined && (!Number.isSafeInteger(quota.operation_count) || quota.operation_count < quota.count)))) {
            throw new HttpsError('failed-precondition', 'Your publication limits need review. Your private drafts are safe.');
        }
        const start = quota && now - quota.window_started_at_ms < MINI_APP_PUBLISH_WINDOW_MS ? quota.window_started_at_ms : now;
        const count = quota && start === quota.window_started_at_ms ? quota.count : 0;
        // Legacy rows count their changed publications as recorded operations.
        const operations = quota && start === quota.window_started_at_ms ? quota.operation_count ?? quota.count : 0;
        if (operations >= MINI_APP_PUBLISH_OPERATION_LIMIT)
            throw new HttpsError('resource-exhausted', 'You have reached 200 new publishing requests in 24 hours. Retrying the same request is still available. Keep saving private drafts and try again later.', { retryAfter: Math.ceil((start + MINI_APP_PUBLISH_WINDOW_MS - now) / 1000) });
        if (!unchanged && count >= MINI_APP_PUBLISH_LIMIT)
            throw new HttpsError('resource-exhausted', 'You have reached 100 publication changes in 24 hours. Keep saving private drafts and publish again later.', { retryAfter: Math.ceil((start + MINI_APP_PUBLISH_WINDOW_MS - now) / 1000) });
        if (!published || published.status !== 'published') {
            // ID-only projection avoids downloading every existing app's source.
            // Updating the shared owner row serializes concurrent creates, including
            // accounts with legacy publications but no existing quota record.
            const active = await tx.get(database.collection('mini_apps').where('owner_id', '==', uid).where('status', '==', 'published').select().limit(MINI_APP_PUBLISH_LIMIT));
            if (active.size >= MINI_APP_PUBLISH_LIMIT)
                throw new HttpsError('resource-exhausted', 'You already have 100 live mini apps. Unpublish one before sharing another.');
        }
        const time = FieldValue.serverTimestamp();
        const admittedRevision = unchanged ? version : publicationRevision;
        if (!unchanged)
            tx.set(publicRef, { ...source, owner_id: uid, schema_version: 1, status: 'published', publication_revision: admittedRevision,
                created_at: published?.created_at instanceof Timestamp ? published.created_at : time, updated_at: time });
        tx.set(ownerRef, { version: 1, owner_uid: uid, window_started_at_ms: start, count: count + (unchanged ? 0 : 1), operation_count: operations + 1, revision: (quota?.revision ?? 0) + 1, updated_at: time });
        // Even an unchanged publication binds its request ID permanently. Without
        // this receipt, the ID could later be reused for a different source/version.
        tx.create(receiptRef, { version: 1, owner_uid: uid, app_id: appId, fingerprint, publication_revision: admittedRevision, created_at: time });
        return { appId, status: 'published', publicationRevision: admittedRevision };
    });
}
export const publishMiniApp = onCall({ region: 'us-central1', memory: '256MiB', timeoutSeconds: 60 }, async (request) => {
    const uid = requireAuth(request);
    if (record(request.data).expectedOwnerUid !== uid)
        throw new HttpsError('failed-precondition', 'Your account changed. Sign in again before publishing.');
    enforceRateLimit(await rateLimit(`mini-app-publish:${hash(uid)}`, 30, 60));
    return runMiniAppPublish(db, uid, request.data);
});
//# sourceMappingURL=miniAppPublish.js.map