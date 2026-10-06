import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';
import { auth, enforceRateLimit, rateLimit, requireAuth } from './_shared/admin.js';
import { finalizeCommunityAttachment, readCommunityAttachment, reserveCommunityAttachment, uploadCommunityAttachment } from './_shared/communityAttachments.js';
export const communityAttachment = onCall({ region: 'us-central1', cpu: 1, maxInstances: 10, concurrency: 10 }, async (request) => {
    const uid = requireAuth(request);
    const input = request.data;
    if (!input || typeof input !== 'object' || Array.isArray(input))
        throw new HttpsError('invalid-argument', 'Attachment details required.');
    enforceRateLimit(await rateLimit(`community-attachment:${uid}`, 60, 60));
    if (input.action === 'reserve')
        return reserveCommunityAttachment(uid, input);
    if (input.action === 'finalize')
        return finalizeCommunityAttachment(uid, input);
    throw new HttpsError('invalid-argument', 'Unsupported attachment action.');
});
export async function handleCommunityAttachmentBytes(request, response) {
    response.set({ 'Cache-Control': 'private, no-store', Pragma: 'no-cache', 'X-Content-Type-Options': 'nosniff',
        'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,HEAD,PUT,OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization,Range,Content-Type,X-Vybe-Owner', 'Access-Control-Expose-Headers': 'Content-Length,Content-Range,Content-Type,Accept-Ranges' });
    if (request.method === 'OPTIONS') {
        response.status(204).end();
        return;
    }
    try {
        if (!['GET', 'HEAD', 'PUT'].includes(request.method) || Object.keys(request.query).length)
            throw new HttpsError('invalid-argument', 'Use an authenticated attachment request.');
        const header = request.get('authorization') || '';
        if (!/^Bearer [^\s]+$/.test(header))
            throw new HttpsError('unauthenticated', 'Sign in to view this attachment.');
        let uid;
        try {
            uid = (await auth.verifyIdToken(header.slice(7), true)).uid;
        }
        catch {
            throw new HttpsError('unauthenticated', 'Sign in to view this attachment.');
        }
        if (request.get('X-Vybe-Owner') !== uid)
            throw new HttpsError('permission-denied', 'Your account changed.');
        enforceRateLimit(await rateLimit(`community-attachment-bytes:${uid}`, 120, 60));
        const upload = /^\/uploads\/([a-f0-9]{64})$/.exec(request.path);
        if (request.method === 'PUT' && upload) {
            response.status(200).json(await uploadCommunityAttachment(uid, upload[1], request.rawBody, request.get('content-type') || ''));
            return;
        }
        if (request.method === 'PUT')
            throw new HttpsError('not-found', 'Upload unavailable.');
        const match = /^\/(attachment_[a-f0-9]{64})$/.exec(request.path);
        if (!match)
            throw new HttpsError('not-found', 'Attachment unavailable.');
        const result = await readCommunityAttachment(uid, match[1], request.get('range'), request.method === 'HEAD');
        response.set({ 'Content-Type': result.contentType, 'Accept-Ranges': 'bytes', 'Content-Length': String(result.range.end - result.range.start + 1), 'Content-Disposition': 'inline' });
        if (result.range.partial)
            response.set('Content-Range', `bytes ${result.range.start}-${result.range.end}/${result.size}`);
        response.status(result.range.partial ? 206 : 200).end(result.bytes ?? undefined);
    }
    catch (error) {
        const code = error instanceof HttpsError ? error.code : 'unavailable';
        const status = { unauthenticated: 401, 'permission-denied': 403, 'not-found': 404, 'invalid-argument': 400, 'already-exists': 409, 'out-of-range': 416, 'failed-precondition': 410, 'resource-exhausted': 429 }[code] || 503;
        response.status(status).json({ error: code, message: 'This attachment is unavailable. Check your access and try again.' });
    }
}
export const communityAttachmentBytes = onRequest({ region: 'us-central1', cpu: 1, invoker: 'public', timeoutSeconds: 60, memory: '512MiB', concurrency: 4, maxInstances: 10 }, handleCommunityAttachmentBytes);
//# sourceMappingURL=communityAttachment.js.map