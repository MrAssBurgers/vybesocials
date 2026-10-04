import { HttpsError, onRequest } from 'firebase-functions/v2/https';
import { db } from './_shared/admin.js';
import { GameCaptureValidationError } from './gameIntegrationValidation.js';
import { authorizePartner, exchangePartnerDevice, partnerRateLimit, PartnerError, startPartnerDevice } from './_shared/gamePartnerCore.js';
import { createPartnerCapture, discardPartnerCapture, finishPartnerCapture, getPartnerCapture, putPartnerChunk, revokePartnerToken, } from './_shared/gamePartnerUploads.js';
function jsonBody(request) {
    if (request.rawBody?.length > 16384)
        throw new PartnerError(413, 'payload_too_large', 'The request is too large.');
    if (!request.is('application/json') || !request.body || typeof request.body !== 'object' || Array.isArray(request.body)) {
        throw new PartnerError(400, 'invalid_request', 'Send a JSON object.');
    }
    return request.body;
}
function accessToken(request) {
    const header = request.get('authorization') ?? '';
    if (!/^Bearer vyp_[A-Za-z0-9_-]{43}$/.test(header))
        throw new PartnerError(401, 'invalid_token', 'Link this game in VYBE again.');
    return header.slice(7);
}
function safeError(error) {
    if (error instanceof PartnerError)
        return error;
    if (error instanceof GameCaptureValidationError)
        return new PartnerError(400, 'invalid_request', error.message);
    if (error instanceof HttpsError) {
        const map = {
            'invalid-argument': [400, 'invalid_request'], 'already-exists': [409, 'conflict'],
            'resource-exhausted': [429, 'rate_limited'], 'failed-precondition': [410, 'expired_capture'],
            'not-found': [404, 'not_found'], 'permission-denied': [403, 'access_denied'],
        };
        const match = map[error.code];
        if (match) {
            const requestedDelay = error.details && typeof error.details === 'object' && 'retryAfter' in error.details ? error.details.retryAfter : undefined;
            const retryAfter = match[0] === 429 && typeof requestedDelay === 'number' && Number.isFinite(requestedDelay)
                ? Math.max(1, Math.min(86400, Math.ceil(requestedDelay))) : undefined;
            return new PartnerError(match[0], match[1], error.message, retryAfter);
        }
    }
    // Storage/SDK errors can contain object paths, IDs, or request headers. Never echo them.
    return new PartnerError(503, 'unavailable', 'The game upload service is temporarily unavailable. Retry safely using the same upload key.');
}
/** Public transport; every private operation authorizes an opaque capture-only token. */
export async function handleGamePartnerRequest(request, response) {
    response.set({
        'Cache-Control': 'private, no-store', Pragma: 'no-cache', 'X-Content-Type-Options': 'nosniff',
        'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization,Content-Type,X-Chunk-SHA256',
        'Access-Control-Expose-Headers': 'Retry-After',
    });
    if (request.method === 'OPTIONS') {
        response.status(204).end();
        return;
    }
    try {
        const path = request.path.replace(/\/$/, '');
        const source = request.ip || request.socket.remoteAddress || 'unknown';
        if (path === '/v1/device/code' && request.method === 'POST') {
            response.status(200).json(await startPartnerDevice(jsonBody(request).clientId, source));
            return;
        }
        if (path === '/v1/device/token' && request.method === 'POST') {
            const body = jsonBody(request);
            response.status(200).json(await exchangePartnerDevice(body.clientId, body.deviceCode, source));
            return;
        }
        const token = accessToken(request);
        const principal = await db.runTransaction(tx => authorizePartner(tx, token, request.method === 'GET' ? 'capture:status' : 'capture:write'));
        await partnerRateLimit(`access:${principal.uid}`, 120);
        if (path === '/v1/captures' && request.method === 'POST') {
            response.status(200).json(await createPartnerCapture(token, jsonBody(request)));
            return;
        }
        if (path === '/v1/connection/revoke' && request.method === 'POST') {
            jsonBody(request);
            response.status(200).json(await revokePartnerToken(token));
            return;
        }
        const capture = /^\/v1\/captures\/([a-f0-9]{48})(?:\/(finish|chunks\/([0-5])))?$/.exec(path);
        if (capture && !capture[2] && request.method === 'GET') {
            response.status(200).json(await getPartnerCapture(token, capture[1]));
            return;
        }
        if (capture && !capture[2] && request.method === 'DELETE') {
            response.status(200).json(await discardPartnerCapture(token, capture[1]));
            return;
        }
        if (capture?.[2] === 'finish' && request.method === 'POST') {
            jsonBody(request);
            response.status(200).json(await finishPartnerCapture(token, capture[1]));
            return;
        }
        if (capture?.[3] !== undefined && request.method === 'PUT') {
            if (!request.is('application/octet-stream'))
                throw new PartnerError(400, 'invalid_request', 'Send binary chunks as application/octet-stream.');
            response.status(200).json(await putPartnerChunk(token, capture[1], Number(capture[3]), request.rawBody, request.get('X-Chunk-SHA256')));
            return;
        }
        throw new PartnerError(404, 'not_found', 'API endpoint not found.');
    }
    catch (error) {
        const safe = safeError(error);
        if (safe.retryAfter)
            response.set('Retry-After', String(safe.retryAfter));
        response.status(safe.status).json({ error: safe.code, message: safe.message, ...(safe.retryAfter ? { retryAfter: safe.retryAfter } : {}) });
    }
}
export const gamePartnerApi = onRequest({ region: 'us-central1', invoker: 'public', timeoutSeconds: 60, memory: '512MiB', concurrency: 1, maxInstances: 20 }, handleGamePartnerRequest);
//# sourceMappingURL=gamePartnerApi.js.map