import { randomBytes } from 'node:crypto';
import { db, rateLimit } from './admin.js';
import { hashGameValue } from './gameCaptureCore.js';
export const PARTNER_TTL_MS = 10 * 60 * 1000;
export const PARTNER_SCOPES = ['capture:write', 'capture:status'];
export const PARTNER_CHUNK_BYTES = 8 * 1024 * 1024;
export const PARTNER_RETENTION_MS = 24 * 60 * 60 * 1000;
export class PartnerError extends Error {
    status;
    code;
    retryAfter;
    constructor(status, code, message, retryAfter) {
        super(message);
        this.status = status;
        this.code = code;
        this.retryAfter = retryAfter;
    }
}
export const opaqueCredential = (prefix) => prefix + randomBytes(32).toString('base64url');
export const randomConnectionId = () => randomBytes(16).toString('hex');
export function newUserCode() {
    const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    const raw = [...randomBytes(8)].map(byte => alphabet[byte & 31]).join('');
    return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}
export function normalizeUserCode(value) {
    if (typeof value !== 'string' || value.length > 20)
        throw new PartnerError(400, 'invalid_request', 'Enter the code shown in your game.');
    const normalized = value.toUpperCase().replace(/[ -]/g, '');
    if (!/^[0-9A-HJKMNP-TV-Z]{8}$/.test(normalized))
        throw new PartnerError(400, 'invalid_request', 'Enter the eight-character code shown in your game.');
    return normalized;
}
export function validateClientId(value) {
    if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9_-]{2,63}$/.test(value))
        throw new PartnerError(400, 'invalid_request', 'Use a registered clientId.');
    return value;
}
export async function registeredPartner(tx, clientId) {
    const game = (await tx.get(db.collection('game_integrations').doc(clientId))).data();
    if (!game || game.enabled !== true || game.partner_enabled !== true || game.publisher_verified !== true
        || typeof game.display_name !== 'string' || !game.display_name.trim()
        || typeof game.publisher_name !== 'string' || !game.publisher_name.trim()) {
        throw new PartnerError(403, 'access_denied', 'This verified game integration is not enabled.');
    }
    return game;
}
export async function partnerRateLimit(key, max = 60, windowSec = 60) {
    if (!await rateLimit(`game_partner_${hashGameValue(key)}`, max, windowSec))
        throw new PartnerError(429, 'rate_limited', 'Too many requests. Try again later.', windowSec);
}
export function connectionReceipt(id, connection) {
    return {
        connectionId: id, clientId: connection.client_id, gameName: connection.game_name,
        publisherName: connection.publisher_name, scopes: connection.scopes,
        createdAt: connection.created_at_ms, expiresAt: connection.expires_at_ms,
        status: connection.status === 'revoked' ? 'revoked' : connection.expires_at_ms <= Date.now() ? 'expired' : 'active',
    };
}
/** Every operation reads all three authorities in its own transaction. */
export async function authorizePartner(tx, rawToken, scope) {
    if (!/^vyp_[A-Za-z0-9_-]{43}$/.test(rawToken))
        throw new PartnerError(401, 'invalid_token', 'Link this game in VYBE again.');
    const token = (await tx.get(db.collection('game_partner_tokens').doc(hashGameValue(rawToken)))).data();
    if (!token || token.expires_at_ms <= Date.now() || typeof token.connection_id !== 'string')
        throw new PartnerError(401, 'invalid_token', 'This game access expired. Link again in VYBE.');
    const connection = (await tx.get(db.collection('game_partner_connections').doc(token.connection_id))).data();
    if (!connection || connection.status !== 'active' || connection.expires_at_ms <= Date.now()
        || connection.owner_uid !== token.owner_uid || connection.client_id !== token.client_id) {
        throw new PartnerError(401, 'invalid_token', 'This game connection is no longer active.');
    }
    if (!Array.isArray(token.scopes) || !token.scopes.includes(scope) || !connection.scopes.includes(scope))
        throw new PartnerError(403, 'insufficient_scope', 'This connection cannot perform that action.');
    const game = await registeredPartner(tx, connection.client_id);
    return { uid: connection.owner_uid, clientId: connection.client_id, connectionId: token.connection_id, expiresAt: Math.min(token.expires_at_ms, connection.expires_at_ms), game };
}
export async function startPartnerDevice(client, source) {
    const clientId = validateClientId(client);
    await partnerRateLimit('device-global', 600);
    await partnerRateLimit(`device-ip:${source}`, 20);
    await db.runTransaction(tx => registeredPartner(tx, clientId));
    await partnerRateLimit(`device-client:${clientId}`, 300);
    await partnerRateLimit('device-daily', 1000, 86400);
    const deviceCode = opaqueCredential('vyd_');
    const userCode = newUserCode();
    const deviceHash = hashGameValue(deviceCode);
    const codeHash = hashGameValue(normalizeUserCode(userCode));
    const now = Date.now();
    await db.runTransaction(async (tx) => {
        await registeredPartner(tx, clientId);
        tx.create(db.collection('game_partner_devices').doc(deviceHash), {
            client_id: clientId, code_hash: codeHash, status: 'pending', expires_at_ms: now + PARTNER_TTL_MS,
            cleanup_at_ms: now + PARTNER_RETENTION_MS, interval_ms: 5000, next_poll_at_ms: now + 5000,
        });
        tx.create(db.collection('game_partner_codes').doc(codeHash), { device_hash: deviceHash, cleanup_at_ms: now + PARTNER_RETENTION_MS });
    });
    return { deviceCode, userCode, verificationUri: 'https://vybehub.app/connect/game', verificationUriComplete: `https://vybehub.app/connect/game?code=${userCode}`, expiresIn: 600, interval: 5 };
}
export async function exchangePartnerDevice(client, rawCode, source) {
    const clientId = validateClientId(client);
    if (typeof rawCode !== 'string' || !/^vyd_[A-Za-z0-9_-]{43}$/.test(rawCode))
        throw new PartnerError(400, 'invalid_grant', 'Invalid device request.');
    await partnerRateLimit(`poll-ip:${source}`, 120);
    const deviceRef = db.collection('game_partner_devices').doc(hashGameValue(rawCode));
    const accessToken = opaqueCredential('vyp_');
    const result = await db.runTransaction(async (tx) => {
        const device = (await tx.get(deviceRef)).data();
        if (!device || device.client_id !== clientId)
            throw new PartnerError(400, 'invalid_grant', 'Invalid device request.');
        await registeredPartner(tx, clientId);
        const now = Date.now();
        if (device.expires_at_ms <= now)
            throw new PartnerError(400, 'expired_token', 'This device code expired. Start again.');
        if (device.status === 'used')
            throw new PartnerError(400, 'invalid_grant', 'This device code was already exchanged. Start again.');
        if (device.status === 'denied')
            throw new PartnerError(400, 'access_denied', 'The account owner declined this connection.');
        if (device.next_poll_at_ms > now) {
            const interval = Math.min(device.interval_ms + 5000, 60000);
            tx.update(deviceRef, { interval_ms: interval, next_poll_at_ms: now + interval });
            return { error: new PartnerError(400, 'slow_down', 'Poll less often.', interval / 1000) };
        }
        if (device.status === 'pending') {
            tx.update(deviceRef, { next_poll_at_ms: now + device.interval_ms });
            return { error: new PartnerError(400, 'authorization_pending', 'Waiting for approval in VYBE.', device.interval_ms / 1000) };
        }
        const connectionId = device.connection_id;
        const connection = (await tx.get(db.collection('game_partner_connections').doc(connectionId))).data();
        if (!connection || connection.status !== 'active' || connection.owner_uid !== device.owner_uid || connection.client_id !== clientId || connection.expires_at_ms <= now)
            throw new PartnerError(400, 'access_denied', 'This game connection is no longer active.');
        tx.create(db.collection('game_partner_tokens').doc(hashGameValue(accessToken)), {
            owner_uid: connection.owner_uid, client_id: clientId, connection_id: connectionId,
            scopes: [...PARTNER_SCOPES], expires_at_ms: connection.expires_at_ms, cleanup_at_ms: now + PARTNER_RETENTION_MS,
        });
        tx.update(deviceRef, { status: 'used' });
        return { value: { accessToken, tokenType: 'Bearer', expiresIn: Math.max(0, Math.floor((connection.expires_at_ms - now) / 1000)), expiresAt: connection.expires_at_ms, connectionId, scopes: [...PARTNER_SCOPES] } };
    });
    if (result.error)
        throw result.error;
    return result.value;
}
export async function deviceFromUserCode(tx, rawCode, uid) {
    const code = normalizeUserCode(rawCode);
    const index = (await tx.get(db.collection('game_partner_codes').doc(hashGameValue(code)))).data();
    if (!index || typeof index.device_hash !== 'string')
        throw new PartnerError(404, 'not_found', 'That game code was not found.');
    const ref = db.collection('game_partner_devices').doc(index.device_hash);
    const device = (await tx.get(ref)).data();
    if (!device || device.code_hash !== hashGameValue(code) || (device.owner_uid && device.owner_uid !== uid))
        throw new PartnerError(404, 'not_found', 'That game code was not found.');
    const game = await registeredPartner(tx, device.client_id);
    return { ref, device, game };
}
//# sourceMappingURL=gamePartnerCore.js.map